import { useRef, useState, useEffect } from 'react'
import styles from './TimeGrid.module.css'
import { isTodayISO, DAY_NAMES } from '../calendarDates'
import { HOUR_H, fmtMin, slotFromPoint } from './timeGridGeom'

const SCROLL_TO_HOUR = 7      // initial vertical scroll
const DRAG_THRESHOLD = 4

const hourLabel = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`

// Minutes-of-day for a timed item, or null if it belongs in the all-day row.
function timedInfo(item) {
    if (item.kind === 'task') {
        if (!item.time) return null // midnight → all-day
        const [h, m] = item.time.split(':').map(Number)
        const startMin = h * 60 + (m || 0)
        return { startMin, endMin: startMin + 60 }
    }
    if (item.kind === 'event') {
        const e = item.source
        if (e.all_day) return null
        const s = new Date(e.start_at)
        const startMin = s.getHours() * 60 + s.getMinutes()
        let endMin = e.end_at ? (new Date(e.end_at).getHours() * 60 + new Date(e.end_at).getMinutes()) : startMin + 60
        if (endMin <= startMin) endMin = startMin + 30
        return { startMin, endMin }
    }
    if (item.kind === 'daily') {
        if (!item.time) return null
        const [h, m] = item.time.split(':').map(Number)
        const startMin = h * 60 + (m || 0)
        return { startMin, endMin: startMin + 60 }
    }
    return null
}

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

const HOURS = Array.from({ length: 24 }, (_, h) => h)

// Shared time grid for Week (many days) and Day (one day). Renders a sticky day header, an
// all-day row, and a scrollable 24h body with absolutely-positioned timed items, a current-time
// line, click-to-create, click-to-edit, and Pointer-Events drag-to-retime (day + time).
export default function TimeGrid({ days, itemsAt, onSlotClick, onEventClick, onRetime }) {
    const bodyRef = useRef(null)
    const drag = useRef(null)
    const ghostRef = useRef(null)
    const [dragTitle, setDragTitle] = useState(null)
    const [dragOver, setDragOver] = useState(null) // { day, time } drop target while dragging
    const [nowMin, setNowMin] = useState(() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() })

    const timeToY = (t) => { const [h, m] = t.split(':').map(Number); return ((h * 60 + (m || 0)) / 60) * HOUR_H }

    // Scroll the body to ~morning on mount.
    useEffect(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_H
    }, [])

    // Keep the current-time line fresh (once a minute).
    useEffect(() => {
        const id = setInterval(() => { const n = new Date(); setNowMin(n.getHours() * 60 + n.getMinutes()) }, 60000)
        return () => clearInterval(id)
    }, [])

    const positionGhost = (x, y) => {
        if (ghostRef.current) ghostRef.current.style.transform = `translate(${x + 12}px, ${y + 12}px)`
    }

    const onChipPointerDown = (e, item) => {
        if (item.kind === 'daily') return // recurrence-bound
        e.stopPropagation()
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
        const slot = slotFromPoint(e.clientX, e.clientY)
        setDragOver(prev => (prev?.day === slot?.day && prev?.time === slot?.time) ? prev : slot)
    }
    const onChipPointerUp = (e, item) => {
        const st = drag.current
        drag.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op */ }
        setDragTitle(null)
        setDragOver(null)
        if (st?.dragging) {
            // Always delegate to retime (it has its own no-op guards) so an all-day↔timed
            // conversion fires even when the day doesn't change.
            const slot = slotFromPoint(e.clientX, e.clientY)
            if (slot) onRetime?.(item, slot.day, slot.time)
        } else {
            onEventClick(item)
        }
    }

    // Click empty space in a day body column → create a block at the clicked HOUR (floor), so
    // clicking anywhere in the "1 AM" band starts the block at 1:00. (Drag still snaps finer.)
    const onColumnClick = (e, dayISO) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const raw = ((e.clientY - rect.top) / HOUR_H) * 60
        const min = Math.min(Math.max(Math.floor(raw / 60) * 60, 0), 23 * 60)
        onSlotClick(dayISO, fmtMin(min))
    }

    const gridStyle = { '--cols': days.length }

    return (
        <div className={styles.wrap}>
            {/* Day header */}
            <div className={styles.headRow} style={gridStyle}>
                <div className={styles.gutterCorner} />
                {days.map(iso => {
                    const d = new Date(iso + 'T00:00:00')
                    return (
                        <div key={iso} className={`${styles.dayHead} ${isTodayISO(iso) ? styles.todayHead : ''}`}>
                            <span className={styles.dayName}>{DAY_NAMES[d.getDay()]}</span>
                            <span className={styles.dayDate}>{d.getDate()}</span>
                        </div>
                    )
                })}
            </div>

            {/* All-day row */}
            <div className={styles.allDayRow} style={gridStyle}>
                <div className={styles.gutterLabel}>all-day</div>
                {days.map(iso => {
                    const allDayItems = itemsAt(iso).filter(it => timedInfo(it) === null)
                    const allDayOver = dragOver?.day === iso && !dragOver.time
                    return (
                        <div key={iso} className={`${styles.allDayCell} ${allDayOver ? styles.allDayOver : ''}`} data-day={iso} onClick={() => onSlotClick(iso, null)}>
                            {allDayItems.map(it => {
                                const draggable = it.kind !== 'daily'
                                return (
                                    <div
                                        key={it.key}
                                        className={[styles.chip, srcClass(it), it.done ? styles.done : '', draggable ? styles.draggable : ''].filter(Boolean).join(' ')}
                                        style={it.color ? { borderLeftColor: it.color } : undefined}
                                        title={it.title}
                                        onClick={(e) => e.stopPropagation()}
                                        onPointerDown={(e) => onChipPointerDown(e, it)}
                                        onPointerMove={draggable ? onChipPointerMove : undefined}
                                        onPointerUp={draggable ? (e) => { e.stopPropagation(); onChipPointerUp(e, it) } : undefined}
                                    >{it.title}</div>
                                )
                            })}
                        </div>
                    )
                })}
            </div>

            {/* Scrollable body */}
            <div className={styles.body} ref={bodyRef}>
                <div className={styles.grid} style={{ ...gridStyle, height: 24 * HOUR_H }}>
                    {/* hour gutter */}
                    <div className={styles.hours}>
                        {HOURS.map(h => (
                            <div key={h} className={styles.hourLabel} style={{ height: HOUR_H }}>
                                <span>{hourLabel(h)}</span>
                            </div>
                        ))}
                    </div>

                    {/* day columns */}
                    {days.map(iso => {
                        const timed = itemsAt(iso).map(it => ({ it, t: timedInfo(it) })).filter(x => x.t)
                        const colOver = dragOver?.day === iso
                        return (
                            <div
                                key={iso}
                                className={`${styles.col} ${colOver ? styles.colOver : ''}`}
                                data-day={iso}
                                data-slot="time"
                                onClick={(e) => onColumnClick(e, iso)}
                            >
                                {colOver && dragOver.time && (
                                    <div className={styles.dropLine} style={{ top: timeToY(dragOver.time) }} />
                                )}
                                {timed.map(({ it, t }) => {
                                    const draggable = it.kind !== 'daily'
                                    return (
                                        <div
                                            key={it.key}
                                            className={[styles.event, srcClass(it), it.done ? styles.done : '', draggable ? styles.draggable : ''].filter(Boolean).join(' ')}
                                            style={{
                                                top: (t.startMin / 60) * HOUR_H,
                                                height: Math.max(((t.endMin - t.startMin) / 60) * HOUR_H, 16),
                                                ...(it.color ? { borderLeftColor: it.color } : {}),
                                            }}
                                            title={it.title}
                                            onClick={(e) => e.stopPropagation()}
                                            onPointerDown={(e) => onChipPointerDown(e, it)}
                                            onPointerMove={draggable ? onChipPointerMove : undefined}
                                            onPointerUp={draggable ? (e) => { e.stopPropagation(); onChipPointerUp(e, it) } : undefined}
                                        >
                                            {it.time && <span className={styles.eventTime}>{it.time}</span>}
                                            <span className={styles.eventTitle}>{it.title}</span>
                                        </div>
                                    )
                                })}

                                {isTodayISO(iso) && (
                                    <div className={styles.nowLine} style={{ top: (nowMin / 60) * HOUR_H }} />
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {dragTitle && <div ref={ghostRef} className={styles.ghost}>{dragTitle}</div>}
        </div>
    )
}
