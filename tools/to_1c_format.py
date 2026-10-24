"""Превращает выписку компании из датасета в файл обмена «1С — Клиент банка» (1CClientBankExchange).

Нужен, чтобы показать и проверить загрузку выписки: банки (Сбер, Центр-инвест и др.)
выгружают выписку для 1С именно в таком текстовом формате, в кодировке Windows-1251.
Номера счетов, БИК и корсчета вымышленные.

Запуск:
  python tools/to_1c_format.py <папка_датасета> C023 web/public/samples/sber_1c.txt "СберБизнес"
"""

import random
import sys
from pathlib import Path

import pandas as pd

BANKS = {
    "СберБизнес": ("ПАО СБЕРБАНК", "046015602", "30101810600000000602"),
    "Центр-инвест Бизнес-онлайн": ("ПАО КБ \"ЦЕНТР-ИНВЕСТ\"", "046015762", "30101810100000000762"),
}


def fake_account(rng, prefix):
    return prefix + "".join(str(rng.randint(0, 9)) for _ in range(20 - len(prefix)))


def main():
    dataset, cid, out, sender = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]), sys.argv[4]
    rng = random.Random(cid)
    companies = pd.read_csv(dataset / "companies.csv", sep=";", dtype=str, encoding="utf-8-sig").set_index("company_id")
    info = companies.loc[cid]
    ops = pd.read_csv(dataset / "statements" / f"{cid}.csv", sep=";", encoding="utf-8-sig",
                      dtype={"counterparty_inn": str}).fillna({"payment_purpose": "", "counterparty_inn": "", "counterparty_name": ""})
    ops["operation_date"] = pd.to_datetime(ops.operation_date)
    our = fake_account(rng, "40802810" if info.legal_form == "ИП" else "40702810")
    bank, bik, ks = BANKS[sender]
    cp_acc = {}

    def d(x):
        return x.strftime("%d.%m.%Y")

    first, last = ops.operation_date.min(), ops.operation_date.max()
    day1 = ops[ops.operation_date == first]
    signed = day1.amount.where(day1.direction == "Поступление", -day1.amount).sum()
    opening = float(day1.balance_eod.iloc[0]) - signed
    closing = float(ops[ops.operation_date == last].balance_eod.iloc[0])
    inflow = ops[ops.direction == "Поступление"].amount.sum()
    outflow = ops[ops.direction == "Списание"].amount.sum()

    lines = [
        "1CClientBankExchange", "ВерсияФормата=1.03", "Кодировка=Windows", f"Отправитель={sender}",
        "Получатель=Бухгалтерский учет", f"ДатаСоздания={d(last)}", "ВремяСоздания=18:00:00",
        f"ДатаНачала={d(first)}", f"ДатаКонца={d(last)}", f"РасчСчет={our}", "Документ=Платежное поручение",
        "СекцияРасчСчет", f"ДатаНачала={d(first)}", f"ДатаКонца={d(last)}", f"РасчСчет={our}",
        f"НачальныйОстаток={opening:.2f}", f"ВсегоПоступило={inflow:.2f}", f"ВсегоСписано={outflow:.2f}",
        f"КонечныйОстаток={closing:.2f}", "КонецРасчСчет",
    ]
    for i, r in enumerate(ops.itertuples(), start=1):
        name = r.counterparty_name or "Без наименования"
        if name not in cp_acc:
            cp_acc[name] = fake_account(rng, "40702810" if len(r.counterparty_inn) != 12 else "40802810")
        mine = (info.company_name, info.company_inn, our)
        theirs = (name, r.counterparty_inn, cp_acc[name])
        payer, payee = (mine, theirs) if r.direction == "Списание" else (theirs, mine)
        lines += [
            "СекцияДокумент=Платежное поручение", f"Номер={i}", f"Дата={d(r.operation_date)}", f"Сумма={r.amount:.2f}",
            f"ПлательщикСчет={payer[2]}",
            f"ДатаСписано={d(r.operation_date)}" if r.direction == "Списание" else "ДатаСписано=",
            f"Плательщик=ИНН {payer[1]} {payer[0]}", f"ПлательщикИНН={payer[1]}", f"Плательщик1={payer[0]}",
            f"ПлательщикРасчСчет={payer[2]}", f"ПлательщикБанк1={bank}", f"ПлательщикБИК={bik}", f"ПлательщикКорсчет={ks}",
            f"ПолучательСчет={payee[2]}",
            f"ДатаПоступило={d(r.operation_date)}" if r.direction == "Поступление" else "ДатаПоступило=",
            f"Получатель=ИНН {payee[1]} {payee[0]}", f"ПолучательИНН={payee[1]}", f"Получатель1={payee[0]}",
            f"ПолучательРасчСчет={payee[2]}", f"ПолучательБанк1={bank}", f"ПолучательБИК={bik}", f"ПолучательКорсчет={ks}",
            "ВидОплаты=01", "Очередность=5", f"НазначениеПлатежа={r.payment_purpose}", "КонецДокумента",
        ]
    lines.append("КонецФайла")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(("\r\n".join(lines) + "\r\n").encode("cp1251", errors="replace"))
    print(out, len(ops), "операций", f"{opening:.2f} → {closing:.2f}")


if __name__ == "__main__":
    main()
