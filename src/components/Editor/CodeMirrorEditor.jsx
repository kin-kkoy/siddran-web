import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, drawSelection, placeholder as cmPlaceholder } from '@codemirror/view'
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { livePreviewField } from './cm/livePreview'
import { domVerticalMotion } from './cm/verticalMotion'
import { cinderTheme } from './cm/theme'
import styles from './CodeMirrorEditor.module.css'

const SAVE_DEBOUNCE_MS = 800

// Phase 1 CodeMirror 6 editor — a drop-in alternative to LexicalEditor behind
// the experimentalEditor flag. The document IS the markdown (note.body), so
// there is no serialize/deserialize layer: onSave just hands back the doc text.
//
// Prop contract matches LexicalEditor exactly:
//   initialContent  markdown string the editor opens with
//   onSave(md)      => Promise<boolean>, persists the note body
//   onDirtyChange   (isDirty: boolean) => void
//   noteId          stable id (editor is remounted per note via key)
//   placeholder     empty-state text
//   interfaceMode   true = read-only
function CodeMirrorEditor({
  initialContent = '',
  onSave,
  onDirtyChange,
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
  const lastSavedRef = useRef(initialContent)
  const dirtyRef = useRef(false)
  const saveTimerRef = useRef(null)

  // Build the editor once on mount.
  useEffect(() => {
    const editableExt = (ro) => [
      EditorView.editable.of(!ro),
      EditorState.readOnly.of(ro),
    ]

    const flushSave = () => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
      const view = viewRef.current
      if (!view || !dirtyRef.current) return
      const md = view.state.doc.toString()
      if (md === lastSavedRef.current) { dirtyRef.current = false; onDirtyRef.current?.(false); return }
      Promise.resolve(onSaveRef.current?.(md)).then(ok => {
        if (ok !== false) {
          lastSavedRef.current = md
          dirtyRef.current = false
          onDirtyRef.current?.(false)
        }
      }).catch(() => { /* keep dirty; a later flush retries */ })
    }

    const scheduleSave = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
    }

    const updateListener = EditorView.updateListener.of((u) => {
      if (!u.docChanged) return
      if (!dirtyRef.current) { dirtyRef.current = true; onDirtyRef.current?.(true) }
      scheduleSave()
    })

    // Toggle a `- [ ]` / `- [x]` checkbox from its rendered widget. Resolving the
    // clicked position back to the line keeps the toggle robust to shifting
    // document positions.
    const toggleHandler = EditorView.domEventHandlers({
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
      blur: () => { flushSave(); return false },
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
          markdown({ base: markdownLanguage }),
          livePreviewField,
          cinderTheme,
          cmPlaceholder(placeholder),
          editableRef.current.of(editableExt(interfaceMode)),
          updateListener,
          toggleHandler,
        ],
      }),
    })
    viewRef.current = view

    return () => {
      flushSave()
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
