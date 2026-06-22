import { EditorView } from '@codemirror/view'

// Cinder dark-cosmic theme for the CodeMirror live-preview editor. Built on the
// app's existing CSS variables (NOT Obsidian purple — see the sandbox-aesthetic
// feedback). Decoration classes (.cm-strong, .cm-h1, …) are assigned literally
// by buildDeco, so we style them here; EditorView.theme scopes every selector
// under the editor's generated class, keeping them from leaking globally.

export const cinderTheme = EditorView.theme({
  '&': {
    color: 'var(--text-primary)',
    backgroundColor: 'transparent',
    fontSize: '16px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
  },
  // The editor grows with its content and the page scrolls (one page scrollbar,
  // matching the note layout). CM's caret motion doesn't depend on owning the
  // scroll because Arrow-keys and clicks are resolved via the browser's real
  // hit-testing (see verticalMotion.js), not CM's estimated height model.
  '&.cm-editor': { height: 'auto' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': {
    fontFamily: 'inherit',
    padding: '4px 0 30vh 0',
    lineHeight: '1.75',
    caretColor: 'var(--text-primary)',
  },
  '.cm-line': { padding: '0' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.75', overflow: 'visible' },
  '.cm-cursor': { borderLeftColor: 'var(--text-primary)', borderLeftWidth: '2px' },
  '.cm-placeholder': { color: 'var(--text-faint)' },

  // Selection (drawSelection)
  '.cm-selectionBackground': { background: 'var(--bg-hover)' },
  '&.cm-focused .cm-selectionBackground': { background: 'var(--bg-hover)' },

  // ── Inline marks ──
  '.cm-strong': { fontWeight: '700', color: 'var(--text-primary)' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strike': { textDecoration: 'line-through', color: 'var(--text-muted)' },
  '.cm-code-inline': {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: '0.86em',
    background: 'var(--bg-hover)',
    borderRadius: '4px',
    padding: '1px 5px',
    color: 'var(--accent-warning)',
  },

  // ── Headings (line decorations) ──
  '.cm-line.cm-h': { fontWeight: '700', letterSpacing: '-0.01em', color: 'var(--text-primary)' },
  '.cm-line.cm-h1': { fontSize: '1.9em' },
  '.cm-line.cm-h2': { fontSize: '1.55em' },
  '.cm-line.cm-h3': { fontSize: '1.3em' },
  '.cm-line.cm-h4': { fontSize: '1.12em' },
  '.cm-line.cm-h5': { fontSize: '1em' },
  '.cm-line.cm-h6': { fontSize: '0.9em', color: 'var(--text-muted)' },

  // ── Links ──
  '.cm-external-link, .cm-link-active': {
    color: 'var(--accent-blue)',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  '.cm-external-link:hover': { textDecoration: 'underline' },

  // ── Blockquote ──
  '.cm-line.cm-quote': {
    borderLeft: '3px solid var(--border-strong)',
    paddingLeft: '14px',
    color: 'var(--text-secondary)',
  },

  // ── Fenced code (line decorations) ──
  '.cm-line.cm-codeblock': {
    position: 'relative', // anchors the absolutely-positioned copy button
    background: 'var(--bg-surface-alt)',
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: '13.5px',
    color: 'var(--text-secondary)',
    paddingLeft: '15px !important',
    paddingRight: '15px !important',
  },

  // Code-block "Copy" button (cm/codeCopy.js): floated top-right, out of flow.
  '.cm-code-copy-btn': {
    position: 'absolute',
    top: '4px',
    right: '8px',
    zIndex: '3',
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: '11px',
    lineHeight: '1',
    padding: '3px 8px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    opacity: '0.5',
    transition: 'opacity 120ms ease, color 120ms ease',
  },
  '.cm-code-copy-btn:hover': { opacity: '1', color: 'var(--text-primary)' },

  // Inline images (cm/widgets.js ImageWidget) + drag-resize handle.
  '.cm-img-wrap': { position: 'relative', display: 'inline-block', maxWidth: '100%', margin: '0.2em 0' },
  '.cm-img': { maxWidth: '100%', borderRadius: '6px', display: 'block' },
  '.cm-img-resize': {
    position: 'absolute',
    right: '6px',
    bottom: '8px',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: 'var(--accent-blue)',
    border: '2px solid var(--bg-primary)',
    cursor: 'ew-resize',
    opacity: '0',
    transition: 'opacity 120ms ease',
  },
  '.cm-img-wrap:hover .cm-img-resize': { opacity: '1' },
  '.cm-line.cm-codeblock-top': {
    borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px',
    paddingTop: '9px !important',
  },
  '.cm-line.cm-codeblock-bot': {
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
    paddingBottom: '9px !important',
  },

  // ── Bullets / rules / checkboxes (widgets) ──
  '.cm-bullet': { color: 'var(--accent-blue)', display: 'inline-block', width: '0.9em' },
  '.cm-hr': { borderTop: '1px solid var(--border-strong)', margin: '0.7em 0' },
  '.cm-task': { display: 'inline-block' },
  '.cm-task-check': {
    width: '15px',
    height: '15px',
    verticalAlign: '-2px',
    marginRight: '6px',
    cursor: 'pointer',
    accentColor: 'var(--accent-blue)',
  },
}, { dark: true })
