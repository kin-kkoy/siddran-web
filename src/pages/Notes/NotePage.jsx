import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import styles from './NotePage.module.css'
import { IoMdArrowRoundBack } from "react-icons/io"
import { FaStar, FaRegStar, FaEllipsisV } from 'react-icons/fa'
import { MdChromeReaderMode } from "react-icons/md";
import { HiPencilSquare } from "react-icons/hi2";
import { HiOutlineDownload, HiOutlineCog } from "react-icons/hi";
import { LuMaximize, LuMinimize } from "react-icons/lu";
import LexicalEditor from '../../components/Editor/LexicalEditor'
import { toast } from '../../utils/toast'
import Skeleton from '../../components/Common/Skeleton'
import { NOTE_COLORS } from '../../components/Notes/noteColors'
import NoteSettingsPopup from '../../components/Settings/NoteSettingsPopup'

function NotePage({ notes, notesLoading, editTitle, editBody, updateTags, toggleFavorite, updateColor, exportNote, setSidebarCollapsed, lessDistraction = false, setLessDistraction }) {

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

  // Draft recovery: check if localStorage has a newer draft than the server
  const getInitialContent = useCallback(() => {
    if (!note) return ''
    const draftKey = `cinder_draft_${note.id}`
    try {
      const draft = localStorage.getItem(draftKey)
      if (draft) {
        const { content, savedAt } = JSON.parse(draft)
        const noteUpdated = new Date(note.updated_at).getTime()
        if (savedAt > noteUpdated) {
          localStorage.removeItem(draftKey) // consume — don't re-trigger on re-render
          // Defer: getInitialContent runs during render, so calling toast
          // synchronously here would setState in ToastContainer mid-render
          queueMicrotask(() => toast.warning('Recovered unsaved changes from local backup'))
          return content
        }
        localStorage.removeItem(draftKey) // stale draft, clean up
      }
    } catch { /* ignore malformed draft */ }
    return note.body || ''
  }, [note])

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

  return (
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

        <LexicalEditor
          key={note.id}
          initialContent={getInitialContent()}
          onSave={handleEditorSave}
          noteId={note.id}
          onDirtyChange={handleDirtyChange}
          placeholder='Start typing here...'
          interfaceMode={viewMode}
        />
      </div>

      <NoteSettingsPopup
        isOpen={noteSettingsOpen}
        onClose={() => setNoteSettingsOpen(false)}
      />
    </div>

  )
}

export default NotePage