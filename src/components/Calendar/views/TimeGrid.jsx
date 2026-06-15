import { useRef, useState, useMemo, useEffect } from 'react'
import styles from './TimeGrid.module.css'
import { isTodayISO, DAY_NAMES } from '../calendarDates'
import {
    HOUR_PX, DAY_PX, MIN_BLOCK_PX, snap15, minutesToY, timeToMinutes, minutesToTime, pointToDayTime, packLanes,
} from './timeGridGeom'

const DRAG_THRESHOLD = 4
const DEFAULT_DUR = 60 // minutes — display height for items without a real end (tasks, dailies, end-less blocks)
const MIN_COL = 150    // px — each day column's minimum width; columns expand to fill, else scroll
const HOURS = Array.from({ length: 24 }, (_, h) => h)

const hourLabel = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`

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

// End-of-block in minutes: a timed block's real end_at, else start + DEFAULT_DUR.
function endMinutesOf(it, startMin) {
    if (it.kind === 'event' && it.source?.end_at && !it.all_day) {
        const e = new Date(it.source.end_at)
        const m = e.getHours() * 60 + e.getMinutes()
        if (m > startMin) return m
    }
    return startMin + DEFAULT_DUR
}

// Continuous-timeline grid for Week (many days) and Day (one). Vertical axis = real time
// (HOUR_PX/hr); blocks are absolutely positioned (top = start, height = duration) and overlaps
// pack into side-by-side lanes. Drag a block to move it (snap 15 min); drag its bottom edge to
// resize (blocks only). Click empty space to create at that time. All-day items sit in the top row.
export default function TimeGrid({ days, itemsAt, ephemeralAt, onSlotClick, onEventClick, onRetime, onResizeEvent, onToggleDaily, onDailyTime, onDailyDone, onJumpToDay }) {
    const scrollRef = useRef(null)
    const sideBySide = days.length === 1 // Day view → render ephemeral dailies; Week → just a badge
    const ephAt = (iso) => (ephemeralAt ? ephemeralAt(iso) : [])

    // Now-line position, refreshed each minute.
    const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
    useEffect(() => {
        const id = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()) }, 60000)
        return () => clearInterval(id)
    }, [])

    // Auto-scroll to the earliest timed item (or ~7 AM) when the day set changes.
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        let earliest = null
        for (const iso of days) for (const it of itemsAt(iso)) if (it.time) {
            const m = timeToMinutes(it.time)
            if (earliest == null || m < earliest) earliest = m
        }
        el.scrollTop = minutesToY(Math.max(0, (earliest ?? 7 * 60) - 30))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days.join('|')])

    // Per-day positioned + lane-packed blocks.
    const dayLayouts = useMemo(() => {
        const map = {}
        for (const iso of days) {
            // Day view also lays out timed ephemeral dailies alongside blocks/tasks; Week doesn't.
            const base = itemsAt(iso).filter(it => it.time)
            const eph = sideBySide ? ephAt(iso).filter(it => it.time) : []
            const timed = [...base, ...eph].map(it => {
                const startMin = timeToMinutes(it.time)
                return { it, startMin, endMin: endMinutesOf(it, startMin) }
            })
            map[iso] = packLanes(timed)
        }
        return map
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [days.join('|'), itemsAt, ephemeralAt, sideBySide])

    // Drag/resize bookkeeping. `dragInfo` drives the live preview (and dims the source block).
    const drag = useRef(null)
    const [dragInfo, setDragInfo] = useState(null) // { key, mode, day, startMin, endMin }

    const onBlockDown = (e, it) => {
        if (it.kind === 'daily' && !it.ephemeral) return // recurring is recurrence-bound; ephemeral is draggable
        const isResize = !!e.target.closest?.('[data-resize]')
        const startMin = timeToMinutes(it.time)
        drag.current = {
            mode: isResize && it.kind === 'event' ? 'resize' : 'move',
            it, startX: e.clientX, startY: e.clientY, dragging: false,
            startMin, endMin: endMinutesOf(it, startMin),
        }
        e.stopPropagation()
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* */ }
    }
    const onBlockMove = (e) => {
        const st = drag.current
        if (!st) return
        if (!st.dragging) {
            if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < DRAG_THRESHOLD) return
            st.dragging = true
        }
        const pt = pointToDayTime(e.clientX, e.clientY)
        if (!pt) return
        if (st.mode === 'move') {
            const start = snap15(pt.minutes)
            const dur = st.endMin - st.startMin
            setDragInfo({ key: st.it.key, mode: 'move', day: pt.day, startMin: start, endMin: start + dur })
        } else {
            const end = Math.max(st.startMin + 15, snap15(pt.minutes))
            setDragInfo({ key: st.it.key, mode: 'resize', day: st.it.day, startMin: st.startMin, endMin: end })
        }
    }
    const onBlockUp = (e, it) => {
        const st = drag.current
        drag.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* */ }
        const info = dragInfo
        setDragInfo(null)
        if (!st?.dragging) { if (it.kind === 'event') onEventClick(it); return }
        // Ephemeral daily: dragging sets its time (drop on the all-day row → untimed); never changes day.
        if (it.ephemeral) {
            const onAllDay = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-allday]')
            onDailyTime?.(it.id, onAllDay ? null : minutesToTime((info ?? st).startMin))
            return
        }
        if (st.mode === 'move' && info) onRetime?.(it, info.day, minutesToTime(info.startMin))
        else if (st.mode === 'resize' && info && it.kind === 'event') onResizeEvent?.(it, info.day, minutesToTime(info.endMin))
    }

    // Click empty column space → create at the clicked (snapped) time.
    const onColClick = (e, iso) => {
        const pt = pointToDayTime(e.clientX, e.clientY)
        onSlotClick(iso, minutesToTime(snap15(pt ? pt.minutes : 9 * 60)))
    }

    const renderBlock = (b) => {
        const it = b.it
        const top = minutesToY(b.startMin)
        const height = Math.max(MIN_BLOCK_PX, minutesToY(b.endMin) - top)
        const widthPct = 100 / b.colCount
        const leftPct = b.colIndex * widthPct
        const recurring = it.kind === 'daily' && !it.ephemeral
        const draggable = !recurring
        const resizable = it.kind === 'event'
        const dim = dragInfo && dragInfo.key === it.key
        return (
            <div
                key={it.key}
                className={[styles.block, srcClass(it), it.ephemeral ? styles.volatile : '', it.planState === 'new' ? styles.draft : '', it.planState === 'edited' ? styles.modified : '', it.done ? styles.done : '', draggable ? styles.draggable : '', dim ? styles.dim : ''].filter(Boolean).join(' ')}
                style={{ top, height, left: `calc(${leftPct}% + 1px)`, width: `calc(${widthPct}% - 2px)`, ...(it.color ? { borderLeftColor: it.color } : {}) }}
                title={it.title}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => onBlockDown(e, it)}
                onPointerMove={draggable ? onBlockMove : undefined}
                onPointerUp={draggable ? (e) => { e.stopPropagation(); onBlockUp(e, it) } : undefined}
            >
                <div className={styles.blockBody}>
                    {it.kind === 'daily' && (
                        <button
                            className={`${styles.dailyCheck} ${it.done ? styles.dailyCheckOn : ''}`}
                            aria-label={it.done ? 'Mark not done' : 'Mark done'}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); it.ephemeral ? onDailyDone?.(it.id, !it.done) : onToggleDaily?.(it.id, it.day, !it.done) }}
                        >{it.done ? '✓' : ''}</button>
                    )}
                    {it.ephemeral && <span className={styles.volatileMark} title="Daily task (expires)">⏳</span>}
                    <span className={styles.bTime}>{it.time}</span>
                    <span className={styles.bTitle}>{it.title}</span>
                </div>
                {resizable && <div className={styles.resizeHandle} data-resize="1" />}
            </div>
        )
    }

    const gridStyle = { gridTemplateColumns: `56px repeat(${days.length}, minmax(${MIN_COL}px, 1fr))` }

    return (
        <div className={styles.wrap}>
          <div className={styles.hscroll}>
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

            {/* All-day row (data-allday → dropping an ephemeral daily here makes it untimed) */}
            <div className={styles.allDayRow} style={gridStyle}>
                <div className={styles.gutterLabel}>all-day</div>
                {days.map(iso => {
                    const allDayItems = itemsAt(iso).filter(it => !it.time)
                    const ephUntimed = sideBySide ? ephAt(iso).filter(it => !it.time) : []
                    const ephCount = sideBySide ? 0 : ephAt(iso).length
                    return (
                        <div key={iso} className={styles.allDayCell} data-col={iso} data-allday="1" onClick={() => onSlotClick(iso, null)}>
                            {allDayItems.map(it => (
                                <div
                                    key={it.key}
                                    className={[styles.chip, srcClass(it), it.planState === 'new' ? styles.draft : '', it.planState === 'edited' ? styles.modified : '', it.done ? styles.done : ''].filter(Boolean).join(' ')}
                                    style={it.color ? { borderLeftColor: it.color } : undefined}
                                    title={it.title}
                                    onClick={(e) => { e.stopPropagation(); if (it.kind === 'event') onEventClick(it) }}
                                >
                                    {it.kind === 'daily' && onToggleDaily && (
                                        <button
                                            className={`${styles.dailyCheck} ${it.done ? styles.dailyCheckOn : ''}`}
                                            aria-label={it.done ? 'Mark not done' : 'Mark done'}
                                            onClick={(e) => { e.stopPropagation(); onToggleDaily(it.id, it.day, !it.done) }}
                                        >{it.done ? '✓' : ''}</button>
                                    )}
                                    <span className={styles.chipTitle}>{it.title}</span>
                                </div>
                            ))}
                            {/* Untimed ephemeral dailies (Day) — drag onto the grid to give them a time */}
                            {ephUntimed.map(it => (
                                <div
                                    key={it.key}
                                    className={[styles.chip, styles.srcDaily, styles.volatile, styles.draggable, it.planState === 'edited' ? styles.modified : '', it.done ? styles.done : ''].filter(Boolean).join(' ')}
                                    title={it.title}
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => onBlockDown(e, it)}
                                    onPointerMove={onBlockMove}
                                    onPointerUp={(e) => { e.stopPropagation(); onBlockUp(e, it) }}
                                >
                                    <button
                                        className={`${styles.dailyCheck} ${it.done ? styles.dailyCheckOn : ''}`}
                                        aria-label={it.done ? 'Mark not done' : 'Mark done'}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); onDailyDone?.(it.id, !it.done) }}
                                    >{it.done ? '✓' : ''}</button>
                                    <span className={styles.volatileMark}>⏳</span>
                                    <span className={styles.chipTitle}>{it.title}</span>
                                </div>
                            ))}
                            {/* Week: just a badge → jump into that day's Day view */}
                            {ephCount > 0 && (
                                <button className={styles.ephBadge} onClick={(e) => { e.stopPropagation(); onJumpToDay?.(iso) }} title="Daily tasks — open Day view">
                                    ⏳ {ephCount} {ephCount === 1 ? 'daily' : 'dailies'}
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Scrollable timeline */}
            <div className={styles.body} ref={scrollRef}>
                <div className={styles.grid} style={gridStyle}>
                    {/* Hour gutter */}
                    <div className={styles.gutter} style={{ height: DAY_PX }}>
                        {HOURS.map(h => (
                            <div key={h} className={styles.hourLabel} style={{ top: h * HOUR_PX }}>{hourLabel(h)}</div>
                        ))}
                    </div>

                    {/* Day columns */}
                    {days.map(iso => (
                        <div
                            key={iso}
                            className={`${styles.col} ${isTodayISO(iso) ? styles.colToday : ''}`}
                            data-col={iso}
                            style={{ height: DAY_PX }}
                            onClick={(e) => onColClick(e, iso)}
                        >
                            {HOURS.map(h => <div key={h} className={styles.hourLine} style={{ top: h * HOUR_PX }} />)}

                            {isTodayISO(iso) && (
                                <div className={styles.nowLine} style={{ top: minutesToY(nowMin) }}><span className={styles.nowDot} /></div>
                            )}

                            {dayLayouts[iso].map(renderBlock)}

                            {dragInfo && dragInfo.day === iso && (
                                <div
                                    className={styles.preview}
                                    style={{ top: minutesToY(dragInfo.startMin), height: Math.max(MIN_BLOCK_PX, minutesToY(dragInfo.endMin) - minutesToY(dragInfo.startMin)) }}
                                >
                                    {minutesToTime(dragInfo.startMin)}{dragInfo.mode === 'resize' ? `–${minutesToTime(dragInfo.endMin)}` : ''}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
          </div>
        </div>
    )
}
