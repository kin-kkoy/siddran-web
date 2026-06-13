import { useState, useMemo, useEffect, useCallback } from 'react'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import styles from './Calendar.module.css'
import MonthView from '../../components/Calendar/views/MonthView.jsx'
import WeekView from '../../components/Calendar/views/WeekView.jsx'
import DayView from '../../components/Calendar/views/DayView.jsx'
import EventModal from '../../components/Calendar/EventModal.jsx'
import { useCalendar } from '../../hooks/useCalendar.js'
import { useCalendarTasks } from '../../hooks/useCalendarTasks.js'
import {
    isoDate, parseISODate, monthGridDays, mondayOf, addDays,
    MONTH_NAMES, MONTH_NAMES_SHORT, DAY_NAMES, timeOf, taskDueStamp,
} from '../../components/Calendar/calendarDates.js'

const VIEW_KEY = 'cinder_cal_last_view'
const VIEWS = ['day', 'week', 'month']

// Full-route Calendar. Month grid + Week/Day time-grids over a shared derivation layer, with
// standalone blocks, a read-only task/daily overlay, drag-to-reschedule, and an unscheduled
// drawer (Day view). The peek drawer arrives in P4.
function Calendar({ events, addEvent, updateEvent, deleteEvent, dailyTasks, patchTaskInCache, authFetch, API }) {
    const [view, setView] = useState(() => {
        const v = localStorage.getItem(VIEW_KEY)
        return VIEWS.includes(v) ? v : 'month'
    })
    const [focusedDay, setFocusedDay] = useState(() => isoDate(new Date()))
    const [modal, setModal] = useState(null) // { mode, draft } | null

    useEffect(() => { localStorage.setItem(VIEW_KEY, view) }, [view])

    const anchor = useMemo(() => parseISODate(focusedDay), [focusedDay])
    const monthDate = useMemo(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1), [anchor])

    // Visible window depends on the view: month grid / week / single day.
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

    // All dated tasks are fetched once; every month/view switch derives in memory (no refetch).
    const { tasks, undated, retimeTask, scheduleTask } = useCalendarTasks(authFetch, API, true)

    // Calendar owns the PUT (retimeTask); patchTaskInCache also syncs the app-level useTasks cache
    // so TasksHub reflects the new date live (no page refresh), without a second request.
    const onTaskRetime = useCallback((id, patch) => {
        retimeTask(id, patch)
        patchTaskInCache?.(id, patch)
    }, [retimeTask, patchTaskInCache])

    const { itemsAt, retime } = useCalendar({ events, tasks, dailyTasks, range, updateEvent, updateTask: onTaskRetime })

    // ── Navigation (shifts by the active view's unit) ──
    const shift = (dir) => {
        if (view === 'month') {
            setFocusedDay(isoDate(new Date(anchor.getFullYear(), anchor.getMonth() + dir, Math.min(anchor.getDate(), 28))))
        } else if (view === 'week') {
            setFocusedDay(isoDate(addDays(anchor, dir * 7)))
        } else {
            setFocusedDay(isoDate(addDays(anchor, dir)))
        }
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

    // ── Handlers ──
    // Month: click a day → focus + quick-add an all-day block. Week/Day: click a slot → timed block.
    const handleDayClick = useCallback((dayISO) => {
        setFocusedDay(dayISO)
        setModal({ mode: 'create', draft: { title: '', day: dayISO, all_day: true, startTime: '09:00', endTime: '', color: null } })
    }, [])

    const handleSlotClick = useCallback((dayISO, time) => {
        setModal({
            mode: 'create',
            draft: { title: '', day: dayISO, all_day: time == null, startTime: time || '09:00', endTime: '', color: null },
        })
    }, [])

    // Standalone/linked blocks open the edit modal; task/daily overlays are read-only for now.
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

    // Scheduling an unscheduled task: drop on a time slot → that time; drop on the all-day strip
    // → date-level. Also patches the app-level cache so TasksHub reflects it live.
    const handleSchedule = useCallback((taskId, dayISO, time) => {
        const due = taskDueStamp(dayISO, time)
        scheduleTask(taskId, due)
        patchTaskInCache?.(taskId, { due_date: due })
    }, [scheduleTask, patchTaskInCache])

    return (
        <div className={styles.page}>
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
            </div>

            {view === 'month' && (
                <MonthView
                    monthDate={monthDate}
                    focusedDay={focusedDay}
                    itemsAt={itemsAt}
                    onDayClick={handleDayClick}
                    onEventClick={handleEventClick}
                    onRetime={retime}
                />
            )}
            {view === 'week' && (
                <WeekView
                    anchor={anchor}
                    itemsAt={itemsAt}
                    onSlotClick={handleSlotClick}
                    onEventClick={handleEventClick}
                    onRetime={retime}
                />
            )}
            {view === 'day' && (
                <DayView
                    dayISO={focusedDay}
                    itemsAt={itemsAt}
                    onSlotClick={handleSlotClick}
                    onEventClick={handleEventClick}
                    onRetime={retime}
                    undated={undated}
                    onSchedule={handleSchedule}
                />
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
