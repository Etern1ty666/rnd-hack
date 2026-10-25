import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { load, save } from '../lib/store'
import { SECTIONS, type Section } from '../lib/sections'
import { Icon } from './Icon'

export const ALL = 'all'
/** Чаты без группы: «Новый чат» сверху создаёт их; Vi в них отвечает про бизнес, выбранный сейчас. */
export const FREE = 'free'

export interface BizItem {
  id: string
  name: string
  industry: string
  tone: 'ok' | 'risk' | 'short'
}

/** Чат с Vi: заголовок — первый вопрос (или как переименовали), время — последнее сообщение. */
export interface ChatMeta {
  id: string
  title: string
  at: number
}

/** Где чат: группа (id бизнеса или FREE) и его id. */
export interface ChatRef {
  g: string
  id: string
}

interface Props {
  items: BizItem[]
  current: string
  /** Чаты по группам: id бизнеса → его чаты, FREE → чаты без группы. */
  chats: Record<string, ChatMeta[]>
  /** Открытый чат; нет — открыт раздел или сводка. */
  open?: ChatRef
  /** Открытый раздел из меню — подсвечен, как открытый чат. */
  section?: Section
  onSection: (s: Section) => void
  /** Закреплено (обычная колонка) или показано поверх по наведению — тогда кнопку в шапке не рисуем: она остаётся своя, на странице. */
  pinned?: boolean
  /** Кнопка в шапке: свернуть меню (на телефоне — закрыть выезжающее). */
  onCollapse: () => void
  /** Новый чат: FREE — без группы (кнопка сверху и логотип), id бизнеса — сразу в его группе («+» у группы). */
  onNew: (g: string) => void
  onOpen: (g: string, id: string) => void
  onRename: (g: string, id: string, title: string) => void
  onDelete: (g: string, id: string) => void
  /** Перенести чат в другую группу; to = FREE — убрать из группы. */
  onMove: (g: string, id: string, to: string) => void
  /** Открыто меню чата, чат переименовывают или тащат — меню поверх страницы не прячем, даже если курсор ушёл. */
  onBusy?: (busy: boolean) => void
}

type Menu = ChatRef & { view: 'main' | 'move'; sure: boolean }

// в группе сначала столько чатов, дальше — «Показать ещё» (ещё столько же)
const PAGE = 20

/**
 * Левая колонка, как у Claude: сверху кнопка «свернуть» и логотип, ниже «Новый чат», три раздела бизнеса и история.
 * Сначала чаты без группы, под ними группы по бизнесам. Группы сворачиваются; у группы при наведении — «+»:
 * новый чат прямо в ней. У чата при наведении — «⋯» с меню: переименовать, переместить в группу, удалить.
 * Чат можно и перетащить в другую группу. Подсвечен только открытый чат; при наведении — подсветка тусклее.
 */
export function Sidebar({ items, current, chats, open, section, onSection, pinned = true, onCollapse, onNew, onOpen, onRename, onDelete, onMove, onBusy }: Props) {
  const [closed, setClosed] = useState<string[]>(() => load('nav:closed', []))
  useEffect(() => save('nav:closed', closed), [closed])
  // меню чата: чей, что показано (действия или «переместить в») и ждёт ли «удалить» подтверждения
  const [menu, setMenu] = useState<Menu | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // перетаскивание: какой чат тащат и над какой группой он сейчас
  const [drag, setDrag] = useState<ChatRef | null>(null)
  const [drop, setDrop] = useState<string | null>(null)
  // сколько чатов показано в каждой группе
  const [shown, setShown] = useState<Record<string, number>>({})
  // за каким краем списка есть ещё чаты — с той стороны он и растворяется
  const [fade, setFade] = useState({ top: false, bottom: false })
  const more = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const cancelled = useRef(false)
  const menuKey = menu ? `${menu.g}:${menu.id}` : null

  const edges = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const top = el.scrollTop > 1
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setFade((f) => (f.top === top && f.bottom === bottom ? f : { top, bottom }))
  }, [])
  // список меняется (свернули группу, «Показать ещё», новый чат) и окно меняет высоту — края пересчитываем
  useLayoutEffect(edges)
  useEffect(() => {
    window.addEventListener('resize', edges)
    return () => window.removeEventListener('resize', edges)
  }, [edges])

  const busy = !!menu || !!editing || !!drag
  const onBusyRef = useRef(onBusy)
  useEffect(() => { onBusyRef.current = onBusy }, [onBusy])
  useEffect(() => { onBusyRef.current?.(busy) }, [busy])
  useEffect(() => () => onBusyRef.current?.(false), [])

  // меню рисуется поверх страницы (иначе его обрезает прокрутка списка): под «⋯», а не влезает вниз — над ним
  useLayoutEffect(() => {
    const el = box.current
    if (!menu || !more.current || !el) return
    const r = more.current.getBoundingClientRect()
    const h = el.offsetHeight
    const top = r.bottom + 4 + h <= window.innerHeight - 8 ? r.bottom + 4 : Math.max(8, r.top - 4 - h)
    el.style.top = `${top}px`
    el.style.left = `${Math.max(8, Math.min(r.right - el.offsetWidth, window.innerWidth - 8 - el.offsetWidth))}px`
  }, [menu])

  useEffect(() => {
    if (!menuKey) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node) && !more.current?.contains(e.target as Node)) setMenu(null)
    }
    // прокрутили список чатов или изменили окно — меню оторвалось бы от своего чата
    // (переписка рядом прокручивается сама, пока Vi печатает, — её не слушаем)
    const away = () => setMenu(null)
    const list = more.current?.closest('.nav-scroll')
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    list?.addEventListener('scroll', away)
    window.addEventListener('resize', away)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
      list?.removeEventListener('scroll', away)
      window.removeEventListener('resize', away)
    }
  }, [menuKey])

  const toggle = (g: string) => setClosed((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]))
  // «+» у свёрнутой группы — разворачиваем, чтобы новый чат было видно
  const add = (g: string) => {
    setClosed((c) => c.filter((x) => x !== g))
    onNew(g)
  }
  const rename = (r: ChatRef, title: string) => {
    setMenu(null)
    setDraft(title)
    cancelled.current = false
    setEditing(`${r.g}:${r.id}`)
  }
  const commit = (r: ChatRef) => {
    if (!cancelled.current && draft.trim()) onRename(r.g, r.id, draft.trim())
    setEditing(null)
  }
  const remove = (m: Menu) => {
    if (!m.sure) return setMenu({ ...m, sure: true })
    setMenu(null)
    onDelete(m.g, m.id)
  }
  const move = (m: Menu, to: string) => {
    setMenu(null)
    setClosed((c) => c.filter((x) => x !== to))
    onMove(m.g, m.id, to)
  }

  // куда можно бросить чат: в любую другую группу, подсвечиваем ту, что под курсором
  const target = (g: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag || drag.g === g) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (drop !== g) setDrop(g)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop((d) => (d === g ? null : d))
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (drag && drag.g !== g) {
        setClosed((c) => c.filter((x) => x !== g))
        onMove(drag.g, drag.id, g)
      }
      setDrag(null)
      setDrop(null)
    },
  })

  const row = (g: string, c: ChatMeta) => {
    const key = `${g}:${c.id}`
    const title = c.title || 'Новый чат'
    if (editing === key) {
      return (
        <form key={key} className="nav-chat on" onSubmit={(e) => { e.preventDefault(); commit({ g, id: c.id }) }}>
          <input
            className="nav-chat-edit" value={draft} autoFocus aria-label="Название чата"
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit({ g, id: c.id })}
            onKeyDown={(e) => { if (e.key === 'Escape') { cancelled.current = true; setEditing(null) } }}
          />
        </form>
      )
    }
    const on = open?.g === g && open.id === c.id
    const dragged = drag?.g === g && drag.id === c.id
    return (
      <div
        key={key} className={`nav-chat ${on ? 'on' : ''} ${menuKey === key ? 'menu' : ''} ${dragged ? 'dragging' : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', title)
          setMenu(null)
          // перерисовка прямо в dragstart обрывает перетаскивание в Chrome — отмечаем со следующего кадра
          requestAnimationFrame(() => setDrag({ g, id: c.id }))
        }}
        onDragEnd={() => {
          setDrag(null)
          setDrop(null)
        }}
      >
        <button className="nav-chat-open" onClick={() => onOpen(g, c.id)} aria-current={on ? 'page' : undefined}>{title}</button>
        <button
          ref={menuKey === key ? more : undefined} className="nav-chat-more"
          onClick={() => setMenu(menuKey === key ? null : { g, id: c.id, view: 'main', sure: false })}
          aria-label={`Действия с чатом «${title}»`} aria-haspopup="menu" aria-expanded={menuKey === key}
        >
          <Icon name="dots" size={18} stroke={2.8} />
        </button>
      </div>
    )
  }

  // первые чаты группы, дальше — «Показать ещё»; открытый чат виден всегда, даже если он дальше
  const page = (g: string, all: ChatMeta[]) => {
    const limit = shown[g] ?? PAGE
    const rest = all.slice(limit)
    const opened = open?.g === g ? rest.find((c) => c.id === open.id) : undefined
    const left = rest.length - (opened ? 1 : 0)
    return (
      <>
        {all.slice(0, limit).map((c) => row(g, c))}
        {opened && row(g, opened)}
        {left > 0 && (
          <button className="nav-more" onClick={() => setShown((s) => ({ ...s, [g]: limit + PAGE }))}>
            Показать ещё <span>{left}</span>
          </button>
        )}
      </>
    )
  }

  const free = chats[FREE] ?? []
  const menuChat = menu ? chats[menu.g]?.find((c) => c.id === menu.id) : undefined
  const groups = [...items.map((b) => ({ g: b.id, name: b.name })), { g: FREE, name: 'Без группы' }]

  return (
    <nav className="nav">
      <div className="nav-head">
        {pinned ? (
          <button className="icon-btn nav-toggle" onClick={onCollapse} aria-label="Свернуть меню" title="Свернуть меню">
            <Icon name="sidebar" size={20} />
          </button>
        ) : <span className="nav-toggle-slot" />}
        <button className="brand" onClick={() => onNew(FREE)} title="Новый чат" aria-label="Хватит? — новый чат">Хватит<i>?</i></button>
      </div>
      <button className="nav-new" onClick={() => onNew(FREE)}><Icon name="plus" size={20} /> Новый чат</button>
      {SECTIONS.map((x) => (
        <button
          key={x.id} className={`nav-new nav-section ${section === x.id ? 'on' : ''}`} onClick={() => onSection(x.id)}
          aria-current={section === x.id ? 'page' : undefined}
        >
          <Icon name={x.icon} size={20} /> {x.label}
        </button>
      ))}

      <div ref={scroller} className={`nav-scroll ${fade.top ? 'fade-top' : ''} ${fade.bottom ? 'fade-bottom' : ''}`} onScroll={edges}>
        <div className={`nav-free ${drop === FREE ? 'drop' : ''}`} {...target(FREE)}>
          {page(FREE, free)}
          {drag && drag.g !== FREE && !free.length && <p className="nav-drop-hint">Сюда — убрать из группы</p>}
        </div>
        {items.map((b) => {
          const own = chats[b.id] ?? []
          const isOpen = !closed.includes(b.id)
          return (
            <div key={b.id} className={`nav-group ${b.id === current ? 'cur' : ''} ${drop === b.id ? 'drop' : ''}`} {...target(b.id)}>
              <div className="nav-group-head">
                <button className="nav-group-toggle" onClick={() => toggle(b.id)} aria-expanded={isOpen}>
                  <span className="nav-group-name">{b.name}</span>
                  <span className={`nav-caret ${isOpen ? '' : 'closed'}`} aria-hidden="true" />
                </button>
                <button className="nav-group-add" onClick={() => add(b.id)} aria-label={`Новый чат в группе «${b.name}»`} title="Новый чат в этой группе">
                  <Icon name="plus" size={16} stroke={2} />
                </button>
              </div>
              {isOpen && (own.length ? page(b.id, own) : <p className="nav-empty">Нет чатов</p>)}
            </div>
          )
        })}
      </div>

      {menu && menuChat && createPortal(
        <div ref={box} className="nav-menu" role="menu">
          {menu.view === 'main' ? (
            <>
              <button role="menuitem" onClick={() => rename(menu, menuChat.title)}><Icon name="pencil" size={17} /> Переименовать</button>
              <button role="menuitem" onClick={() => setMenu({ ...menu, view: 'move', sure: false })}>
                <Icon name="folder" size={17} /> Переместить в группу <Icon name="chevron" size={16} className="nav-menu-go" />
              </button>
              <span className="nav-menu-sep" role="separator" />
              <button role="menuitem" className={`danger ${menu.sure ? 'sure' : ''}`} onClick={() => remove(menu)}>
                <Icon name="trash" size={17} /> {menu.sure ? 'Точно удалить?' : 'Удалить'}
              </button>
            </>
          ) : (
            <>
              <button className="nav-menu-back" onClick={() => setMenu({ ...menu, view: 'main' })}>
                <Icon name="chevron" size={16} /> Переместить в
              </button>
              {groups.map((x) => (
                <button key={x.g} role="menuitemradio" aria-checked={x.g === menu.g} disabled={x.g === menu.g} onClick={() => move(menu, x.g)}>
                  <span className="nav-menu-check">{x.g === menu.g && <Icon name="check" size={16} stroke={2} />}</span>
                  <span className="nav-menu-name">{x.name}</span>
                </button>
              ))}
            </>
          )}
        </div>,
        document.body,
      )}
    </nav>
  )
}
