import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, drawSelection, placeholder as cmPlaceholder } from '@codemirror/view'
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { livePreviewField } from './cm/livePreview'
import { domVerticalMotion } from './cm/verticalMotion'
import { codeCopy } from './cm/codeCopy'
import { cinderHighlightStyle } from './cm/highlight'
import { cinderTheme } from './cm/theme'
import styles from './CodeMirrorEditor.module.css'

// Autosave cadence — mirrors Lexical's AutosavePlugin so the new editor is as
// crash-safe as the old one: periodic backend save + a frequent localStorage
// draft that NotePage's recovery (cinder_draft_<id>) reads back.
const AUTOSAVE_INTERVAL_MS = 2 * 60 * 1000 // backend save
const DRAFT_SAVE_INTERVAL_MS = 5 * 1000    // localStorage draft

// CodeMirror 6 editor — a drop-in alternative to LexicalEditor behind the
// experimentalEditor flag. The document IS the markdown (note.body), so there is
// no serialize/deserialize layer: onSave just hands back the doc text.
//
// Prop contract matches LexicalEditor exactly:
//   initialContent  markdown string the editor opens with
//   onSave(md)      => Promise<boolean>, persists the note body
//   onDirtyChange   (isDirty: boolean) => void
//   noteId          stable id (editor is remounted per note via key); draft key
//   placeholder     empty-state text
//   interfaceMode   true = read-only
function CodeMirrorEditor({
  initialContent = '',
  onSave,
  onDirtyChange,
  noteId,
  placeholder = 'Start typing here...',
  interfaceMode = false,
}) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const editableRef = useRef(new Compartment())

  // Keep the latest callbacks reachable from the long-lived EditorView without
  // rebuilding it on every parent render.
  const onSaveRef = useRef(onSave)
  const onDirtyRef = useRef(onDirtyChange)
  useEffect(() => { onSaveRef.current = onSave }, [onSave])
  useEffect(() => { onDirtyRef.current = onDirtyChange }, [onDirtyChange])

  // Save bookkeeping (refs so they survive across the view's lifetime).
  const lastSavedRef = useRef(initialContent) // last content persisted to backend
  const dirtyRef = useRef(false)              // differs from backend-saved content
  const draftDirtyRef = useRef(false)         // differs from last localStorage draft

  // Build the editor once on mount.
  useEffect(() => {
    const draftKey = `cinder_draft_${noteId}`
    const editableExt = (ro) => [
      EditorView.editable.of(!ro),
      EditorState.readOnly.of(ro),
    ]
    const getDoc = () => (viewRef.current ? viewRef.current.state.doc.toString() : null)

    // Refresh the localStorage crash-draft when content diverges from the last
    // backend save; clear it (and dirty state) once they match again.
    const saveDraft = () => {
      if (!draftDirtyRef.current) return
      const md = getDoc()
      if (md == null) return
      if (md === lastSavedRef.current) {
        try { localStorage.removeItem(draftKey) } catch { /* ignore quota/parse */ }
        draftDirtyRef.current = false
        if (dirtyRef.current) { dirtyRef.current = false; onDirtyRef.current?.(false) }
        return
      }
      try {
        localStorage.setItem(draftKey, JSON.stringify({ content: md, savedAt: Date.now() }))
      } catch { /* ignore quota */ }
      draftDirtyRef.current = false
    }

    // Persist to the backend; on success clear dirty state and delete the draft.
    const saveBackend = () => {
      if (!dirtyRef.current) return
      const md = getDoc()
      if (md == null) return
      if (md === lastSavedRef.current) {
        dirtyRef.current = false
        draftDirtyRef.current = false
        onDirtyRef.current?.(false)
        return
      }
      Promise.resolve(onSaveRef.current?.(md)).then(ok => {
        if (ok !== false) {
          lastSavedRef.current = md
          dirtyRef.current = false
          draftDirtyRef.current = false
          onDirtyRef.current?.(false)
          try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
        }
      }).catch(() => { /* keep dirty + draft for a later retry */ })
    }

    const updateListener = EditorView.updateListener.of((u) => {
      if (!u.docChanged) return
      draftDirtyRef.current = true
      if (!dirtyRef.current) { dirtyRef.current = true; onDirtyRef.current?.(true) }
    })

    // Checkbox toggle from its rendered widget + save-on-blur.
    const domHandlers = EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const target = event.target
        if (!target || !target.classList?.contains('cm-task-check')) return false
        const pos = view.posAtDOM(target)
        const line = view.state.doc.lineAt(pos)
        const m = /^(\s*)([-*+])(\s+)\[([ xX])\]/.exec(line.text)
        if (!m) return false
        const from = line.from + m[1].length + 1 + m[3].length
        const checked = /x/i.test(m[4])
        view.dispatch({ changes: { from, to: from + 3, insert: checked ? '[ ]' : '[x]' } })
        event.preventDefault()
        return true
      },
      blur: () => { saveBackend(); return false },
    })

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          history(),
          domVerticalMotion, // must precede defaultKeymap's Arrow-Up/Down
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          drawSelection(),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(cinderHighlightStyle),
          livePreviewField,
          codeCopy,
          cinderTheme,
          cmPlaceholder(placeholder),
          editableRef.current.of(editableExt(interfaceMode)),
          updateListener,
          domHandlers,
        ],
      }),
    })
    viewRef.current = view

    const autosaveTimer = setInterval(saveBackend, AUTOSAVE_INTERVAL_MS)
    const draftTimer = setInterval(saveDraft, DRAFT_SAVE_INTERVAL_MS)

    return () => {
      clearInterval(autosaveTimer)
      clearInterval(draftTimer)
      // Final draft write on unmount so unsaved changes survive navigation/crash.
      if (dirtyRef.current || draftDirtyRef.current) {
        const md = view.state.doc.toString()
        if (md !== lastSavedRef.current) {
          try {
            localStorage.setItem(draftKey, JSON.stringify({ content: md, savedAt: Date.now() }))
          } catch { /* ignore quota */ }
        }
      }
      view.destroy()
      viewRef.current = null
    }
    // Mount-once: NotePage remounts this component per note via `key`, so the
    // doc never needs external syncing. Deps intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reconfigure read-only state when the view mode flips, without rebuilding.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editableRef.current.reconfigure([
        EditorView.editable.of(!interfaceMode),
        EditorState.readOnly.of(interfaceMode),
      ]),
    })
  }, [interfaceMode])

  return <div ref={hostRef} className={styles.editorRoot} />
}

export default CodeMirrorEditor
