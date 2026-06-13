import styles from './MonthView.module.css'
import { monthGridDays, isoDate, isTodayISO } from '../calendarDates'

// Monday-start weekday header (prototype order).
const WEEK_HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

// Month grid. `itemsAt(iso)` returns the derived items for a day; clicking an empty part of a
// cell calls onDayClick (quick-add + focus), clicking a chip calls onEventClick.
export default function MonthView({ monthDate, focusedDay, itemsAt, onDayClick, onEventClick }) {
    const days = monthGridDays(monthDate)

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
                ].filter(Boolean).join(' ')

                return (
                    <div
                        key={iso}
                        className={cellCls}
                        role="button"
                        tabIndex={0}
                        onClick={() => onDayClick(iso)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onDayClick(iso) }}
                    >
                        <span className={styles.dayNum}>{d.getDate()}</span>

                        {shown.map(it => (
                            <div
                                key={it.key}
                                className={[styles.chip, srcClass(it), it.done ? styles.done : ''].filter(Boolean).join(' ')}
                                style={it.color ? { borderLeftColor: it.color } : undefined}
                                title={it.title}
                                onClick={(e) => { e.stopPropagation(); onEventClick(it) }}
                            >
                                {it.title}
                            </div>
                        ))}

                        {more > 0 && <span className={styles.more}>+ {more} more</span>}
                    </div>
                )
            })}
        </div>
    )
}
