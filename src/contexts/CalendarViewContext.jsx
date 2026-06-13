import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

// Mirrors SandboxViewContext (do NOT modify that file). Drives the Calendar peek drawer and its
// escalation to a half-split. Pin persists across navigation (provider lives at the app root);
// only close() clears it. `view` is persisted to localStorage so the last Day/Week/Month choice
// survives reloads, shared by the peek, the /calendar route, and the half-split pane.
const CalendarViewContext = createContext(null)

export const CAL_VIEW_MODES = {
    HIDDEN: 'hidden',
    PEEK: 'peek',
    HALF: 'half',
    FULL: 'full',
}

const VIEW_KEY = 'cinder_cal_last_view'
const HIDDEN_KEY = 'cinder_cal_hidden_hours'
const VIEWS = ['day', 'week', 'month']

function todayISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarViewProvider({ children }) {
    const [mode, setMode] = useState(CAL_VIEW_MODES.HIDDEN)
    const [pinned, setPinned] = useState(false)
    const [focusedDay, setFocusedDay] = useState(todayISO)
    const [view, setViewState] = useState(() => {
        const v = localStorage.getItem(VIEW_KEY)
        return VIEWS.includes(v) ? v : 'month'
    })

    const setView = useCallback((v) => {
        if (!VIEWS.includes(v)) return
        setViewState(v)
        try { localStorage.setItem(VIEW_KEY, v) } catch { /* ignore */ }
    }, [])

    // Cmd/Ctrl+; — hidden ↔ peek (from half, collapse straight to hidden).
    const toggle = useCallback(() => {
        setMode(m => (m === CAL_VIEW_MODES.HIDDEN ? CAL_VIEW_MODES.PEEK : CAL_VIEW_MODES.HIDDEN))
        setPinned(false)
    }, [])

    // Hidden hours (Day/Week grid) — shared across views so hiding in one applies everywhere.
    const [hiddenHours, setHiddenHours] = useState(() => {
        try { const a = JSON.parse(localStorage.getItem(HIDDEN_KEY)); return new Set(Array.isArray(a) ? a : []) } catch { return new Set() }
    })
    const hiddenAnchor = useRef(null)
    const persistHidden = (set) => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set])) } catch { /* */ } }
    const hideHour = useCallback((h, shift) => {
        setHiddenHours(prev => {
            const next = new Set(prev)
            if (shift && hiddenAnchor.current != null) {
                const [a, b] = hiddenAnchor.current <= h ? [hiddenAnchor.current, h] : [h, hiddenAnchor.current]
                for (let i = a; i <= b; i++) next.add(i)
            } else {
                next.add(h)
            }
            hiddenAnchor.current = h
            persistHidden(next)
            return next
        })
    }, [])
    const revealHours = useCallback((start, end) => {
        setHiddenHours(prev => {
            const next = new Set(prev)
            for (let h = start; h <= end; h++) next.delete(h)
            persistHidden(next)
            return next
        })
    }, [])
    const showAllHours = useCallback(() => { setHiddenHours(new Set()); persistHidden(new Set()); hiddenAnchor.current = null }, [])

    const peek = useCallback(() => { setMode(CAL_VIEW_MODES.PEEK); setPinned(false) }, [])
    const pin = useCallback(() => { setMode(CAL_VIEW_MODES.HALF); setPinned(true) }, [])
    const unpin = useCallback(() => { setMode(CAL_VIEW_MODES.PEEK); setPinned(false) }, [])
    const close = useCallback(() => { setMode(CAL_VIEW_MODES.HIDDEN); setPinned(false) }, [])

    const value = useMemo(() => ({
        mode,
        pinned,
        focusedDay,
        view,
        setFocusedDay,
        setView,
        toggle,
        peek,
        pin,
        unpin,
        close,
        hiddenHours,
        hideHour,
        revealHours,
        showAllHours,
        isHidden: mode === CAL_VIEW_MODES.HIDDEN,
        isPeek: mode === CAL_VIEW_MODES.PEEK,
        isHalf: mode === CAL_VIEW_MODES.HALF,
        isFull: mode === CAL_VIEW_MODES.FULL,
    }), [mode, pinned, focusedDay, view, setView, toggle, peek, pin, unpin, close, hiddenHours, hideHour, revealHours, showAllHours])

    return (
        <CalendarViewContext.Provider value={value}>
            {children}
        </CalendarViewContext.Provider>
    )
}

export function useCalendarView() {
    const ctx = useContext(CalendarViewContext)
    if (!ctx) throw new Error('useCalendarView must be used within <CalendarViewProvider>')
    return ctx
}
