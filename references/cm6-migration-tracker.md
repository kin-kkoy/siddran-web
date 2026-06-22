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
- [ ] Manual verification pass (see plan's verification section)

## Phase 2 — parity
- [ ] Full autosave-timer + localStorage draft parity (match AutosavePlugin)
- [ ] Image upload wired to the R2 presign uploader (`utils/imageUpload.js`),
      replacing the reference's base64
- [ ] Code-block copy button
- [ ] Reading-mode toggle (fully-rendered HTML view)

## Phase 3 — wikilinks
- [ ] `ObsidianMD` Lezer nodes (Wikilink, Embed, Highlight, Hashtag)
- [ ] `[[ ]]` decorations + `wikilinkComplete` autocomplete
- [ ] note↔note navigation

## Phase 4 — typed cross-links
- [ ] `[[task:<id>|label]]` → open existing `TaskDetailsModal`
      (+ new "open in TasksHub" icon button left of its close ✕)
- [ ] `[[sandbox:<id>|label]]` → `navigate('/sandboxes/:id')`

## Phase 5 — finish + retire Lexical
- [ ] `==highlight==`, `#hashtags`, `> [!note]` callouts
- [ ] spoilers `||…||`, collapsible fold
- [ ] make CM6 default, remove Lexical + the flag
