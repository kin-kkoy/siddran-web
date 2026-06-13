import { useState, useEffect, useCallback } from "react";
import { toast } from "../utils/toast";
import logger from "../utils/logger";
import { isoDate, addDays } from "../components/Calendar/calendarDates";

// Range-scoped task overlay for the Calendar. The app-wide useTasks hook is cursor-paginated
// (~20 rows), so a task dated outside the first page would never plot. This hook instead asks
// the backend for ALL dated tasks in the visible window (GET /tasks?dueFrom=&dueTo=), and owns
// optimistic retime/toggle for them. It's separate from useTasks on purpose — the calendar
// and TasksHub live on different routes and each refetches on mount, so cache divergence is
// a non-issue here.
//
// `range` is { from: Date, to: Date } (local). We pad a day on each side and let the
// derivation layer clip to exact local days, so UTC/boundary skew can't drop an edge task.
export function useCalendarTasks(authFetch, API, isAuthed, range) {

    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(true)

    const fromISO = range?.from ? isoDate(addDays(range.from, -1)) : null
    const toISO = range?.to ? isoDate(addDays(range.to, 2)) : null // exclusive upper bound

    useEffect(() => {
        if (!isAuthed || !fromISO || !toISO) return

        let cancelled = false
        const fetchTasks = async () => {
            try {
                const res = await authFetch(`${API}/tasks?dueFrom=${fromISO}&dueTo=${toISO}`)
                if (res.ok && !cancelled) {
                    const data = await res.json()
                    setTasks(data.tasks || [])
                }
            } catch (error) {
                logger.error('Error fetching calendar tasks:', error)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchTasks()
        return () => { cancelled = true }
    }, [isAuthed, authFetch, API, fromISO, toISO])

    // Drag-retime: rewrite due_date. Optimistic with revert.
    const retimeTask = useCallback(async (id, due_date) => {
        let snapshot = null
        setTasks(prev => {
            snapshot = prev.find(t => t.id === id) ?? null
            return prev.map(t => t.id === id ? { ...t, due_date } : t)
        })

        try {
            const res = await authFetch(`${API}/tasks/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ due_date })
            })
            if (!res.ok) throw new Error('Failed to retime task')
        } catch (error) {
            logger.error('Error retiming task:', error)
            if (snapshot) setTasks(prev => prev.map(t => t.id === id ? snapshot : t))
            toast.error('Could not move that task.')
        }
    }, [authFetch, API])

    const toggleTask = useCallback(async (id, isCompleted) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: isCompleted } : t))
        try {
            await authFetch(`${API}/tasks/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ is_completed: isCompleted })
            })
        } catch (error) {
            logger.error('Error toggling task:', error)
            setTasks(prev => prev.map(t => t.id === id ? { ...t, is_completed: !isCompleted } : t))
        }
    }, [authFetch, API])

    return { tasks, loading, retimeTask, toggleTask }
}
