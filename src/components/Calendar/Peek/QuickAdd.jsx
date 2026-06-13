import { useState } from 'react'
import styles from './CalendarPeek.module.css'
import { toISOFromParts, dayFullLabel } from '../calendarDates'

// Quick-add a calendar BLOCK on the focused day. v1: title + optional time (else all-day).
// Multi-type (note/task/daily) + recurrence picker are P5. onCreate is useCalendarEvents.addEvent.
export default function QuickAdd({ day, onCreate }) {
    const [title, setTitle] = useState('')
    const [time, setTime] = useState('')

    const submit = () => {
        if (!title.trim()) return
        const allDay = !time
        onCreate({
            title: title.trim(),
            start_at: toISOFromParts(day, allDay ? null : time),
            end_at: null,
            all_day: allDay,
            color: null,
        })
        setTitle('')
        setTime('')
    }

    const onKeyDown = (e) => {
        if (e.key === 'Enter' || ((e.metaKey || e.ctrlKey) && e.key === 'Enter')) {
            e.preventDefault()
            submit()
        }
    }

    return (
        <div className={styles.quick}>
            <input
                className={styles.quickInput}
                type="text"
                value={title}
                placeholder="New block…"
                onChange={e => setTitle(e.target.value)}
                onKeyDown={onKeyDown}
            />
            <div className={styles.quickFoot}>
                <input className={styles.quickTime} type="time" value={time} onChange={e => setTime(e.target.value)} title="Leave empty for all-day" />
                <span className={styles.quickDate}>{dayFullLabel(day)}</span>
                <button className={styles.quickCreate} onClick={submit}>Create</button>
            </div>
        </div>
    )
}
