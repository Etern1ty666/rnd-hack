"""Готовит JSON для демо-фронта из выписок кейса.

Это не финальная модель — упрощённый пайплайн, чтобы интерфейс работал
на настоящих выписках:
  1. категоризация операций правилами по назначению и контрагенту;
  2. поиск регулярных платежей (зарплата, аренда, кредит, ЕНП, вывод себе);
  3. счета клиентов: задержка оплаты по каждому клиенту из «счёт № … от …»;
  4. прогноз остатка на 60 дней + коридор P10–P90 (Монте-Карло);
  5. бэктест на истории: ошибка, покрытие коридора, сравнение с наивными моделями.

Запуск:
  python tools/build_demo_data.py <папка_датасета> web/src/data C047 C065 C012
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HORIZON = 60
N_SIMS = 1000
RNG = np.random.default_rng(42)
DEBUG = False

IN, OUT = "Поступление", "Списание"

# Порядок важен: первое совпавшее правило задаёт категорию.
# (категория, направление, regex по назначению, regex по контрагенту)
RULES = [
    ("owner_in", IN, r"собственн|учредител", None),
    ("loan_in", IN, r"кредит|займ", None),
    ("card", IN, r"эквайринг", None),
    ("sbp", IN, r"СБП|QR", None),
    ("refund_in", IN, r"^\s*возврат", None),
    ("cash", IN, r"наличн|инкассир", None),
    ("marketplace", IN, r"маркетплейс|агентск|оферт", None),
    ("marketplace", IN, None, r"Маркетплейс"),
    ("clients", IN, r".", None),
    ("owner_out", OUT, r"личн|физического лица|дивиденд|займа учредител", None),
    ("transfer_out", OUT, r"собственных средств на расчетный счет", None),
    ("salary", OUT, r"заработн|ГПХ", None),
    ("tax", OUT, r"^\s*(?:ЕНП|Единый налог|Налог|Страхов)", r"Казначейство|ФНС|СФР"),
    ("loan", OUT, r"кредит|лизинг", None),
    ("bank", OUT, r"комисси|POS|терминал", None),
    ("rent", OUT, r"аренд", None),
    ("utilities", OUT, r"электроэнерг|водоснабж|тепл|ТКО|связи|Интернет|газоснабж", None),
    ("marketing", OUT, r"реклам|продвижен", None),
    ("services", OUT, r"бухгалтер|уборк|охран|облачн|подписк|права использования|программ|клининг|юридич|канцтовар|хозтовар", None),
    ("refund_out", OUT, r"^\s*возврат", None),
    ("suppliers", OUT, r".", None),
]

REVENUE_CATS = ["card", "sbp", "cash", "marketplace"]
EXCLUDED_FROM_FORECAST = ["owner_in", "loan_in", "refund_in", "refund_out", "transfer_out"]
RECURRING_CATS = ["salary", "rent", "loan", "utilities", "services", "marketing", "bank", "owner_out"]

DOC_RE = re.compile(r"(?:сч[её]ту?|УПД)\s*№?\s*(\d+)\s*от\s*(\d{2})\.(\d{2})\.(\d{4})", re.I)


def load(dataset: Path):
    companies = pd.read_csv(dataset / "companies.csv", sep=";", dtype=str, encoding="utf-8-sig")
    ops = pd.read_csv(
        dataset / "all_operations.csv", sep=";", encoding="utf-8-sig",
        dtype={"counterparty_inn": str}, parse_dates=["operation_date"],
    )
    # Рабочие дни берём из самих выписок: в них только дни по производственному календарю.
    business_days = pd.DatetimeIndex(sorted(ops.operation_date.unique()))
    return companies, ops, business_days


def categorize(ops: pd.DataFrame) -> pd.Series:
    purpose = ops.payment_purpose.fillna("")
    cp = ops.counterparty_name.fillna("")
    cat = pd.Series(pd.NA, index=ops.index, dtype="object")
    for key, direction, p_re, c_re in RULES:
        m = (ops.direction == direction) & cat.isna()
        if p_re is not None and c_re is not None:
            m &= purpose.str.contains(p_re, case=False, regex=True) | cp.str.contains(c_re, regex=True)
        elif p_re is not None:
            m &= purpose.str.contains(p_re, case=False, regex=True)
        else:
            m &= cp.str.contains(c_re, regex=True)
        cat[m] = key
    # Пустое назначение: берём самую частую категорию этого контрагента в этой выписке.
    empty = purpose.str.strip() == ""
    known = ops[~empty].assign(cat=cat[~empty])
    if empty.any() and len(known):
        mode = known.groupby(["counterparty_name", "direction"]).cat.agg(lambda s: s.value_counts().index[0])
        for i in ops.index[empty]:
            key = (ops.at[i, "counterparty_name"], ops.at[i, "direction"])
            cat[i] = mode.get(key, "other_in" if ops.at[i, "direction"] == IN else "other_out")
    return cat.fillna("other")


def future_business_days(start, n_days):
    """Календарные дни горизонта и признак рабочего дня (выходные + 4 ноября и новогодние)."""
    days = pd.date_range(start + pd.Timedelta(days=1), periods=n_days, freq="D")
    holidays = {"2026-11-04", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08"}
    is_bd = np.array([d.weekday() < 5 and d.strftime("%Y-%m-%d") not in holidays for d in days])
    return days, is_bd


def shift_to_bd(day_idx, is_bd, forward=True):
    i = day_idx
    while 0 <= i < len(is_bd) and not is_bd[i]:
        i += 1 if forward else -1
    return min(max(i, 0), len(is_bd) - 1)


def parse_docs(df):
    rows = []
    for i, p in df.payment_purpose.fillna("").items():
        m = DOC_RE.search(p)
        if m:
            rows.append((i, int(m.group(1)), pd.Timestamp(int(m.group(4)), int(m.group(3)), int(m.group(2)))))
    out = pd.DataFrame(rows, columns=["idx", "doc_no", "doc_date"]).set_index("idx")
    return out.astype({"doc_no": "int64", "doc_date": "datetime64[ns]"})


def build_model(ops: pd.DataFrame, asof: pd.Timestamp, horizon: int, cal_bd: pd.DatetimeIndex):
    """Строит события будущего и симулирует остаток. ops — уже категоризованные операции компании."""
    hist = ops[ops.operation_date <= asof]
    start_balance = float(hist.groupby("operation_date").balance_eod.last().iloc[-1])
    days, is_bd = future_business_days(asof, horizon)
    H = len(days)
    events = []      # разовые/регулярные события с конкретной датой
    sims = np.zeros((N_SIMS, H))

    def day_index(ts):
        return int((ts - days[0]).days)

    # --- 1. Регулярные платежи по категориям ---
    last6 = hist[hist.operation_date > asof - pd.DateOffset(months=6)]
    month_keys = pd.period_range(asof - pd.DateOffset(months=5), asof, freq="M")
    explained = pd.Series(False, index=hist.index)

    sal_type = np.where(last6.payment_purpose.fillna("").str.contains("аванс", case=False), "advance",
                        np.where(last6.payment_purpose.fillna("").str.contains("ГПХ"), "gph", "final"))
    last6 = last6.assign(sub=np.where(last6.cat == "salary", sal_type, ""),
                         ym=last6.operation_date.dt.to_period("M"))
    for (cat, cp, sub), g in last6[last6.cat.isin(RECURRING_CATS)].groupby(["cat", "counterparty_name", "sub"]):
        if sub == "gph":
            continue
        months = g.ym.nunique()
        per_month = len(g) / max(months, 1)
        recent = g[g.ym >= month_keys[-3]].ym.nunique()
        if months < 4 or recent < 2 or per_month > 2.5:
            continue
        monthly = g.groupby("ym").amount.sum()
        amount = float(monthly.iloc[-3:].median())
        if cat == "owner_out":
            # вывод денег нерегулярный: медиана по 6 месяцам с учётом пустых месяцев
            amount = float(monthly.reindex(month_keys, fill_value=0).median())
            if amount <= 0:
                continue
        dom = int(np.median(g.groupby("ym").operation_date.min().dt.day.iloc[-4:]))
        explained.loc[g.index] = True
        explained.loc[hist[(hist.cat == cat) & (hist.counterparty_name == cp)].index] = True
        jitter = {"salary": 0.02, "utilities": 0.1, "owner_out": 0.25, "marketing": 0.15}.get(cat, 0.0)
        title = {
            "salary": "Зарплата: аванс" if sub == "advance" else "Зарплата: расчёт",
            "rent": "Аренда", "loan": "Платёж по кредиту", "utilities": "Коммунальные и связь",
            "services": "Сервисы и подписки", "marketing": "Реклама", "bank": "Комиссия банка",
            "owner_out": "Вы обычно забираете себе",
        }[cat]
        for k in range(0, horizon // 28 + 2):
            month_start = (asof + pd.DateOffset(months=k)).replace(day=1)
            last_day = (month_start + pd.offsets.MonthEnd(0)).day
            ts = month_start.replace(day=min(dom, last_day))
            if ts <= asof or ts > days[-1]:
                continue
            # уже было в этом месяце?
            if k == 0 and ((g.ym == asof.to_period("M")).any()):
                continue
            idx = shift_to_bd(day_index(ts), is_bd, forward=cat not in ("salary", "owner_out"))
            events.append(dict(date=days[idx], amount=-amount, cat=cat, kind="recurring", title=title,
                               cp=cp, source="statement", jitter=jitter, sub=sub))

    # --- 2. ЕНП: 28-го числа, сумма по позиции месяца в квартале ---
    tax = hist[hist.cat == "tax"]
    if len(tax):
        explained.loc[tax.index] = True
        tm = tax.groupby(tax.operation_date.dt.to_period("M")).amount.sum()
        tm = tm[tm.index >= (asof - pd.DateOffset(months=12)).to_period("M")]
        for k in range(1, horizon // 28 + 2):
            ms = (asof + pd.DateOffset(months=k)).replace(day=1) if asof.day > 27 else (asof + pd.DateOffset(months=k - 1)).replace(day=1)
            ts = ms.replace(day=28)
            if ts <= asof or ts > days[-1]:
                continue
            same_pos = tm[[p.month % 3 == ts.month % 3 for p in tm.index]]
            if len(same_pos) == 0:
                continue
            amount = float(same_pos.iloc[-3:].median())
            idx = shift_to_bd(day_index(ts), is_bd, forward=True)
            q_note = " (квартальный)" if ts.month in (1, 4, 7, 10) else ""
            events.append(dict(date=days[idx], amount=-amount, cat="tax", kind="tax", title="Единый налоговый платёж" + q_note,
                               cp="ФНС России", source="tax_calendar", jitter=0.08, sub=""))

    # --- 3. Счета клиентов ---
    clients_out = []
    cl = hist[(hist.cat == "clients")]
    docs = parse_docs(cl)
    cl = cl.join(docs, how="left")
    cl["delay"] = (cl.operation_date - cl.doc_date).dt.days
    all_delays = cl.delay.dropna().values
    max_doc_no = int(docs.doc_no.max()) if len(docs) else 100
    year_ago = asof - pd.DateOffset(months=12)
    for cp, g in cl[cl.operation_date > year_ago].groupby("counterparty_name"):
        gd = g.dropna(subset=["doc_date"])
        doc_tot = gd.groupby("doc_no").agg(doc_date=("doc_date", "first"), amount=("amount", "sum"),
                                           paid=("operation_date", "max"))
        regular = len(doc_tot) >= 4 and g.operation_date.max() > asof - pd.Timedelta(days=90)
        delays = gd.delay.values if len(gd) >= 3 else all_delays
        info = dict(id=f"cl{len(clients_out)}", name=cp, payments=int(len(g)), docs=int(len(doc_tot)),
                    total=float(g.amount.sum()),
                    medianDelay=float(np.median(delays)) if len(delays) else None,
                    p90Delay=float(np.percentile(delays, 90)) if len(delays) else None,
                    delays=[int(x) for x in gd.delay.values[-12:]],
                    lastPayment=g.operation_date.max().strftime("%Y-%m-%d"), regular=bool(regular))
        clients_out.append(info)
        if not regular:
            continue
        explained.loc[g.index] = True
        dd = doc_tot.sort_values("doc_date")
        gap = float(np.median(np.diff(dd.doc_date.values).astype("timedelta64[D]").astype(int))) if len(dd) > 1 else 30
        gap = min(max(gap, 7), 62)
        typical = float(dd.amount.iloc[-6:].median())
        med_delay = float(np.median(delays))
        doc_date = dd.doc_date.iloc[-1]
        while True:
            doc_date = doc_date + pd.Timedelta(days=gap)
            expected = doc_date + pd.Timedelta(days=med_delay)
            if expected > days[-1]:
                break
            if expected <= asof and doc_date <= asof:
                overdue = int((asof - expected).days)
                expected = asof + pd.Timedelta(days=min(3 + overdue // 7, 10))
            else:
                overdue = 0
            if doc_date <= asof:
                kind, source = "invoice", "1c"
                max_doc_no += 1
                doc_no = max_doc_no
            else:
                kind, source, doc_no = "pattern", "statement", None
            idx = shift_to_bd(day_index(expected), is_bd, forward=True)
            events.append(dict(date=days[idx], amount=typical, cat="clients", kind=kind,
                               title="Оплата счёта" if kind == "invoice" else "Ожидаемая оплата",
                               cp=cp, source=source, jitter=0.0, sub="", clientId=info["id"],
                               docNo=doc_no, docDate=doc_date.strftime("%Y-%m-%d"),
                               overdueDays=overdue, delays=list(map(int, delays))))

    # --- 4. Переменные потоки: среднее по дню недели за 8 недель × сезонность ---
    recent = hist[(hist.operation_date > asof - pd.Timedelta(days=56)) & ~explained
                  & ~hist.cat.isin(EXCLUDED_FROM_FORECAST + ["tax"])]
    bd_recent = cal_bd[(cal_bd > asof - pd.Timedelta(days=56)) & (cal_bd <= asof)]
    baseline = []
    for cat, g in recent.groupby("cat"):
        sign = 1 if g.direction.iloc[0] == IN else -1
        daily = g.groupby("operation_date").amount.sum().reindex(bd_recent, fill_value=0.0)
        if daily.sum() == 0:
            continue
        by_wd = daily.groupby(daily.index.day_of_week).mean()
        # Шум: отношения «факт / ожидание» за 16 недель
        long = hist[(hist.operation_date > asof - pd.Timedelta(days=112)) & (hist.cat == cat) & ~explained]
        bd_long = cal_bd[(cal_bd > asof - pd.Timedelta(days=112)) & (cal_bd <= asof)]
        dl = long.groupby("operation_date").amount.sum().reindex(bd_long, fill_value=0.0)
        exp_l = np.array([by_wd.get(d.weekday(), 0.0) for d in dl.index])
        ratios = np.where(exp_l > 0, dl.values / np.where(exp_l > 0, exp_l, 1), 1.0)
        ratios = np.clip(ratios, 0, 4)
        # Сезонность: тот же месяц год назад к последним двум месяцам год назад
        season = {}
        ly = hist[hist.cat == cat].set_index("operation_date").amount
        base_ly = ly[(ly.index > asof - pd.DateOffset(months=14)) & (ly.index <= asof - pd.DateOffset(months=12))].sum() / 2
        for d in days:
            key = d.to_period("M")
            if key in season:
                continue
            m_ly = ly[(ly.index.to_period("M") == (key - 12))].sum()
            season[key] = float(np.clip(m_ly / base_ly, 0.6, 1.6)) if base_ly > 0 and m_ly > 0 else 1.0
        exp = np.array([by_wd.get(d.weekday(), 0.0) * season[d.to_period("M")] if is_bd[i] else 0.0
                        for i, d in enumerate(days)])
        # выходные: эквайринг за выходные приходит в понедельник — уже в среднем по понедельникам
        level = RNG.normal(1.0, 0.08, size=(N_SIMS, 1))
        noise = RNG.choice(ratios, size=(N_SIMS, H)) if len(ratios) else 1.0
        sims += sign * exp[None, :] * noise * level
        baseline.append(dict(cat=cat, sign=sign, values=[round(float(v), 2) for v in exp]))

    # --- 5. События в симуляции ---
    for e in events:
        idx = day_index(e["date"])
        if e["kind"] in ("invoice", "pattern"):
            dl = np.array(e["delays"]) if len(e["delays"]) else np.array([0])
            shift = RNG.choice(dl - np.median(dl), size=N_SIMS).astype(int)
            slip = RNG.random(N_SIMS) < 0.1
            shift = shift + slip * RNG.integers(7, 31, size=N_SIMS)
            target = np.clip(idx + shift, max(0, idx - 10), H)  # H == «за горизонтом»
            for s in range(N_SIMS):
                if target[s] < H:
                    sims[s, target[s]] += e["amount"]
        else:
            amt = e["amount"] * (1 + RNG.normal(0, e["jitter"], size=N_SIMS)) if e["jitter"] else e["amount"]
            if e["cat"] == "owner_out":
                shift = RNG.integers(-2, 3, size=N_SIMS)
                tgt = np.clip(idx + shift, 0, H - 1)
                sims[np.arange(N_SIMS), tgt] += amt
            else:
                sims[:, idx] += amt

    det = np.zeros(H)
    for b in baseline:
        det += b["sign"] * np.array(b["values"])
    for e in events:
        det[day_index(e["date"])] += e["amount"]
    det_bal = start_balance + np.cumsum(det)
    paths = start_balance + np.cumsum(sims, axis=1)
    p10, p50, p90 = np.percentile(paths, [10, 50, 90], axis=0)
    p_neg = (paths < 0).mean(axis=0)
    p_gap = float((paths.min(axis=1) < 0).mean())
    return dict(start_balance=start_balance, days=days, is_bd=is_bd, events=events, baseline=baseline,
                det_bal=det_bal, p10=p10, p50=p50, p90=p90, p_neg=p_neg, p_gap=p_gap,
                clients=clients_out)


def backtest(ops, cal_bd, asof, gaps):
    """Прогоны на истории каждые 14 дней за последние 9 месяцев, горизонт 30 дней."""
    eod = ops.groupby("operation_date").balance_eod.last()
    eod = eod.reindex(cal_bd[(cal_bd >= eod.index[0]) & (cal_bd <= eod.index[-1])]).ffill()
    gap_days = set()
    for g in gaps:
        gap_days.update(pd.date_range(g["start"], g["end"]))
    inject = ops[ops.cat.isin(["owner_in", "loan_in"])].groupby("operation_date").amount.sum()
    cutoffs = [asof - pd.Timedelta(days=30 + 14 * k) for k in range(0, 19)]
    rows, plan_fact, topups = [], None, []
    for c in sorted(cutoffs):
        c = eod.index[eod.index <= c][-1]
        if c < eod.index[0] + pd.Timedelta(days=200):
            continue
        m = build_model(ops, c, 30, cal_bd)
        actual_days = m["days"][m["is_bd"]]
        # пропуски в выписке портят факт — такие окна пропускаем
        if any(d in gap_days for d in pd.date_range(c - pd.Timedelta(days=31), m["days"][-1])):
            continue
        have = eod.reindex(actual_days).ffill().bfill()
        inj = inject.reindex(actual_days, fill_value=0).cumsum()
        adj = have - inj  # «что было бы без ваших пополнений»
        mask = m["is_bd"]
        det, lo, hi, pneg = m["det_bal"][mask], m["p10"][mask], m["p90"][mask], m["p_neg"][mask]
        b0 = m["start_balance"]
        prev = eod[(eod.index > c - pd.Timedelta(days=31)) & (eod.index <= c)]
        for h, d in enumerate(actual_days):
            hd = (d - c).days
            # наивные модели: «остаток не изменится» и «как в прошлом месяце»
            ref = eod[eod.index <= d - pd.Timedelta(days=30)]
            naive_month = b0 + (ref.iloc[-1] - prev.iloc[0]) if len(ref) and len(prev) else b0
            rows.append(dict(c=c, h=hd, actual=adj.iloc[h], det=det[h], lo=lo[h], hi=hi[h], pneg=pneg[h],
                             mid=m["p50"][mask][h],
                             naive_flat=b0, naive_month=naive_month))
        if plan_fact is None or c > plan_fact["cutoff"]:
            plan_fact = dict(cutoff=c, days=[d.strftime("%Y-%m-%d") for d in actual_days],
                             actual=[round(float(x)) for x in have.values], adj=[round(float(x)) for x in adj.values],
                             det=[round(float(x)) for x in det], lo=[round(float(x)) for x in lo],
                             hi=[round(float(x)) for x in hi])
    r = pd.DataFrame(rows)
    if DEBUG:
        r["err"] = r.det - r.actual
        print(r.groupby(pd.cut(r.h, [0, 9, 16, 31])).err.agg(["mean", "median", lambda x: x.abs().mean()]))
        print(r[r.h.between(27, 31)].groupby("c")[["det", "actual", "naive_flat"]].mean().round(-3))
    scale = ops[ops.direction == OUT].groupby(ops.operation_date.dt.to_period("M")).amount.sum().median()

    def mae(col, lo_h, hi_h):
        s = r[(r.h >= lo_h) & (r.h <= hi_h)]
        return float((s[col] - s.actual).abs().mean())

    out = dict(
        cutoffs=int(r.c.nunique()),
        monthlyOutflow=float(scale),
        mae={h: dict(model=mae("det", a, b), flat=mae("naive_flat", a, b), lastMonth=mae("naive_month", a, b))
             for h, (a, b) in {"d7": (5, 9), "d14": (12, 16), "d30": (27, 31)}.items()},
        coverageRaw=float(((r.actual >= r.lo) & (r.actual <= r.hi)).mean()),
    )
    # Калибровка коридора: во сколько раз расширить P10–P90, чтобы туда попадало 80% фактов
    half = ((r.hi - r.lo) / 2).clip(lower=1)
    k = float(np.clip(np.quantile((r.actual - r.mid).abs() / half, 0.8), 1.0, 4.0))
    lo_k, hi_k = r.mid - (r.mid - r.lo) * k, r.mid + (r.hi - r.mid) * k
    out.update(bandScale=k, coverage=float(((r.actual >= lo_k) & (r.actual <= hi_k)).mean()))
    # Разрывы: окна, где без пополнений остаток ушёл бы в минус
    caught, total, leads = 0, 0, []
    for c, g in r.groupby("c"):
        neg = g[g.actual < 0]
        if len(neg):
            total += 1
            first = neg.h.min()
            warn = g[(g.pneg >= 0.3) & (g.h <= first)]
            if len(warn):
                caught += 1
                leads.append(int(first))
    out.update(gapWindows=total, gapCaught=caught, avgLeadDays=float(np.mean(leads)) if leads else None)
    false_alarm = r.groupby("c").apply(lambda g: (g.pneg.max() >= 0.5) and (g.actual.min() >= 0), include_groups=False)
    out["falseAlarms"] = int(false_alarm.sum())
    if plan_fact:
        plan_fact["cutoff"] = plan_fact["cutoff"].strftime("%Y-%m-%d")
    out["planFact"] = plan_fact
    return out


def company_payload(cid, companies, all_ops, cal_bd):
    info = companies.set_index("company_id").loc[cid]
    ops = all_ops[all_ops.company_id == cid].copy()
    dup_mask = ops.duplicated(subset=["operation_date", "amount", "direction", "counterparty_inn", "payment_purpose"], keep="first")
    quality = dict(rows=int(len(ops)), duplicates=int(dup_mask.sum()),
                   emptyPurpose=int(ops.payment_purpose.fillna("").str.strip().eq("").sum()),
                   emptyInn=int(ops.counterparty_inn.isna().sum()))
    ops = ops[~dup_mask]
    ops["cat"] = categorize(ops).values
    # Пропуск в выписке виден по скачку остатка: остаток дня ≠ остаток прошлого дня + движение за день
    net = ops.assign(s=np.where(ops.direction == IN, ops.amount, -ops.amount)).groupby("operation_date").s.sum()
    eod_all = ops.groupby("operation_date").balance_eod.last()
    jump = (eod_all - eod_all.shift(1) - net).iloc[1:]
    gaps = []
    for d, v in jump[jump.abs() > 1].items():
        prev = eod_all.index[eod_all.index.get_loc(d) - 1]
        gaps.append(dict(start=prev.strftime("%Y-%m-%d"), end=d.strftime("%Y-%m-%d"),
                         days=int((d - prev).days), jump=round(float(v))))
    quality["gaps"] = gaps
    quality["refunds"] = int(ops.cat.isin(["refund_in", "refund_out"]).sum())

    asof = ops.operation_date.max()
    m = build_model(ops, asof, HORIZON, cal_bd)

    # История остатка и потоков за 120 дней
    eod = ops.groupby("operation_date").balance_eod.last()
    flows = ops.assign(s=np.where(ops.direction == IN, ops.amount, -ops.amount))
    daily_in = flows[flows.s > 0].groupby("operation_date").s.sum()
    daily_out = -flows[flows.s < 0].groupby("operation_date").s.sum()
    h_idx = eod.index[eod.index > asof - pd.Timedelta(days=120)]
    history = [dict(d=d.strftime("%Y-%m-%d"), b=round(float(eod[d])), i=round(float(daily_in.get(d, 0))),
                    o=round(float(daily_out.get(d, 0)))) for d in h_idx]

    # Категории: последние 90 дней и предыдущие 90
    def cat_sums(a, b):
        w = flows[(flows.operation_date > a) & (flows.operation_date <= b)]
        return {k: round(float(v)) for k, v in w.groupby("cat").amount.sum().items()}
    cats = dict(last90=cat_sums(asof - pd.Timedelta(days=90), asof),
                prev90=cat_sums(asof - pd.Timedelta(days=180), asof - pd.Timedelta(days=90)))
    monthly = flows[flows.operation_date > asof - pd.DateOffset(months=12)]
    cats["monthly"] = [dict(m=str(p), cat=c, v=round(float(v)))
                       for (p, c), v in monthly.groupby([monthly.operation_date.dt.to_period("M"), "cat"]).amount.sum().items()]

    # Пополнения владельцем в истории — «когда приходилось докладывать свои»
    topups = ops[ops.cat == "owner_in"].groupby("operation_date").amount.sum()
    topups = [dict(d=d.strftime("%Y-%m-%d"), amount=round(float(v))) for d, v in topups.items()]

    events = []
    for i, e in enumerate(sorted(m["events"], key=lambda e: e["date"])):
        events.append({k: v for k, v in dict(
            id=f"e{i}", date=e["date"].strftime("%Y-%m-%d"), amount=round(e["amount"]), cat=e["cat"],
            kind=e["kind"], title=e["title"], cp=e["cp"], source=e["source"], clientId=e.get("clientId"),
            docNo=e.get("docNo"), docDate=e.get("docDate"), overdueDays=e.get("overdueDays"),
        ).items() if v is not None})

    det = m["det_bal"]
    bt = backtest(ops, cal_bd, asof, gaps)
    k = bt["bandScale"]
    out_month = float(ops[(ops.direction == OUT) & (ops.operation_date > asof - pd.Timedelta(days=90))
                          & ~ops.cat.isin(["owner_out", "transfer_out"])].amount.sum() / 90)
    return dict(
        company=dict(id=cid, name=info.company_name, inn=info.company_inn, legalForm=info.legal_form,
                     industry=info.industry, firstDate=info.first_operation_date),
        asOf=asof.strftime("%Y-%m-%d"),
        balanceNow=round(m["start_balance"]),
        balanceExact=round(m["start_balance"], 2),
        avgDailyOut=round(out_month),
        history=history,
        forecast=dict(
            days=[d.strftime("%Y-%m-%d") for d in m["days"]],
            businessDay=[bool(x) for x in m["is_bd"]],
            baseline=m["baseline"],
            lo=[round(float(c - (c - a) * k - b)) for a, c, b in zip(m["p10"], m["p50"], det)],
            mid=[round(float(a - b)) for a, b in zip(m["p50"], det)],
            hi=[round(float(c + (a - c) * k - b)) for a, c, b in zip(m["p90"], m["p50"], det)],
            mcPneg=[round(float(x), 3) for x in m["p_neg"]],
            mcPgap=round(m["p_gap"], 3),
        ),
        events=events,
        clients=[c for c in m["clients"] if c["payments"] >= 2],
        categories=cats,
        topups=topups,
        quality=quality,
        backtest=bt,
    )


def main():
    dataset, out_dir, ids = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3:]
    companies, ops, cal_bd = load(dataset)
    out_dir.mkdir(parents=True, exist_ok=True)
    index = []
    for cid in ids:
        payload = company_payload(cid, companies, ops, cal_bd)
        (out_dir / f"{cid}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
        f = payload["forecast"]
        print(cid, payload["company"]["industry"], "остаток", payload["balanceNow"],
              "P(разрыв)", f["mcPgap"], "событий", len(payload["events"]),
              "бэктест", {k: round(v["model"]) for k, v in payload["backtest"]["mae"].items()},
              "покрытие", round(payload["backtest"]["coverageRaw"], 2), "→", round(payload["backtest"]["coverage"], 2),
              "k", round(payload["backtest"]["bandScale"], 2), "разрывы", payload["backtest"]["gapCaught"], "/", payload["backtest"]["gapWindows"])
        index.append(dict(id=cid, name=payload["company"]["name"], industry=payload["company"]["industry"]))
    (out_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
