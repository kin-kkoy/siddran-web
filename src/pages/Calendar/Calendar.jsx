import { useState, useMemo, useCallback } from 'react'
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
    MONTH_NAMES, MONTH_NAMES_SHORT, DAY_NAMES, timeOf, taskDueStamp,
} from '../../components/Calendar/calendarDates.js'

const VIEWS = ['day', 'week', 'month']

// Full-route Calendar (also rendered in the half-split pane via mode="half"). View + focused day
// live in CalendarViewContext so the peek, the route, and the half pane all stay in sync. Calendar
// data + task mutations are passed in from App (shared with the peek — single fetch).
function Calendar({ events, addEvent, updateEvent, deleteEvent, dailyTasks, tasks, undated, onTaskRetime, onTaskSchedule, mode = 'full' }) {
    const { view, setView, focusedDay, setFocusedDay, unpin } = useCalendarView()
    const [modal, setModal] = useState(null) // { mode, draft } | null

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

    const { itemsAt, retime } = useCalendar({ events, tasks, dailyTasks, range, updateEvent, updateTask: onTaskRetime })

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
                <MonthView monthDate={monthDate} focusedDay={focusedDay} itemsAt={itemsAt} onDayClick={handleDayClick} onEventClick={handleEventClick} onRetime={retime} />
            )}
            {view === 'week' && (
                <WeekView anchor={anchor} itemsAt={itemsAt} onSlotClick={handleSlotClick} onEventClick={handleEventClick} onRetime={retime} />
            )}
            {view === 'day' && (
                <DayView dayISO={focusedDay} itemsAt={itemsAt} onSlotClick={handleSlotClick} onEventClick={handleEventClick} onRetime={retime} undated={undated} onSchedule={handleSchedule} />
            )}

            {modal && (
                <EventModal mode={modal.mode} draft={modal.draft} onSave={handleSave} onDelete={handleDelete} onClose={() => setModal(null)} />
            )}
        </div>
    )
}

export default Calendar
