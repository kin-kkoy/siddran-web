import { Fragment, useRef, useState, useMemo } from 'react'
import { LuEyeOff, LuEye } from 'react-icons/lu'
import styles from './TimeGrid.module.css'
import { isTodayISO, DAY_NAMES } from '../calendarDates'
import { slotFromPoint } from './timeGridGeom'

const DRAG_THRESHOLD = 4

const pad = (n) => String(n).padStart(2, '0')
const hourLabel = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`
const itemHour = (it) => (it.time ? Number(it.time.split(':')[0]) : null)

// Group an hour cell's items by exact time into ordered sub-rows (8:00 before 8:15 …). Same-time
// items end up in one sub-row, laid side-by-side.
function groupByTime(items) {
    const map = new Map()
    for (const it of items) {
        const key = it.time || '00:00'
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(it)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(e => e[1])
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

// Hour-bucket grid for Week (many days) and Day (one day). Each hour is a CELL that auto-expands
// to fit its blocks — no overlap, no absolute positioning. Day lays a cell's blocks side-by-side;
// Week stacks them (narrow columns). All-day items sit in the all-day row. Clicking a cell creates
// a block at that hour; dragging a block onto a cell moves it to that hour/day.
export default function TimeGrid({ days, itemsAt, onSlotClick, onEventClick, onRetime, onToggleDaily }) {
    const sideBySide = days.length === 1 // Day view → side-by-side; Week → stacked
    const nowHour = new Date().getHours()

    // Hidden hours are per-view: Day and Week keep independent sets, persisted under separate keys.
    const hiddenKey = `cinder_cal_hidden_hours_${sideBySide ? 'day' : 'week'}`
    const [hiddenHours, setHiddenHours] = useState(() => {
        try { const a = JSON.parse(localStorage.getItem(hiddenKey)); return new Set(Array.isArray(a) ? a : []) } catch { return new Set() }
    })
    const anchorRef = useRef(null)
    const persistHidden = (set) => { try { localStorage.setItem(hiddenKey, JSON.stringify([...set])) } catch { /* */ } }
    const hideHour = (h, shift) => {
        setHiddenHours(prev => {
            const next = new Set(prev)
            if (shift && anchorRef.current != null) {
                const [a, b] = anchorRef.current <= h ? [anchorRef.current, h] : [h, anchorRef.current]
                for (let i = a; i <= b; i++) next.add(i)
            } else {
                next.add(h)
            }
            anchorRef.current = h
            persistHidden(next)
            return next
        })
    }
    const revealHours = (start, end) => {
        setHiddenHours(prev => {
            const next = new Set(prev)
            for (let h = start; h <= end; h++) next.delete(h)
            persistHidden(next)
            return next
        })
    }
    const showAllHours = () => { setHiddenHours(new Set()); persistHidden(new Set()); anchorRef.current = null }

    // Visible hours render contiguously (hidden hours are removed from the timeline entirely, not
    // left in place as a strip). Hidden runs are summarized in a bar under the all-day row.
    const visibleHours = useMemo(() => {
        const out = []
        for (let h = 0; h < 24; h++) if (!hiddenHours.has(h)) out.push(h)
        return out
    }, [hiddenHours])
    const hiddenRuns = useMemo(() => {
        const out = []
        let h = 0
        while (h < 24) {
            if (hiddenHours.has(h)) { const start = h; while (h < 24 && hiddenHours.has(h)) h++; out.push({ start, end: h - 1 }) }
            else h++
        }
        return out
    }, [hiddenHours])

    const drag = useRef(null)
    const ghostRef = useRef(null)
    const [dragTitle, setDragTitle] = useState(null)
    const [dragOver, setDragOver] = useState(null) // { day, hour } | { day, hour: null }

    const positionGhost = (x, y) => {
        if (ghostRef.current) ghostRef.current.style.transform = `translate(${x + 12}px, ${y + 12}px)`
    }

    const onChipPointerDown = (e, item) => {
        if (item.kind === 'daily') return // recurrence-bound
        e.stopPropagation()
        drag.current = { item, startX: e.clientX, startY: e.clientY, dragging: false }
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* */ }
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
        let next = null
        if (slot) {
            if (slot.time) {
                const [hh, mm] = slot.time.split(':').map(Number)
                next = { day: slot.day, hour: hh, quarter: mm / 15 }
            } else {
                next = { day: slot.day, hour: null, quarter: null }
            }
        }
        setDragOver(prev => (prev?.day === next?.day && prev?.hour === next?.hour && prev?.quarter === next?.quarter) ? prev : next)
    }
    const onChipPointerUp = (e, item) => {
        const st = drag.current
        drag.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* */ }
        setDragTitle(null)
        setDragOver(null)
        if (st?.dragging) {
            const slot = slotFromPoint(e.clientX, e.clientY) // already snapped to the 15-min quarter
            if (slot) onRetime?.(item, slot.day, slot.time)
        } else {
            onEventClick(item)
        }
    }

    // Click a cell → create at the clicked 15-min quarter (falls back to the hour top).
    const onCellClick = (e, iso, h) => {
        const slot = slotFromPoint(e.clientX, e.clientY)
        onSlotClick(iso, slot ? slot.time : `${pad(h)}:00`)
    }

    // showTime=false for non-leftmost chips in a sub-row (they share the row's time).
    const renderChip = (it, showTime = true) => {
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
            >
                {it.kind === 'daily' && onToggleDaily && (
                    <button
                        className={`${styles.dailyCheck} ${it.done ? styles.dailyCheckOn : ''}`}
                        aria-label={it.done ? 'Mark not done' : 'Mark done'}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onToggleDaily(it.id, it.day, !it.done) }}
                    >{it.done ? '✓' : ''}</button>
                )}
                {showTime && it.time && <span className={styles.chipTime}>{it.time}</span>}
                <span className={styles.chipTitle}>{it.title}</span>
            </div>
        )
    }

    const renderHour = (h) => (
        <Fragment key={`h${h}`}>
            <div className={styles.timeLabel}>
                <button className={styles.hideHourBtn} title="Hide this hour (shift-click for a range)" onClick={(e) => { e.stopPropagation(); hideHour(h, e.shiftKey) }}><LuEyeOff /></button>
                <span>{hourLabel(h)}</span>
            </div>
            {days.map(iso => {
                const cellItems = itemsAt(iso).filter(it => itemHour(it) === h)
                const over = dragOver?.day === iso && dragOver.hour === h
                const isNow = isTodayISO(iso) && h === nowHour
                const cls = [styles.cell, over ? styles.cellDrop : '', isNow ? styles.cellNow : ''].filter(Boolean).join(' ')
                return (
                    <div key={iso} className={cls} data-day={iso} data-hour={h} onClick={(e) => onCellClick(e, iso, h)}>
                        {over && (
                            <div className={styles.dropGuide}>
                                {[0, 1, 2, 3].map(q => (
                                    <div key={q} className={`${styles.quarter} ${q === dragOver.quarter ? styles.quarterActive : ''}`}>
                                        {q === dragOver.quarter && <span className={styles.quarterLabel}>{pad(h)}:{pad(q * 15)}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {sideBySide
                            ? groupByTime(cellItems).map((group, gi) => (
                                <div key={(group[0].time || '') + gi} className={styles.subRow}>
                                    {group.map((it, idx) => renderChip(it, idx === 0))}
                                </div>
                            ))
                            : cellItems.map(it => renderChip(it, true))}
                    </div>
                )
            })}
        </Fragment>
    )

    const runBlockCount = (run) => {
        let blocks = 0
        for (let h = run.start; h <= run.end; h++) {
            for (const iso of days) blocks += itemsAt(iso).filter(it => itemHour(it) === h).length
        }
        return blocks
    }

    const gridStyle = { gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }

    return (
        <div className={styles.wrap}>
            {/* Day header */}
            <div className={styles.headRow} style={gridStyle}>
                <div className={styles.gutterCorner}>
                    {hiddenHours.size > 0 && (
                        <button className={styles.compactBtn} onClick={showAllHours} title="Show all hours"><LuEye /></button>
                    )}
                </div>
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
                    const allDayItems = itemsAt(iso).filter(it => !it.time)
                    const over = dragOver?.day === iso && dragOver.hour == null
                    return (
                        <div key={iso} className={`${styles.allDayCell} ${over ? styles.cellOver : ''}`} data-day={iso} onClick={() => onSlotClick(iso, null)}>
                            {allDayItems.map(renderChip)}
                        </div>
                    )
                })}
            </div>

            {/* Hidden-hours bar (under the sticky all-day row) — hidden hours leave the timeline and
                show here as pills; click one to reveal that run. */}
            {hiddenRuns.length > 0 && (
                <div className={styles.hiddenBar}>
                    <span className={styles.hiddenBarLabel}>Hidden</span>
                    {hiddenRuns.map(run => {
                        const blocks = runBlockCount(run)
                        return (
                            <button key={run.start} className={styles.hiddenPill} onClick={() => revealHours(run.start, run.end)} title="Show these hours">
                                {hourLabel(run.start)}{run.end > run.start ? ` – ${hourLabel(run.end)}` : ''}{blocks ? ` · ${blocks}` : ''}
                                <LuEye />
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Hour-bucket grid (visible hours only) */}
            <div className={styles.body}>
                <div className={`${styles.grid} ${sideBySide ? styles.sideBySide : styles.stacked}`} style={gridStyle}>
                    {visibleHours.map(h => renderHour(h))}
                </div>
            </div>

            {dragTitle && <div ref={ghostRef} className={styles.ghost}>{dragTitle}</div>}
        </div>
    )
}
