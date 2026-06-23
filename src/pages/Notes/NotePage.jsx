import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import styles from './NotePage.module.css'
import { IoMdArrowRoundBack } from "react-icons/io"
import { FaStar, FaRegStar, FaEllipsisV } from 'react-icons/fa'
import { MdChromeReaderMode } from "react-icons/md";
import { HiPencilSquare } from "react-icons/hi2";
import { HiOutlineDownload, HiOutlineCog, HiOutlineDocumentText } from "react-icons/hi";
import { LuMaximize, LuMinimize } from "react-icons/lu";
import LexicalEditor from '../../components/Editor/LexicalEditor'
import CodeMirrorEditor from '../../components/Editor/CodeMirrorEditor'
import { printNoteToPdf } from '../../components/Editor/utils/exportPdf'
import ConfirmModal from '../../components/Common/ConfirmModal'
import TaskDetailsModal from '../../components/Common/TaskDetailsModal'
import { useApi } from '../../contexts/ApiContext'
import { useSandboxes } from '../../hooks/useSandboxes'
import { useSettings } from '../../contexts/SettingsContext'
import { toast } from '../../utils/toast'
import Skeleton from '../../components/Common/Skeleton'
import { NOTE_COLORS } from '../../components/Notes/noteColors'
import NoteSettingsPopup from '../../components/Settings/NoteSettingsPopup'
import SandboxDock from '../../components/Sandbox/Dock/SandboxDock'
import { useSandboxView } from '../../contexts/SandboxViewContext'

function NotePage({ notes, notesLoading, editTitle, editBody, updateTags, toggleFavorite, updateColor, exportNote, setSidebarCollapsed, lessDistraction = false, setLessDistraction, tasks, toggleTaskCompletion, addNote, updateTask, bundles }) {

  const sandboxView = useSandboxView()
  const { settings } = useSettings()
  const { authFetch, API } = useApi()
  const { sandboxes, sandboxesLoaded } = useSandboxes()

  // Auto-collapse the sidebar when the sandbox dock expands to half mode so the
  // editor + sandbox columns have room to breathe.
  useEffect(() => {
    if (sandboxView.isHalf && setSidebarCollapsed) setSidebarCollapsed(true)
  }, [sandboxView.isHalf, setSidebarCollapsed])

  // Clean up the dock when navigating away from NotePage entirely.
  useEffect(() => () => { sandboxView.close() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { id } = useParams() //what note
  const navigate = useNavigate()
  // Match by string for optimistic temp ids and by number for synced server ids
  const note = notes && notes.length
    ? notes.find(n => n.id === id || n.id === Number(id))
    : null
  const isOptimistic = note?._optimistic === true

  // All hooks must be called before any early return (Rules of Hooks)
  const [newTitle, setNewTitle] = useState(note?.title || "")
  const [newTags, setNewTags] = useState(note?.tags || "")
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState('below') // 'above' or 'below'
  const [searchParams, setSearchParams] = useSearchParams() //how to display said note
  const titleInputReference = useRef(null); // `useRef` is basically just React's way of doing: `document.querySelectorAll()` or `.getElementByID()`
  const viewMode = searchParams.get('view') === 'read' // for view mode, true = read, false = write
  const menuRef = useRef(null)
  const buttonRef = useRef(null)
  const isDirtyRef = useRef(false)
  const headerRowRef = useRef(null)
  const [headerVisible, setHeaderVisible] = useState(true)
  const [noteSettingsOpen, setNoteSettingsOpen] = useState(false)
  // Wikilink "create note?" confirm flow: holds the clicked unresolved title.
  const [linkModalTitle, setLinkModalTitle] = useState(null)
  const [creatingLink, setCreatingLink] = useState(false)
  // [[task:id]] cross-link → task details modal hosted here.
  const [openTask, setOpenTask] = useState(null)
  const openingTaskRef = useRef(false)
  // [[sandbox:id]] that resolves to no known board → "not found" notice modal.
  const [sandboxNotFound, setSandboxNotFound] = useState(false)

  // re-renders if note changes (parent changes)
  useEffect(() => {
    if(note){
      setNewTitle(note.title)
      setNewTags(note.tags || "")
    }
  }, [note])

  useEffect(() => {
    const el = headerRowRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setHeaderVisible(entry.isIntersecting),
      { threshold: 0 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Click outside detection for menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  // this is for auto-selecting title when first created and visited
  useLayoutEffect(() => {
    if(newTitle === "Untitled" && titleInputReference.current){
      titleInputReference.current.select()
    }
  }, [newTitle, id])

  // Warn user before closing tab with unsaved changes
  useEffect(() => {
    const handler = (e) => {
      if (isDirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Reset less-distraction when the user navigates away from this note —
  // session-only state per the spec.
  useEffect(() => {
    return () => {
      if (setLessDistraction) setLessDistraction(false)
    }
  }, [setLessDistraction])

  const handleDirtyChange = useCallback((dirty) => {
    isDirtyRef.current = dirty
  }, [])

  // Save handler for Lexical editor - receives markdown content
  const handleEditorSave = useCallback(async (markdownContent) => {
    if (!note) return false
    return await editBody(note.id, markdownContent)
  }, [note?.id, editBody])

  // Confirm-creating a note from an unresolved [[wikilink]]: create it (awaiting
  // the synced note so we land on its real id), then navigate.
  const handleCreateLinkedNote = useCallback(async () => {
    const title = linkModalTitle
    if (!title || creatingLink || !addNote) return
    setCreatingLink(true)
    const newNote = await addNote(title)
    setCreatingLink(false)
    setLinkModalTitle(null)
    if (newNote) navigate(`/notes/${newNote.id}`)
  }, [linkModalTitle, creatingLink, addNote, navigate])

  // Open a [[task:id]] link: prefer the already-loaded task, else fetch by id.
  const handleOpenTask = useCallback(async (id) => {
    if (openingTaskRef.current) return
    const local = (tasks || []).find(t => String(t.id) === String(id))
    if (local) { setOpenTask(local); return }
    openingTaskRef.current = true
    try {
      const res = await authFetch(`${API}/tasks/${id}`)
      if (!res.ok) { toast.error('That linked item no longer exists.'); return }
      setOpenTask(await res.json())
    } catch {
      toast.error('Could not open that linked item.')
    } finally {
      openingTaskRef.current = false
    }
  }, [tasks, authFetch, API])

  // Open a [[sandbox:id]] link, or show a "not found" modal if no such board.
  // While the list hasn't hydrated yet, fall through to navigation rather than
  // false-flag a valid board as missing; once hydrated, a genuinely-missing board
  // (including for a user with zero boards) shows the not-found modal.
  const handleOpenSandbox = useCallback((id) => {
    if (!sandboxesLoaded || sandboxes.some(s => String(s.id) === String(id))) {
      navigate(`/sandboxes/${id}`)
    } else {
      setSandboxNotFound(true)
    }
  }, [sandboxes, sandboxesLoaded, navigate])

  // Clicking a #hashtag opens the notes list filtered by that term.
  const handleSearchTag = useCallback((tag) => {
    if (tag) navigate(`/notes?q=${encodeURIComponent(tag)}`)
  }, [navigate])

  // Clicking a [[link]] in the reading view — same behaviours as the editor.
  const handleOpenLink = useCallback((el) => {
    const kind = el.getAttribute('data-link-kind')
    if (kind === 'task') { handleOpenTask(el.getAttribute('data-link-id')); return }
    if (kind === 'sandbox') { handleOpenSandbox(el.getAttribute('data-link-id')); return }
    if (kind === 'bundle') { navigate(`/tasks?bundle=${el.getAttribute('data-link-id')}`); return }
    const target = (el.getAttribute('data-target') || '').trim()
    const found = (notes || []).find(n => (n.title || '').trim().toLowerCase() === target.toLowerCase())
    if (found) navigate(`/notes/${found.id}`)
    else if (target) setLinkModalTitle(target)
  }, [handleOpenTask, handleOpenSandbox, navigate, notes])

  // Draft recovery: decide the editor's initial content once per note. The
  // decision (is there a localStorage draft newer than the server copy?) is
  // computed purely here, keyed on note.id so it tracks the editor's remount
  // and never re-runs on incidental re-renders. The side effects (consuming the
  // draft + toasting) live in the effect below — running them inline on every
  // render is what caused the toast to fire repeatedly while editing.
  const initialContentInfo = useMemo(() => {
    if (!note) return { content: '' }
    const draftKey = `cinder_draft_${note.id}`
    try {
      const draft = localStorage.getItem(draftKey)
      if (draft) {
        const { content, savedAt } = JSON.parse(draft)
        const noteUpdated = new Date(note.updated_at).getTime()
        if (savedAt > noteUpdated) {
          return { content, recoveredKey: draftKey }
        }
        return { content: note.body || '', staleKey: draftKey } // stale draft, clean up
      }
    } catch { /* ignore malformed draft */ }
    return { content: note.body || '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  // Consume the draft (and toast once) after mount. Stable per note.id, so this
  // runs exactly once per note — not on every re-render.
  useEffect(() => {
    if (initialContentInfo.recoveredKey) {
      localStorage.removeItem(initialContentInfo.recoveredKey)
      toast.warning('Recovered unsaved changes from local backup')
    } else if (initialContentInfo.staleKey) {
      localStorage.removeItem(initialContentInfo.staleKey)
    }
  }, [initialContentInfo])

  // Skeleton shown while loading notes from server, or while a freshly-created
  // optimistic note is still syncing with the backend
  const skeletonView = (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <Skeleton width="140px" height="36px" radius={4} />
        <Skeleton width="100%" height="40px" radius={6} style={{ flex: 1 }} />
        <Skeleton width="36px" height="36px" radius={4} />
        <Skeleton width="36px" height="36px" radius={4} />
      </div>
      <div className={styles.editorSurface}>
        <Skeleton width="60%" height="42px" radius={4} style={{ marginBottom: 24 }} />
        <Skeleton width="100%" height="18px" radius={4} style={{ marginBottom: 12 }} />
        <Skeleton width="92%" height="18px" radius={4} style={{ marginBottom: 12 }} />
        <Skeleton width="86%" height="18px" radius={4} style={{ marginBottom: 12 }} />
        <Skeleton width="70%" height="18px" radius={4} style={{ marginBottom: 24 }} />
        <Skeleton width="100%" height="18px" radius={4} style={{ marginBottom: 12 }} />
        <Skeleton width="78%" height="18px" radius={4} />
      </div>
    </div>
  )

  // Early return AFTER all hooks
  if (!note) {
    if (notesLoading) return skeletonView
    return (
      <div className={styles.container}>
        <p style={{ color: 'var(--text-muted)' }}>Note not found.</p>
      </div>
    )
  }

  // Optimistic note that hasn't synced yet — show skeleton instead of mounting
  // the editor so we don't fire PUT /notes/temp-... requests that will 404
  if (isOptimistic) return skeletonView

  // the api calls to save title/body/tags
  const saveTitle = async () => {
    if(!newTitle.trim()){
      toast.warning('Title cannot be empty')
      setNewTitle(note.title) // revert back to original title
      return;
    }
    if(newTitle === note.title) return; // no change, skip PUT
    editTitle(note.id, newTitle)
  }
  const saveTags = async () => {
     if (newTags === (note.tags || "")) return
     updateTags(note.id, newTags)
  }

  // QoL: after pressing enter on title, move to body (editor)
  const handleKeyDown = e => {
    if(e.key === "Enter" || e.key === "Tab"){
      e.preventDefault();
      // Focus the Lexical editor's content editable
      const editorElement = document.querySelector('[contenteditable="true"]');
      editorElement?.focus();
    }
  }

  // for back button
  const handleGoBackBtn = () =>{
    navigate('/notes')
  }

  const toggleViewMode = () => {
    if(viewMode){
      searchParams.delete('view') // write mode
    }else{
      searchParams.set('view', 'read') // SET to read mode
    }

    setSearchParams(searchParams) // set after altering the params
  }

  const toggleMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()

    if (!menuOpen && buttonRef.current) {
      // Calculate if there's enough space below
      const buttonRect = buttonRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - buttonRect.bottom
      const menuHeight = 180 // Approximate menu height

      // If not enough space below, show above
      setMenuPosition(spaceBelow < menuHeight ? 'above' : 'below')
    }

    setMenuOpen(!menuOpen)
  }

  const handleFavoriteToggle = (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleFavorite(note.id)
    setMenuOpen(false)
  }

  const handleColorChange = (e, color) => {
    e.preventDefault()
    e.stopPropagation()
    updateColor(note.id, color)
  }

  const toggleLessDistraction = () => {
    setLessDistraction(prev => {
      const next = !prev
      // On enable, collapse the sidebar. On disable, leave it where the user
      // put it — toggling off is just for getting the page styling back.
      if (next && setSidebarCollapsed) setSidebarCollapsed(true)
      return next
    })
  }

  const noteContent = (
    <div className={styles.container}>

      {!headerVisible && (
        <div className={styles.viewToggleWrapper}>
          <button
            onClick={toggleViewMode}
            className={styles.viewToggleFloating}
            aria-label={viewMode ? 'Switch to edit mode' : 'Switch to read mode'}
          >
            {viewMode ? <HiPencilSquare /> : <MdChromeReaderMode />}
          </button>
        </div>
      )}

      {/* Header row with back button, tags input, and menu */}
      <div className={styles.headerRow} ref={headerRowRef}>
        <button onClick={handleGoBackBtn} className={styles.backBtn}>
          <IoMdArrowRoundBack /> Back to Notes
        </button>

        <input
          className={styles.tagsInput}
          type='text'
          value={newTags}
          onChange={ e => setNewTags(e.target.value)}
          onBlur={saveTags}
          placeholder='Tags (e.g., personal, work, ideas...)'
          readOnly={viewMode}
        />

        <button onClick={toggleViewMode} className={styles.backBtn} aria-label={viewMode ? 'Switch to edit mode' : 'Switch to read mode'}>
          {viewMode ? <HiPencilSquare /> : <MdChromeReaderMode />}
        </button>

        <button
          onClick={toggleLessDistraction}
          className={styles.backBtn}
          aria-pressed={lessDistraction}
          title={lessDistraction ? 'Exit less-distraction mode' : 'Less distraction mode'}
          aria-label={lessDistraction ? 'Exit less-distraction mode' : 'Enter less-distraction mode'}
        >
          {lessDistraction ? <LuMinimize /> : <LuMaximize />}
        </button>

        <div className={styles.menuContainer} ref={menuRef}>
          <button ref={buttonRef} onClick={toggleMenu} className={styles.menuBtn}>
            <FaEllipsisV />
          </button>

          {menuOpen && (
            <div className={`${styles.menu} ${menuPosition === 'above' ? styles.menuAbove : styles.menuBelow}`}>
              <button onClick={handleFavoriteToggle} className={styles.menuItem}>
                {note.is_favorite ? <FaStar color="#fbbf24" /> : <FaRegStar />}
                <span>{note.is_favorite ? 'Unfavorite' : 'Favorite'}</span>
              </button>

              <button
                onClick={() => { exportNote?.(note.id); setMenuOpen(false) }}
                className={styles.menuItem}
              >
                <HiOutlineDownload />
                <span>Export as markdown</span>
              </button>

              <button
                onClick={() => { printNoteToPdf(note); setMenuOpen(false) }}
                className={styles.menuItem}
              >
                <HiOutlineDocumentText />
                <span>Export as PDF</span>
              </button>

              <button
                onClick={() => { setNoteSettingsOpen(true); setMenuOpen(false) }}
                className={styles.menuItem}
              >
                <HiOutlineCog />
                <span>Note Settings</span>
              </button>

              <div className={styles.colorPicker}>
                <span className={styles.colorLabel}>Color:</span>
                <div className={styles.colorOptions}>
                  {NOTE_COLORS.map(c => {
                    const isSelected = (note.color ?? null) === c.key
                    return (
                      <button
                        key={c.name ?? 'default'}
                        onClick={(e) => handleColorChange(e, c.key)}
                        className={`${styles.colorBtn} ${isSelected ? styles.selected : ''}`}
                        style={{ backgroundColor: c.key ?? '#1e1e1e' }}
                        title={c.name}
                        aria-label={`Set color: ${c.name}`}
                        aria-pressed={isSelected}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`${styles.editorSurface} ${lessDistraction ? styles.lessDistraction : ''}`}>
        <input
          ref={titleInputReference}
          className={styles.titleInput}
          type='text'
          value={newTitle}
          onChange={ e => setNewTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={handleKeyDown}
          readOnly={viewMode}
        />

        {settings.experimentalEditor ? (
          // New editor stays mounted across the read/edit toggle (readMode prop) so
          // unsaved edits are never lost; in read mode it renders its own reading
          // view from the live doc.
          <CodeMirrorEditor
            key={note.id}
            readMode={viewMode}
            initialContent={initialContentInfo.content}
            onSave={handleEditorSave}
            noteId={note.id}
            onDirtyChange={handleDirtyChange}
            placeholder='Start typing here...'
            interfaceMode={false}
            notes={notes}
            onNavigateNote={(noteId) => navigate(`/notes/${noteId}`)}
            onCreateNote={(title) => setLinkModalTitle(title)}
            onOpenTask={handleOpenTask}
            onOpenSandbox={handleOpenSandbox}
            onOpenBundle={(id) => navigate(`/tasks?bundle=${id}`)}
            onSearchTag={handleSearchTag}
            onOpenLink={handleOpenLink}
            tasks={tasks}
            bundles={bundles}
            sandboxes={sandboxes}
          />
        ) : (
          <LexicalEditor
            key={note.id}
            initialContent={initialContentInfo.content}
            onSave={handleEditorSave}
            noteId={note.id}
            onDirtyChange={handleDirtyChange}
            placeholder='Start typing here...'
            interfaceMode={viewMode}
          />
        )}
      </div>

      <NoteSettingsPopup
        isOpen={noteSettingsOpen}
        onClose={() => setNoteSettingsOpen(false)}
      />

      <ConfirmModal
        isOpen={linkModalTitle !== null}
        title='Create note?'
        message={`"${linkModalTitle}" doesn't exist yet. Create it and go there?`}
        confirmText='Create & open'
        cancelText='No'
        confirmVariant='primary'
        busy={creatingLink}
        busyText='Creating…'
        busyContent={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skeleton height={18} width='55%' />
            <Skeleton height={12} width='90%' />
            <Skeleton height={12} width='80%' />
            <Skeleton height={12} width='70%' />
          </div>
        }
        onClose={() => { if (!creatingLink) setLinkModalTitle(null) }}
        onConfirm={handleCreateLinkedNote}
      />

      {openTask && (
        <TaskDetailsModal
          task={openTask}
          updateTask={updateTask}
          onClose={() => setOpenTask(null)}
          onOpenInHub={() => { navigate(`/tasks?task=${openTask.id}`); setOpenTask(null) }}
        />
      )}

      <ConfirmModal
        isOpen={sandboxNotFound}
        title='Sandbox not found'
        message="This sandbox doesn't exist anymore (it may have been deleted)."
        confirmText='OK'
        confirmVariant='primary'
        hideCancel
        glow='danger'
        onConfirm={() => setSandboxNotFound(false)}
        onClose={() => setSandboxNotFound(false)}
      />
    </div>
  )

  // Half-mode wraps the note column + a sandbox column in a CSS grid. Hidden
  // and PiP modes leave the note column at full width and overlay the dock.
  return (
    <div
      style={sandboxView.isHalf ? {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        height: '100vh',
        overflow: 'hidden',
      } : { width: '100%' }}
    >
      <div style={sandboxView.isHalf ? { overflow: 'auto', height: '100%' } : undefined}>
        {noteContent}
      </div>
      {!sandboxView.isHidden && <SandboxDock notes={notes} tasks={tasks} toggleTaskCompletion={toggleTaskCompletion} />}
    </div>
  )
}

export default NotePage