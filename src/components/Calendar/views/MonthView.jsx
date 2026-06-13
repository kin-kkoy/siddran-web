import { useRef, useState } from 'react'
import styles from './MonthView.module.css'
import { monthGridDays, isoDate, isTodayISO } from '../calendarDates'

// Monday-start weekday header (prototype order).
const WEEK_HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DRAG_THRESHOLD = 4 // px before a press becomes a drag rather than a click

// Map a normalized item to its left-border colour class. A block's own `color` (inline style)
// wins; otherwise we colour by kind / link target.
function srcClass(item) {
    if (item.kind === 'task') return styles.srcTask
    if (item.kind === 'daily') return styles.srcDaily
    if (item.kind === 'event') {
        switch (item.ref_type) {
            case 'note': return styles.srcNote
            case 'project': return styles.srcBundle
            case 'sandbox': return styles.srcSandbox
            case 'task': return styles.srcTask
            case 'daily': return styles.srcDaily
            default: return styles.srcEvent
        }
    }
    return styles.srcEvent
}

// Month grid. `itemsAt(iso)` returns the derived items for a day. Clicking an empty part of a
// cell calls onDayClick (quick-add + focus); clicking a chip calls onEventClick. Dragging a
// chip onto another day calls onRetime(item, newDayISO) — daily chips are recurrence-bound and
// not draggable.
export default function MonthView({ monthDate, focusedDay, itemsAt, onDayClick, onEventClick, onRetime }) {
    const days = monthGridDays(monthDate)

    // Drag bookkeeping kept in a ref so pointer-move doesn't re-render the whole grid; only the
    // ghost label (mount/unmount) and the hovered target day use state.
    const drag = useRef(null)
    const ghostRef = useRef(null)
    const [dragTitle, setDragTitle] = useState(null)
    const [overDay, setOverDay] = useState(null)

    const positionGhost = (x, y) => {
        if (ghostRef.current) ghostRef.current.style.transform = `translate(${x + 12}px, ${y + 12}px)`
    }

    const onChipPointerDown = (e, item) => {
        if (item.kind === 'daily') return // recurrence governs the date — not draggable
        drag.current = { item, startX: e.clientX, startY: e.clientY, dragging: false }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* no-op */ }
    }

    const onChipPointerMove = (e) => {
        const st = drag.current
        if (!st) return
        if (!st.dragging) {
            if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < DRAG_THRESHOLD) return
            st.dragging = true
            setDragTitle(st.item.title)
        }
        positionGhost(e.clientX, e.clientY)
        const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-day]')
        const day = cell ? cell.getAttribute('data-day') : null
        setOverDay(prev => (prev === day ? prev : day))
    }

    const onChipPointerUp = (e, item) => {
        const st = drag.current
        drag.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op */ }
        const target = overDay
        setDragTitle(null)
        setOverDay(null)
        if (st?.dragging) {
            if (target && target !== item.day) onRetime?.(item, target)
        } else {
            onEventClick(item) // below threshold → treat as a click
        }
    }

    return (
        <div className={styles.grid}>
            {WEEK_HEAD.map(d => <div key={d} className={styles.head}>{d}</div>)}

            {days.map(d => {
                const iso = isoDate(d)
                const dim = d.getMonth() !== monthDate.getMonth()
                const items = itemsAt(iso)
                const shown = items.slice(0, 3)
                const more = items.length - shown.length

                const cellCls = [
                    styles.cell,
                    dim ? styles.dim : '',
                    isTodayISO(iso) ? styles.today : '',
                    iso === focusedDay ? styles.focused : '',
                    iso === overDay ? styles.over : '',
                ].filter(Boolean).join(' ')

                return (
                    <div
                        key={iso}
                        data-day={iso}
                        className={cellCls}
                        role="button"
                        tabIndex={0}
                        onClick={() => onDayClick(iso)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onDayClick(iso) }}
                    >
                        <span className={styles.dayNum}>{d.getDate()}</span>

                        {shown.map(it => {
                            const draggable = it.kind !== 'daily'
                            return (
                                <div
                                    key={it.key}
                                    className={[
                                        styles.chip,
                                        srcClass(it),
                                        it.done ? styles.done : '',
                                        draggable ? styles.draggable : '',
                                    ].filter(Boolean).join(' ')}
                                    style={it.color ? { borderLeftColor: it.color } : undefined}
                                    title={it.title}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => { e.stopPropagation(); onChipPointerDown(e, it) }}
                                    onPointerMove={draggable ? onChipPointerMove : undefined}
                                    onPointerUp={draggable ? (e) => { e.stopPropagation(); onChipPointerUp(e, it) } : undefined}
                                >
                                    {it.title}
                                </div>
                            )
                        })}

                        {more > 0 && <span className={styles.more}>+ {more} more</span>}
                    </div>
                )
            })}

            {dragTitle && <div ref={ghostRef} className={styles.ghost}>{dragTitle}</div>}
        </div>
    )
}
