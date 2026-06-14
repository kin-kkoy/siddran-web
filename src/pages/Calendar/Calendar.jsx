import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiChevronLeft, FiChevronRight, FiMinimize2 } from 'react-icons/fi'
import styles from './Calendar.module.css'
import MonthView from '../../components/Calendar/views/MonthView.jsx'
import WeekView from '../../components/Calendar/views/WeekView.jsx'
import DayView from '../../components/Calendar/views/DayView.jsx'
import EventModal from '../../components/Calendar/EventModal.jsx'
import { useCalendar } from '../../hooks/useCalendar.js'
import { useCalendarView } from '../../contexts/CalendarViewContext.jsx'
import {
    isoDate, parseISODate, monthGridDays, mondayOf, addDays,
    MONTH_NAMES, MONTH_NAMES_SHORT, DAY_NAMES, timeOf, taskDueStamp, toISOFromParts,
} from '../../components/Calendar/calendarDates.js'

const VIEWS = ['day', 'week', 'month']

// Full-route Calendar (also rendered in the half-split pane via mode="half"). View + focused day
// live in CalendarViewContext so the peek, the route, and the half pane all stay in sync. Calendar
// data + task mutations are passed in from App (shared with the peek — single fetch).
function Calendar({ authFetch, API, events, addEvent, updateEvent, deleteEvent, dailyTasks, dailyCompletions, onToggleDaily, tasks, undated, onTaskRetime, onTaskSchedule, onActivate, mode = 'full' }) {
    const { view, setView, focusedDay, setFocusedDay, unpin } = useCalendarView()
    const navigate = useNavigate()
    const [modal, setModal] = useState(null) // { mode, draft } | null

    // Deep-link a linked block to its target. note/sandbox have real detail routes; task/daily/
    // project open their detail modal in TasksHub via a query param the TasksHub bridge consumes.
    const handleOpenLink = useCallback((refType, refId) => {
        if (!refType || !refId) return
        switch (refType) {
            case 'note': navigate(`/notes/${refId}`); break
            case 'sandbox': navigate(`/sandboxes/${refId}`); break
            case 'task': navigate(`/tasks?task=${refId}`); break
            case 'daily': navigate(`/tasks?daily=${refId}`); break
            case 'project': navigate(`/tasks?bundle=${refId}`); break
            default: break
        }
        setModal(null)
    }, [navigate])

    // Tell App to start fetching calendar data (lazy-load) when this route/pane mounts.
    useEffect(() => { onActivate?.() }, [onActivate])

    const anchor = useMemo(() => parseISODate(focusedDay), [focusedDay])
    const monthDate = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1), [anchor])

    const range = useMemo(() => {
        if (view === 'month') {
            const days = monthGridDays(monthDate)
            return { from: days[0], to: days[days.length - 1] }
        }
        if (view === 'week') {
            const ws = mondayOf(anchor)
            return { from: ws, to: addDays(ws, 6) }
        }
        return { from: anchor, to: anchor }
    }, [view, monthDate, anchor])

    const { itemsAt, retime } = useCalendar({ events, tasks, dailyTasks, dailyCompletions, range, updateEvent, updateTask: onTaskRetime })

    const shift = (dir) => {
        if (view === 'month') setFocusedDay(isoDate(new Date(anchor.getFullYear(), anchor.getMonth() + dir, Math.min(anchor.getDate(), 28))))
        else if (view === 'week') setFocusedDay(isoDate(addDays(anchor, dir * 7)))
        else setFocusedDay(isoDate(addDays(anchor, dir)))
    }
    const goToday = () => setFocusedDay(isoDate(new Date()))

    const headerLabel = useMemo(() => {
        if (view === 'month') return `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`
        if (view === 'week') {
            const ws = mondayOf(anchor), we = addDays(ws, 6)
            const left = `${MONTH_NAMES_SHORT[ws.getMonth()]} ${ws.getDate()}`
            const right = ws.getMonth() === we.getMonth() ? `${we.getDate()}` : `${MONTH_NAMES_SHORT[we.getMonth()]} ${we.getDate()}`
            return `${left} – ${right}, ${we.getFullYear()}`
        }
        return `${DAY_NAMES[anchor.getDay()]}, ${MONTH_NAMES_SHORT[anchor.getMonth()]} ${anchor.getDate()} ${anchor.getFullYear()}`
    }, [view, monthDate, anchor])

    const handleDayClick = useCallback((dayISO) => {
        setFocusedDay(dayISO)
        setModal({ mode: 'create', draft: { title: '', day: dayISO, all_day: true, startTime: '09:00', endTime: '', color: null } })
    }, [setFocusedDay])

    const handleSlotClick = useCallback((dayISO, time) => {
        setModal({ mode: 'create', draft: { title: '', day: dayISO, all_day: time == null, startTime: time || '09:00', endTime: '', color: null } })
    }, [])

    const handleEventClick = useCallback((item) => {
        if (item.kind !== 'event') return
        const e = item.source
        setModal({
            mode: 'edit',
            draft: {
                id: e.id,
                title: e.title,
                day: isoDate(new Date(e.start_at)),
                all_day: e.all_day,
                startTime: e.all_day ? '09:00' : timeOf(e.start_at),
                endTime: e.end_at ? timeOf(e.end_at) : '',
                color: e.color || null,
                ref_type: e.ref_type || null,
                ref_id: e.ref_id || null,
            },
        })
    }, [])

    const handleSave = useCallback((payload) => {
        if (modal?.mode === 'edit') updateEvent(modal.draft.id, payload)
        else addEvent(payload)
        setModal(null)
    }, [modal, addEvent, updateEvent])

    const handleDelete = useCallback((id) => { deleteEvent(id); setModal(null) }, [deleteEvent])
    const handleSchedule = useCallback((taskId, dayISO, time) => { onTaskSchedule(taskId, taskDueStamp(dayISO, time)) }, [onTaskSchedule])

    // Drag-resize a block's bottom edge → rewrite its end_at (blocks only; tasks/dailies have no
    // editable duration on the grid).
    const handleResize = useCallback((item, dayISO, endTime) => {
        if (item.kind !== 'event') return
        const newEndISO = toISOFromParts(dayISO, endTime)
        if (newEndISO) updateEvent(item.source.id, { end_at: newEndISO })
    }, [updateEvent])

    return (
        <div className={`${styles.page} ${mode === 'half' ? styles.pageHalf : ''}`}>
            <div className={styles.head}>
                <h1 className={styles.title}>Cal<span className={styles.accent}>endar</span></h1>

                <div className={styles.monthNav}>
                    <button className={styles.navBtn} onClick={() => shift(-1)} aria-label="Previous"><FiChevronLeft /></button>
                    <button className={styles.todayBtn} onClick={goToday}>Today</button>
                    <button className={styles.navBtn} onClick={() => shift(1)} aria-label="Next"><FiChevronRight /></button>
                    <span className={styles.monthLabel}>{headerLabel}</span>
                </div>

                <div className={styles.spacer} />

                <div className={styles.seg}>
                    {VIEWS.map(v => (
                        <button key={v} className={view === v ? styles.segOn : ''} onClick={() => setView(v)}>{v}</button>
                    ))}
                </div>

                {mode === 'half' && (
                    <button className={styles.collapseBtn} onClick={unpin} title="Collapse to peek"><FiMinimize2 /></button>
                )}
            </div>

            {view === 'month' && (
                <MonthView monthDate={monthDate} focusedDay={focusedDay} itemsAt={itemsAt} onDayClick={handleDayClick} onEventClick={handleEventClick} onRetime={retime} onToggleDaily={onToggleDaily} />
            )}
            {view === 'week' && (
                <WeekView anchor={anchor} itemsAt={itemsAt} onSlotClick={handleSlotClick} onEventClick={handleEventClick} onRetime={retime} onResizeEvent={handleResize} onToggleDaily={onToggleDaily} />
            )}
            {view === 'day' && (
                <DayView dayISO={focusedDay} itemsAt={itemsAt} onSlotClick={handleSlotClick} onEventClick={handleEventClick} onRetime={retime} onResizeEvent={handleResize} undated={undated} onSchedule={handleSchedule} onToggleDaily={onToggleDaily} />
            )}

            {modal && (
                <EventModal mode={modal.mode} draft={modal.draft} onSave={handleSave} onDelete={handleDelete} onClose={() => setModal(null)} onOpenLink={handleOpenLink} authFetch={authFetch} API={API} />
            )}
        </div>
    )
}

export default Calendar
