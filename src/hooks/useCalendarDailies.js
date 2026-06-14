import { useState, useEffect, useCallback } from "react";
import { toast } from "../utils/toast";
import logger from "../utils/logger";

// Calendar-scoped daily data: ALL recurring dailies (non-paginated — so every recurring row
// plots, not just useTasks' first page) plus their per-day completions. useCalendar expands the
// recurring rows into virtual per-day instances and marks each done if a completion row exists.
//
// Gated on `isAuthed && calendarActive` (same as useCalendarEvents/useCalendarTasks) so non-calendar
// pages fire NO extra requests. Completions are tiny rows; we fetch the user's whole set once and
// derive in memory (zero refetch on month/view navigation), matching the other calendar hooks.
export function useCalendarDailies(authFetch, API, isAuthed) {

    const [recurringDailies, setRecurringDailies] = useState([])
    const [completions, setCompletions] = useState([]) // [{ daily_task_id, date:'YYYY-MM-DD' }]
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!isAuthed) return

        let cancelled = false
        const load = async () => {
            try {
                const [rdRes, cRes] = await Promise.all([
                    authFetch(`${API}/daily-tasks?recurring=1`),
                    authFetch(`${API}/daily-tasks/completions`),
                ])
                if (!cancelled && rdRes.ok) {
                    const d = await rdRes.json()
                    setRecurringDailies(d.dailyTasks || [])
                }
                if (!cancelled && cRes.ok) {
                    const d = await cRes.json()
                    setCompletions(d.completions || [])
                }
            } catch (error) {
                logger.error('Error fetching calendar dailies:', error)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [isAuthed, authFetch, API])

    // Inject a freshly-created recurring daily into the calendar's set (it's created via useTasks,
    // which owns a separate store) so it plots immediately without a refetch. Recurring only.
    const addRecurring = useCallback((row) => {
        if (!row || row.recurrence == null) return
        setRecurringDailies(prev => prev.some(r => r.id === row.id) ? prev : [row, ...prev])
    }, [])

    const keyOf = (c) => `${c.daily_task_id}|${c.date}`

    // Toggle a recurring daily's completion on one date. Optimistic add/remove with revert.
    const toggleCompletion = useCallback(async (dailyTaskId, dateISO, done) => {
        const key = `${dailyTaskId}|${dateISO}`
        const add = () => setCompletions(prev => prev.some(c => keyOf(c) === key) ? prev : [...prev, { daily_task_id: dailyTaskId, date: dateISO }])
        const remove = () => setCompletions(prev => prev.filter(c => keyOf(c) !== key))

        done ? add() : remove()

        try {
            const res = await authFetch(`${API}/daily-tasks/${dailyTaskId}/completions`, {
                method: 'POST',
                body: JSON.stringify({ date: dateISO, done }),
            })
            if (!res.ok) throw new Error('Failed to toggle completion')
        } catch (error) {
            logger.error('Error toggling daily completion:', error)
            done ? remove() : add() // revert
            toast.error('Could not update that check-off.')
        }
    }, [authFetch, API])

    return { recurringDailies, completions, toggleCompletion, addRecurring, loading }
}
