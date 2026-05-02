import { useEffect, useState, useCallback, useRef } from "react"
import { BrowserRouter, Route, Routes, useParams } from 'react-router-dom'
import Sidebar from "./components/Layout/Sidebar/Sidebar.jsx"
import StarCanvas from "./components/Layout/StarCanvas/StarCanvas.jsx"

import NotePage from "./pages/Notes/NotePage.jsx"
import NotesHub from "./pages/Notes/NotesHub.jsx"
import LoginPage from "./pages/Auth/LoginPage.jsx"
import RegisterPage from "./pages/Auth/RegisterPage.jsx"
import TasksHub from "./pages/Tasks/TasksHub.jsx"
import SandBoxes from "./pages/Sandbox/SandBoxes.jsx"
import Calendar from "./pages/Calendar/Calendar.jsx"
import ModsHub from "./pages/Mods/ModsHub.jsx"
import NotFoundPage from "./pages/NotFoundPage.jsx"
import { useNotes } from "./hooks/useNotes.js"
import { useTasks } from "./hooks/useTasks.js"
import { SettingsProvider } from "./contexts/SettingsContext.jsx"
import { ApiProvider } from "./contexts/ApiContext.jsx"
import SettingsPopup from "./components/Settings/SettingsPopup.jsx"
import ToastContainer from "./components/Common/ToastContainer.jsx"
import logger from "./utils/logger.js"

// Wrapper component to get the ID from route parameters
function NotePageWrapper({ notes, notesLoading, editTitle, editBody, updateTags, toggleFavorite, updateColor, exportNote, onNoteChange}){
  const { id } = useParams()

  useEffect(() => {
    onNoteChange(id)
  }, [id, onNoteChange])

  return <NotePage notes={notes} notesLoading={notesLoading} editTitle={editTitle} editBody={editBody} updateTags={updateTags} toggleFavorite={toggleFavorite} updateColor={updateColor} exportNote={exportNote} />
}

function App() {

  const [isAuthed, setIsAuthed] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1090 || window.innerHeight < 600
  })
  const [currentNoteID, setCurrentNoteID] = useState(null)
  const [username, setUsername] = useState(null)

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

  // first and foremost check if user already has token
  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken')
    if(accessToken){
      setIsAuthed(true)
      // get username from the token
      const getUsername = getUsernameToken(accessToken)
      if(getUsername) setUsername(getUsername)
    }
  }, [])

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
    tasks, dailyTasks, bundles, tasksPagination, dailyTasksPagination, bundlesPagination, loadMoreTasks, loadMoreDailyTasks, loadMoreBundles, loadingMore: tasksLoadingMore, loading: tasksLoading, addTask, updateTask, deleteTask, toggleTaskCompletion, addDailyTask, updateDailyTask, deleteDailyTask, toggleDailyTaskCompletion, batchToggleDailyTasks, batchDeleteDailyTasks, addBundle, updateBundle, deleteBundle, addBundleTasks, batchUpdateBundleTasks, toggleBundleTaskCompletion, batchDeleteBundleTasks
  } = useTasks(authFetch, API, isAuthed)


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

  const style = {
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    minHeight: "100vh",
    margin: 0,
    padding: 0,
  };


  return (

    <SettingsProvider authFetch={authFetch} API={API} isAuthed={isAuthed}>
    <ApiProvider authFetch={authFetch} API={API}>
    <div style={style}>

      {/* Background effects */}
      <StarCanvas />
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


          {/* The main page/s (the contents on the right, not sidebar) */}
          <div style={{ flex: 1,
            padding: isAuthed ? '0 40px' : '0',
            overflowY: 'auto',
            backgroundColor: 'transparent',
            minWidth: 0,  /* Allows flex item to shrink below content size */
            position: 'relative',
            zIndex: 5,
          }}>


            <Routes>
              <Route path="/login" element={<LoginPage setIsAuthed={setIsAuthed} setAppUsername={setUsername} />} />
              <Route path="/register" element={<RegisterPage setIsAuthed={setIsAuthed} setAppUsername={setUsername} />} />
              {isAuthed ? (
                <>
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
                      />
                    }
                  />
                  {/* <Route path="/notebooks/:id" element={Notebook} */}

                  <Route path="/tasks" element={tasksHubElement} />
                  <Route path="/sandboxes" element={<SandBoxes />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/mods" element={<ModsHub />} />
                  <Route path="*" element={<NotFoundPage />} />
                </>
              ) : (
                <Route path="*" element={<LoginPage setIsAuthed={setIsAuthed} setAppUsername={setUsername} />} />
              )}
              {/* <Route path="add" element={}/> */}
            </Routes>

          </div>
        </div>

        {/* Settings popup (rendered at app level, controlled by context) */}
        {isAuthed && <SettingsPopup />}

        {/* Toast notifications (always available) */}
        <ToastContainer />

      </BrowserRouter>
    </div>
    </ApiProvider>
    </SettingsProvider>

  )
}

export default App
