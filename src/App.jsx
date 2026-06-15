import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import Sidebar from "./components/Layout/Sidebar/Sidebar.jsx"
import StarCanvas from "./components/Layout/StarCanvas/StarCanvas.jsx"

import NotePage from "./pages/Notes/NotePage.jsx"
import NotesHub from "./pages/Notes/NotesHub.jsx"
import LoginPage from "./pages/Auth/LoginPage.jsx"
import RegisterPage from "./pages/Auth/RegisterPage.jsx"
import TasksHub from "./pages/Tasks/TasksHub.jsx"
// Sandbox routes are code-split — Konva + perfect-freehand stay out of the
// main bundle until the user actually navigates to /sandboxes.
const SandBoxes   = lazy(() => import("./pages/Sandbox/SandBoxes.jsx"))
const SandBoxPage = lazy(() => import("./pages/Sandbox/SandBoxPage.jsx"))
import Calendar from "./pages/Calendar/Calendar.jsx"
import ModsHub from "./pages/Mods/ModsHub.jsx"
import NotFoundPage from "./pages/NotFoundPage.jsx"
import { useNotes } from "./hooks/useNotes.js"
import { useTasks } from "./hooks/useTasks.js"
import { useCalendarEvents } from "./hooks/useCalendarEvents.js"
import { useCalendarTasks } from "./hooks/useCalendarTasks.js"
import { useCalendarDailies } from "./hooks/useCalendarDailies.js"
import { useCalendarView } from "./contexts/CalendarViewContext.jsx"
import CalendarPeek from "./components/Calendar/Peek/CalendarPeek.jsx"
import { SettingsProvider } from "./contexts/SettingsContext.jsx"
import { ApiProvider } from "./contexts/ApiContext.jsx"
import { SandboxViewProvider } from "./contexts/SandboxViewContext.jsx"
import SettingsPopup from "./components/Settings/SettingsPopup.jsx"
import ToastContainer from "./components/Common/ToastContainer.jsx"
import logger from "./utils/logger.js"

// Lightweight loading state shown while the lazy Sandbox chunk is fetching.
// Kept minimal so it does not flash garishly against the dark Cinder shell.
function SandboxFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.8rem',
      letterSpacing: '0.08em',
    }}>opening sandbox…</div>
  )
}

// Wrapper for the lazy SandBoxPage so route param + notes/tasks props are threaded in.
function SandBoxPageWrapper({ notes, tasks, toggleTaskCompletion }) {
  return <SandBoxPage notes={notes} tasks={tasks} toggleTaskCompletion={toggleTaskCompletion} mode="full" />
}

// Wrapper component to get the ID from route parameters
function NotePageWrapper({ notes, notesLoading, editTitle, editBody, updateTags, toggleFavorite, updateColor, exportNote, onNoteChange, setSidebarCollapsed, lessDistraction, setLessDistraction, tasks, toggleTaskCompletion}){
  const { id } = useParams()

  useEffect(() => {
    onNoteChange(id)
  }, [id, onNoteChange])

  return <NotePage notes={notes} notesLoading={notesLoading} editTitle={editTitle} editBody={editBody} updateTags={updateTags} toggleFavorite={toggleFavorite} updateColor={updateColor} exportNote={exportNote} setSidebarCollapsed={setSidebarCollapsed} lessDistraction={lessDistraction} setLessDistraction={setLessDistraction} tasks={tasks} toggleTaskCompletion={toggleTaskCompletion} />
}

function App() {

  const [isAuthed, setIsAuthed] = useState(false)
  // Gates the first render until the startup token check resolves, so we never
  // flash the login page (or fire protected requests) while a bootstrap refresh
  // is in flight.
  const [authReady, setAuthReady] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1090 || window.innerHeight < 600
  })
  const [currentNoteID, setCurrentNoteID] = useState(null)
  const [username, setUsername] = useState(null)
  // Session-only "less distraction" mode. Set by NotePage; reset when NotePage
  // unmounts. Lifted here so StarCanvas can react and force-disable stars
  // while focus mode is active.
  const [lessDistraction, setLessDistraction] = useState(false)

  // Auto-collapse sidebar on small viewports. One-way: shrink on small,
  // never auto-expand — once big again the user can toggle manually.
  useEffect(() => {
    const checkViewport = () => {
      if (window.innerWidth < 1090 || window.innerHeight < 600) {
        setIsCollapsed(true)
      }
    }
    window.addEventListener('resize', checkViewport)
    return () => window.removeEventListener('resize', checkViewport)
  }, [])

  const API = import.meta.env.VITE_API_URL || 'http://localhost:3000'


  // helper function for getting username from token
  const getUsernameToken = token => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.username
    } catch (error) {
      return null
    }
  }

  // Read the JWT `exp` (seconds since epoch) without verifying the signature —
  // we only use this client-side to decide whether to refresh before firing
  // protected requests. The server still verifies for real.
  const getTokenExp = token => {
    try {
      return JSON.parse(atob(token.split('.')[1])).exp
    } catch {
      return null
    }
  }

  // get token and attach to `Authentication` header AS WELL AS the username
  const getAuthHeaders = useCallback(() => {
    const accessToken = localStorage.getItem('accessToken')
    return{
      'Content-Type': 'application/json',
      'Authorization': accessToken ? `Bearer ${accessToken}` : ''
    }
  }, [])

  const refreshPromiseRef = useRef(null)

  const refreshAuthToken = useCallback(async () => {
    // If a refresh is already in progress, piggyback on it
    if (refreshPromiseRef.current) return refreshPromiseRef.current

    refreshPromiseRef.current = (async () => {
      try {
        const res = await fetch(`${API}/auth/refresh`, {
          method: 'POST',
          credentials: 'include' // auto sends HttpOnly cookie
        })

        if (!res.ok) throw new Error(`Failed to refresh token`)

        const data = await res.json()
        localStorage.setItem(`accessToken`, data.accessToken)
        return data.accessToken

      } catch (refreshTokenError) {
        // failed to refresh token = logout user
        localStorage.removeItem(`accessToken`)
        setIsAuthed(false)
        throw refreshTokenError
      } finally {
        refreshPromiseRef.current = null
      }
    })()

    return refreshPromiseRef.current
  }, [API])

  // Startup auth bootstrap. Runs once on mount. The access token persists in
  // localStorage for days but expires in 15 min, so a stale token here used to
  // make every on-auth request 401 at once (the 401 storm) before recovering.
  // Instead: if the stored token is still valid we authenticate immediately
  // (zero cost); if it's expired/near-expiry we refresh ONCE before flipping
  // isAuthed, so the data hooks fire with a fresh token and never 401.
  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token) {
      setAuthReady(true)
      return
    }

    const exp = getTokenExp(token)
    const stillValid = exp && exp * 1000 > Date.now() + 30_000 // 30s safety margin

    if (stillValid) {
      setIsAuthed(true)
      const u = getUsernameToken(token)
      if (u) setUsername(u)
      setAuthReady(true)
      return
    }

    // Expired/near-expiry: refresh before exposing the app so protected
    // requests never go out with the dead token.
    let cancelled = false
    refreshAuthToken()
      .then(newToken => {
        if (cancelled) return
        setIsAuthed(true)
        const u = getUsernameToken(newToken)
        if (u) setUsername(u)
      })
      .catch(() => {
        // refreshAuthToken already cleared the token + setIsAuthed(false)
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })

    return () => { cancelled = true }
  }, [refreshAuthToken])

  // Proactive token refresh - refreshes access token every 13 minutes
  // (before the 15-minute expiry) so the user never hits a 401 during normal use
  useEffect(() => {
    if (!isAuthed) return

    const interval = setInterval(() => {
      refreshAuthToken().catch(() => {})
    }, 13 * 60 * 1000) // 13 minutes

    return () => clearInterval(interval)
  }, [isAuthed, refreshAuthToken])

  // helper function for AUTHENTICATED FETCH
  const authFetch = useCallback(async (URL, reqProps = {}) => {
    let res = await fetch(URL, {
      ...reqProps,
      credentials: 'include',
      headers: {
        ...getAuthHeaders(),
        ...reqProps.headers
      },
    })

    // If access token has expired (15mins), try to refresh it
    if(res.status === 401) {
      try {

        // First, try to refresh/reset access token
        await refreshAuthToken()

        // If successfully refreshed, then attempt again to call the fetch request
        res = await fetch(URL, {
          ...reqProps,
          credentials: 'include',
          headers: {
            ...getAuthHeaders(),
            ...reqProps.headers
          },
        })

      } catch (refreshError) {
        logger.error(`Token refresh failed:`, refreshError)
        localStorage.removeItem(`accessToken`)
        setIsAuthed(false)
        throw new Error('Session expired. Please login again.')

      }
    }

    return res
  }, [getAuthHeaders, refreshAuthToken])


  // ------------- DATA LOGIC (Adding, deleting, etc. of Notes and Notebooks) ===================================
  const {
    notes, notebooks, loading: notesLoading, notebookNotesById, notesPagination, notebooksPagination, loadMoreNotes, loadMoreNotebooks, loadingMore, addNote, deleteNote, editTitle, editBody, toggleFavorite, updateColor, updateTags, createNotebook, deleteNotebook, toggleFavoriteNotebook, updateNotebookColor, updateNotebookTags, renameNotebook, removeNoteFromNotebook, addNotesToNotebook, importMarkdownFiles, exportNote
  } = useNotes(authFetch, API, isAuthed)

  // ------------- TASKS DATA LOGIC ===================================
  const {
    tasks, dailyTasks, bundles, tasksPagination, dailyTasksPagination, bundlesPagination, loadMoreTasks, loadMoreDailyTasks, loadMoreBundles, loadingMore: tasksLoadingMore, loading: tasksLoading, addTask, updateTask, patchTaskInCache, setDailyTime, deleteTask, toggleTaskCompletion, addDailyTask, updateDailyTask, deleteDailyTask, toggleDailyTaskCompletion, batchToggleDailyTasks, batchDeleteDailyTasks, addBundle, updateBundle, deleteBundle, addBundleTasks, batchUpdateBundleTasks, toggleBundleTaskCompletion, batchDeleteBundleTasks
  } = useTasks(authFetch, API, isAuthed)

  // ------------- CALENDAR DATA LOGIC ===================================
  const calView = useCalendarView()
  // Lazy-load: only fetch calendar data once the calendar is actually used (peek opened/pinned, or
  // the /calendar route mounts) — so Notes/Tasks/etc. don't fire events + task requests on every load.
  const [calendarActive, setCalendarActive] = useState(false)
  const activateCalendar = useCallback(() => setCalendarActive(true), [])
  useEffect(() => { if (!calView.isHidden) setCalendarActive(true) }, [calView.isHidden])

  // Lifted to App level so the root-mounted peek and the /calendar route share one source.
  const {
    events: calendarEvents, addEvent, updateEvent, deleteEvent
  } = useCalendarEvents(authFetch, API, isAuthed && calendarActive)
  const {
    tasks: calendarTasks, undated: calendarUndated, retimeTask, scheduleTask
  } = useCalendarTasks(authFetch, API, isAuthed && calendarActive)
  // Recurring dailies + per-day completions (gated the same way so non-calendar pages stay quiet).
  const {
    recurringDailies, completions: dailyCompletions, toggleCompletion, addRecurring
  } = useCalendarDailies(authFetch, API, isAuthed && calendarActive)
  // Ephemeral ("today's") dailies come from the SHARED useTasks store (single source) so TasksHub
  // add/delete/edit reflect on the calendar live, with no refetch.
  const ephemeralDailies = useMemo(() => dailyTasks.filter(d => d.recurrence == null), [dailyTasks])

  // Calendar owns the PUT; patchTaskInCache also syncs the app-level useTasks cache so TasksHub
  // reflects new dates live (no extra request).
  const onTaskRetime = useCallback((id, patch) => {
    retimeTask(id, patch)
    patchTaskInCache(id, patch)
  }, [retimeTask, patchTaskInCache])
  const onTaskSchedule = useCallback((taskId, due) => {
    scheduleTask(taskId, due)
    patchTaskInCache(taskId, { due_date: due })
  }, [scheduleTask, patchTaskInCache])

  // Quick-Add "Daily": persist via useTasks (so TasksHub shows it) and, if recurring, inject into
  // the calendar's recurring set so it plots immediately (the two stores are separate).
  const onCreateDaily = useCallback(async (title, opts) => {
    const created = await addDailyTask(title, 'normal', opts)
    if (created && created.recurrence != null) addRecurring(created)
    return created
  }, [addDailyTask, addRecurring])

  // Ephemeral-daily edits from the calendar go straight through useTasks (shared store) so both
  // TasksHub and the calendar reflect them: onDailyTime = setDailyTime, onDailyDone = toggleDailyTaskCompletion.

  // Global Cmd/Ctrl+; toggles the peek; Esc closes it (when not typing in a field).
  useEffect(() => {
    if (!isAuthed) return
    const onKey = (e) => {
      const el = document.activeElement
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key === ';') {
        if (typing) return
        e.preventDefault()
        calView.toggle()
      } else if (e.key === 'Escape' && !calView.isHidden && !typing) {
        calView.close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAuthed, calView])

  // Auto-collapse the sidebar while the calendar is pinned to the half-split.
  useEffect(() => {
    if (calView.isHalf) setIsCollapsed(true)
  }, [calView.isHalf])

  // Props shared by the /calendar route and the half-split pane.
  const calendarProps = {
    authFetch, API,
    events: calendarEvents,
    addEvent, updateEvent, deleteEvent,
    dailyTasks: recurringDailies, // all recurring dailies (not useTasks' paginated first page)
    ephemeralDailies,             // active one-off "today's tasks" — Day view + Week/Month badge
    dailyCompletions,
    onToggleDaily: toggleCompletion,
    onDailyTime: setDailyTime,
    onDailyDone: toggleDailyTaskCompletion,
    tasks: calendarTasks,
    undated: calendarUndated,
    onTaskRetime, onTaskSchedule,
    onActivate: activateCalendar,
  }

  // Resizable half-split: halfPct = the calendar pane's width %. Drag the divider to adjust.
  const [halfPct, setHalfPct] = useState(() => {
    const v = Number(localStorage.getItem('cinder_cal_half_pct'))
    return v >= 25 && v <= 75 ? v : 50
  })
  const contentRowRef = useRef(null)
  const leftPaneRef = useRef(null)
  const splitDragRef = useRef(false)
  const latestPctRef = useRef(halfPct)
  const onSplitDown = (e) => { splitDragRef.current = true; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* */ } }
  // Resize imperatively during the drag (no React re-render → the calendar pane doesn't repaint
  // every frame), then commit to state + localStorage on release.
  const onSplitMove = (e) => {
    if (!splitDragRef.current) return
    const r = contentRowRef.current?.getBoundingClientRect()
    if (!r) return
    const pct = Math.min(75, Math.max(25, ((r.right - e.clientX) / r.width) * 100))
    latestPctRef.current = pct
    if (leftPaneRef.current) leftPaneRef.current.style.flex = `0 0 ${100 - pct}%`
  }
  const onSplitUp = (e) => {
    splitDragRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* */ }
    setHalfPct(latestPctRef.current)
    try { localStorage.setItem('cinder_cal_half_pct', String(Math.round(latestPctRef.current))) } catch { /* */ }
  }


  //  Elements area
  const notesHubElement = (
    <NotesHub notes={notes}
    notebooks={notebooks}
    notesLoading={notesLoading}
    notebookNotesById={notebookNotesById}
    notesPagination={notesPagination}
    notebooksPagination={notebooksPagination}
    loadMoreNotes={loadMoreNotes}
    loadMoreNotebooks={loadMoreNotebooks}
    loadingMore={loadingMore}
    addNote={addNote}
    deleteNote={deleteNote}
    toggleFavorite={toggleFavorite}
    updateColor={updateColor}
    createNotebook={createNotebook}
    deleteNotebook={deleteNotebook}
    toggleFavoriteNotebook={toggleFavoriteNotebook}
    updateNotebookColor={updateNotebookColor}
    updateNotebookTags={updateNotebookTags}
    renameNotebook={renameNotebook}
    removeNoteFromNotebook={removeNoteFromNotebook}
    addNotesToNotebook={addNotesToNotebook}
    importMarkdownFiles={importMarkdownFiles}
    authFetch={authFetch}
    API={API}/>
  )
  const tasksHubElement = (
    <TasksHub
      authFetch={authFetch}
      API={API}
      tasks={tasks}
      dailyTasks={dailyTasks}
      tasksPagination={tasksPagination}
      dailyTasksPagination={dailyTasksPagination}
      loadMoreTasks={loadMoreTasks}
      loadMoreDailyTasks={loadMoreDailyTasks}
      loadingMore={tasksLoadingMore}
      loading={tasksLoading}
      addTask={addTask}
      updateTask={updateTask}
      deleteTask={deleteTask}
      toggleTaskCompletion={toggleTaskCompletion}
      addDailyTask={addDailyTask}
      updateDailyTask={updateDailyTask}
      deleteDailyTask={deleteDailyTask}
      toggleDailyTaskCompletion={toggleDailyTaskCompletion}
      batchToggleDailyTasks={batchToggleDailyTasks}
      batchDeleteDailyTasks={batchDeleteDailyTasks}
      bundles={bundles}
      bundlesPagination={bundlesPagination}
      loadMoreBundles={loadMoreBundles}
      addBundle={addBundle}
      updateBundle={updateBundle}
      deleteBundle={deleteBundle}
      addBundleTasks={addBundleTasks}
      batchUpdateBundleTasks={batchUpdateBundleTasks}
      toggleBundleTaskCompletion={toggleBundleTaskCompletion}
      batchDeleteBundleTasks={batchDeleteBundleTasks}
    />
  )

  // --cinder-sidebar-w exposes the sidebar's current width so full-bleed pages
  // (e.g. SandBoxPage) can absolutely-position themselves flush against it
  // without re-implementing the collapse logic.
  const sidebarW = isAuthed ? (isCollapsed ? '70px' : '220px') : '0px'
  const style = {
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    minHeight: "100vh",
    margin: 0,
    padding: 0,
    '--cinder-sidebar-w': sidebarW,
  };

  // Hold the first paint until the startup token check resolves — prevents a
  // login-page flash on reload while the bootstrap refresh is in flight.
  if (!authReady) {
    return <div style={{ ...style, minHeight: '100vh' }} />
  }


  return (

    <SettingsProvider authFetch={authFetch} API={API} isAuthed={isAuthed}>
    <ApiProvider authFetch={authFetch} API={API} isAuthed={isAuthed}>
    <SandboxViewProvider>
    <div style={style}>

      {isAuthed && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(240,184,64,0.3) 30%, rgba(240,184,64,0.5) 50%, rgba(240,184,64,0.3) 70%, transparent 100%)',
          zIndex: 999,
          pointerEvents: 'none',
        }} />
      )}

      <BrowserRouter>
        {/* Background effects — inside Router so StarCanvas can use useLocation() */}
        <StarCanvas lessDistraction={lessDistraction} />
        <div style={{ display: "flex",
          flexDirection: "row",
          height: '100vh',
          margin: 0,
          padding: 0,
          backgroundColor: 'transparent',
          position: 'relative',
          zIndex: 5,
        }}>

          {/* Only show sidebar when logged in */}
          {isAuthed && (
            <Sidebar username={username}
              isCollapsed={isCollapsed}
              toggleSidebar={setIsCollapsed}
              notes={notes}
              notebooks={notebooks}
              currentNoteID={currentNoteID}
              setIsAuthed={setIsAuthed}
            />
          )}


          {/* blank space reserved for fixed sidebar */}
          {isAuthed && (
            <div style={{
              width: isCollapsed ? '70px' : '220px',
              flexShrink: 0,  /* Prevents this from shrinking */
              transition: 'width 0.3s ease'
            }} />
          )}


          {/* The main page/s (the contents on the right, not sidebar). When the calendar is
              pinned, this becomes a 1fr/1fr split: routed content left, calendar pane right. */}
          <div ref={contentRowRef} style={{ flex: 1,
            display: 'flex',
            flexDirection: 'row',
            backgroundColor: 'transparent',
            minWidth: 0,  /* Allows flex item to shrink below content size */
            position: 'relative',
            zIndex: 5,
          }}>
            <div ref={leftPaneRef} style={{
              flex: (isAuthed && calView.isHalf) ? `0 0 ${100 - halfPct}%` : 1,
              padding: isAuthed ? '0 40px' : '0',
              overflowY: 'auto',
              minWidth: 0,
            }}>

            <Routes>
              <Route path="/login" element={<LoginPage setIsAuthed={setIsAuthed} setAppUsername={setUsername} />} />
              <Route path="/register" element={<RegisterPage setIsAuthed={setIsAuthed} setAppUsername={setUsername} />} />
              {isAuthed ? (
                <>
                  <Route path="/" element={notesHubElement} />
                  <Route path="/notes" element={notesHubElement} />
                  <Route path="/notes/:id" element={
                    <NotePageWrapper notes={notes}
                      notesLoading={notesLoading}
                      editTitle={editTitle}
                      editBody={editBody}
                      updateTags={updateTags}
                      toggleFavorite={toggleFavorite}
                      updateColor={updateColor}
                      exportNote={exportNote}
                      onNoteChange={setCurrentNoteID}
                      setSidebarCollapsed={setIsCollapsed}
                      lessDistraction={lessDistraction}
                      setLessDistraction={setLessDistraction}
                      tasks={tasks}
                      toggleTaskCompletion={toggleTaskCompletion}
                      />
                    }
                  />
                  {/* <Route path="/notebooks/:id" element={Notebook} */}

                  <Route path="/tasks" element={tasksHubElement} />
                  <Route path="/sandboxes" element={
                    <Suspense fallback={<SandboxFallback />}>
                      <SandBoxes />
                    </Suspense>
                  } />
                  <Route path="/sandboxes/:id" element={
                    <Suspense fallback={<SandboxFallback />}>
                      <SandBoxPageWrapper notes={notes} tasks={tasks} toggleTaskCompletion={toggleTaskCompletion} />
                    </Suspense>
                  } />
                  <Route path="/calendar" element={<Calendar {...calendarProps} mode="full" />} />
                  <Route path="/mods" element={<ModsHub />} />
                  <Route path="*" element={<NotFoundPage />} />
                </>
              ) : (
                <Route path="*" element={<LoginPage setIsAuthed={setIsAuthed} setAppUsername={setUsername} />} />
              )}
              {/* <Route path="add" element={}/> */}
            </Routes>
            </div>

            {/* Calendar half-split pane (peek pinned) — draggable divider to resize. */}
            {isAuthed && calView.isHalf && (
              <>
                <div
                  onPointerDown={onSplitDown}
                  onPointerMove={onSplitMove}
                  onPointerUp={onSplitUp}
                  title="Drag to resize"
                  style={{ flex: '0 0 6px', cursor: 'col-resize', backgroundColor: 'var(--border-default)', touchAction: 'none', zIndex: 6 }}
                />
                <div style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  overflowY: 'auto',
                  backgroundColor: 'var(--bg-surface)',
                }}>
                  <Calendar {...calendarProps} mode="half" />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Calendar peek drawer (root-mounted so it persists across routes) */}
        {isAuthed && (
          <CalendarPeek
            events={calendarEvents}
            tasks={calendarTasks}
            dailyTasks={recurringDailies}
            dailyCompletions={dailyCompletions}
            onToggleDaily={toggleCompletion}
            addEvent={addEvent}
            onCreateDaily={onCreateDaily}
          />
        )}

        {/* Settings popup (rendered at app level, controlled by context) */}
        {isAuthed && <SettingsPopup />}

        {/* Toast notifications (always available) */}
        <ToastContainer />

      </BrowserRouter>
    </div>
    </SandboxViewProvider>
    </ApiProvider>
    </SettingsProvider>

  )
}

export default App
