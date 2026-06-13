import { useState, useMemo, useEffect, useCallback } from 'react'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import styles from './Calendar.module.css'
import MonthView from '../../components/Calendar/views/MonthView.jsx'
import EventModal from '../../components/Calendar/EventModal.jsx'
import { useCalendar } from '../../hooks/useCalendar.js'
import { useCalendarTasks } from '../../hooks/useCalendarTasks.js'
import {
    isoDate, monthGridDays, MONTH_NAMES, timeOf,
} from '../../components/Calendar/calendarDates.js'

const VIEW_KEY = 'cinder_cal_last_view'
const VIEWS = ['day', 'week', 'month']

// Full-route Calendar. P1 ships the Month view + standalone blocks + read-only task/daily
// overlay; Week/Day grids land in P3, the peek drawer in P4.
function Calendar({ events, addEvent, updateEvent, deleteEvent, dailyTasks, authFetch, API }) {
    const [view, setView] = useState(() => {
        const v = localStorage.getItem(VIEW_KEY)
        return VIEWS.includes(v) ? v : 'month'
    })
    const [monthDate, setMonthDate] = useState(() => {
        const now = new Date()
        return new Date(now.getFullYear(), now.getMonth(), 1)
    })
    const [focusedDay, setFocusedDay] = useState(() => isoDate(new Date()))
    const [modal, setModal] = useState(null) // { mode, draft } | null

    useEffect(() => { localStorage.setItem(VIEW_KEY, view) }, [view])

    // Visible window = the 42-day month grid (covers leading/trailing days of adjacent months).
    const range = useMemo(() => {
        const days = monthGridDays(monthDate)
        return { from: days[0], to: days[days.length - 1] }
    }, [monthDate])

    // Range-scoped task overlay (all dated tasks in view, not just useTasks' first page).
    const { tasks, retimeTask } = useCalendarTasks(authFetch, API, true, range)

    const { itemsAt, retime } = useCalendar({ events, tasks, dailyTasks, range, updateEvent, updateTask: retimeTask })

    const goPrev = () => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    const goNext = () => setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    const goToday = () => {
        const now = new Date()
        setMonthDate(new Date(now.getFullYear(), now.getMonth(), 1))
        setFocusedDay(isoDate(now))
    }

    // Click an empty part of a day → focus it + open the quick create modal prefilled to that day.
    const handleDayClick = useCallback((dayISO) => {
        setFocusedDay(dayISO)
        setModal({
            mode: 'create',
            draft: { title: '', day: dayISO, all_day: true, startTime: '09:00', endTime: '', color: null },
        })
    }, [])

    // Click a chip. Standalone/linked blocks open the edit modal; task/daily overlays are
    // read-only in P1 (click-through to their modals comes with later phases).
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

    const handleDelete = useCallback((id) => {
        deleteEvent(id)
        setModal(null)
    }, [deleteEvent])

    return (
        <div className={styles.page}>
            <div className={styles.head}>
                <h1 className={styles.title}>Cal<span className={styles.accent}>endar</span></h1>

                <div className={styles.monthNav}>
                    <button className={styles.navBtn} onClick={goPrev} aria-label="Previous month"><FiChevronLeft /></button>
                    <button className={styles.todayBtn} onClick={goToday}>Today</button>
                    <button className={styles.navBtn} onClick={goNext} aria-label="Next month"><FiChevronRight /></button>
                    <span className={styles.monthLabel}>{MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}</span>
                </div>

                <div className={styles.spacer} />

                <div className={styles.seg}>
                    {VIEWS.map(v => (
                        <button
                            key={v}
                            className={view === v ? styles.segOn : ''}
                            onClick={() => setView(v)}
                        >{v}</button>
                    ))}
                </div>
            </div>

            {view === 'month' ? (
                <MonthView
                    monthDate={monthDate}
                    focusedDay={focusedDay}
                    itemsAt={itemsAt}
                    onDayClick={handleDayClick}
                    onEventClick={handleEventClick}
                    onRetime={retime}
                />
            ) : (
                <div className={styles.placeholder}>
                    <span className={styles.placeholderIcon}>✦</span>
                    {view === 'week' ? 'Week' : 'Day'} view arrives in a later phase.
                    <small>For now, use Month.</small>
                </div>
            )}

            {modal && (
                <EventModal
                    mode={modal.mode}
                    draft={modal.draft}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    )
}

export default Calendar
