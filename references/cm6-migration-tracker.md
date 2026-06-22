# CM6 Editor Migration — Phase Tracker

Replacing Cinder's Lexical note editor with a CodeMirror 6 Obsidian-style
live-preview editor, behind the `experimentalEditor` Settings flag (default OFF).
Both editors read/write the same markdown `note.body`, so they're swappable with
no data migration. Delete this file once all phases land and the flag is removed.

Branch: `cm6-editor`. Reference clone: `~/Downloads/garb2/obsidian-notes-clone.html`.

## Phase 1 — CM6 live-preview shell behind the flag  ✅ (in review)
- [x] CM6 + lezer deps in `package.json`
- [x] `experimentalEditor` flag in `SettingsContext` DEFAULTS
- [x] "Use New Editor (Beta)" toggle in `SettingsPopup` Interface tab
- [x] `cm/widgets.js` — Hr / Bullet / Check widgets
- [x] `cm/livePreview.js` — `buildDeco` + `livePreviewField` StateField
      (bold/italic/strike/inline-code, headings, links, fenced code, HR,
       blockquote, bullets, checkboxes)
- [x] `cm/theme.js` — Cinder dark-cosmic theme + decoration styles
- [x] `CodeMirrorEditor.jsx` — prop-compatible wrapper (save-on-blur + debounce,
      checkbox toggle handler, read-only reconfigure)
- [x] `NotePage.jsx` — flag-gated editor switch
- [x] Manual verification pass — incl. caret-motion fix (browser hit-testing for
      Arrow-Up/Down + clicks; see verticalMotion.js / migration memory)

## Phase 2 — parity  ✅ (in review)
- [x] (A) Full autosave-timer + localStorage draft parity (2min/5s, blur, unmount)
- [x] (B) Image upload via the R2 presign uploader (`utils/imageUpload.js`):
      paste/drop, inline render, drag-resize (`#w=NNN`)
- [x] (D) Fenced-code syntax highlighting (editor + reading view) + copy button
- [x] (C) Reading mode — read toggle now renders a fully-rendered HTML view
      (`markdownToHtml.js` + `ReadingView.jsx`); Lexical read mode unchanged
- [ ] Manual verification pass (see plan's verification section)

## Phase 3 — wikilinks  ✅ (in review)
- [x] Wikilink Lezer node (`cm/wikilinks.js`); Embed/Highlight/Hashtag deferred
- [x] `[[ ]]` live-preview decorations (resolved vs unresolved) + `[[`-autocomplete
      over existing note titles
- [x] note↔note navigation (click → `/notes/:id`) + create-on-click for unresolved
      links (`addNote` → navigate); `[[Target|alias]]` supported
- [ ] Manual verification pass
- Deferred: note embeds `![[ ]]`, `#heading` anchors, wikilinks inside reading mode

## Phase 4 — typed cross-links  ✅ (in review)
- [x] `[[task:<id>|label]]` → fetch + open `TaskDetailsModal` in the note
      (+ "open in TasksHub" icon button left of its close ✕ → `/tasks?task=id`)
- [x] `[[sandbox:<id>|label]]` → `navigate('/sandboxes/:id')`
- [x] typed-link rendering (green `◷` task / red `▦` sandbox) reusing the Wikilink node
- [ ] Manual verification pass
- Deferred: `[[daily:id]]`, typed-link autocomplete, typed links in reading mode

## Phase 5 — remaining syntaxes + fold  ✅ (in review)
- [x] `==highlight==` (editor + reading view `<mark>`)
- [x] `#hashtags` — clickable pill → `/notes?q=tag` (NotesHub reads `?q=`)
- [x] `> [!callouts]` — coloured block (editor) + titled card (reading view)
- [x] spoilers `||…||` — blur + hover-reveal
- [x] collapsible heading fold (foldGutter + heading foldService; in-session)
- [ ] Manual verification pass
- Deferred: typed-link & legacy `<spoiler>` rendering in editor, fold persistence

## Phase 6 — graduation (separate, explicitly confirmed step)
- [ ] Make CM6 the default + remove the `experimentalEditor` flag
- [ ] Delete Lexical (LexicalEditor + plugins/ + nodes/ + themes/editorTheme +
      lexicalToMdast/mdastToLexical/markdownTransformers) and `@lexical/*` deps.
      KEEP: cm/, ReadingView, markdownToHtml, remark* plugins, CodeMirrorEditor.
