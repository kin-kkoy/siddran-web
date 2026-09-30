# Siddran

A notes, tasks and planning app for the web: a Markdown editor with live preview, task
lists, a calendar, and an infinite-canvas sandbox, all in one dark, distraction-free UI.

**Live demo:** https://cinder-ebon.vercel.app. Use "Try it free — no signup" on the login page to explore
without an account. Guest mode runs against an in-memory mock of the API, so nothing is
saved and a refresh starts over.

## Siddran family

| Repo | What it is |
| --- | --- |
| **siddran-web** (this repo) | React web client, deployed on Vercel. |
| [siddran-backend](https://github.com/kin-kkoy/siddran-backend) | Node/Express REST API with PostgreSQL that the web client talks to. |
| [siddran-desktop](https://github.com/kin-kkoy/siddran-desktop) | Tauri desktop build, local-first: data lives as `.md` and JSON files in a folder you pick. |

## Features

### Notes
- CodeMirror 6 editor with Obsidian-style live preview: Markdown syntax hides until the caret reaches it
- Separate reading view, remembered per note
- `[[wikilinks]]` to other notes, plus typed links to tasks, bundles and sandboxes (`[[task:42|label]]`)
- Callouts (`> [!note]`), highlights, underline, spoilers, `#hashtags`, syntax-highlighted code blocks with a copy button
- Paste images straight into a note (uploaded to object storage through a presigned URL)
- Foldable lists, favorites, card colors, tags
- Split view for two notes side by side (experimental)
- Export a note as Markdown or PDF (PDF uses the browser's print dialog)

### Notebooks
- Group notes into notebooks, with favorites and colors
- Import `.md` files (with frontmatter) into a notebook

### Tasks
- One-off tasks with due dates
- Bundles: grouped task lists
- Daily tasks, either one-off or recurring (every day, weekdays, weekends, or custom days)

### Calendar
- Month, week and day views
- Drag undated tasks from a drawer onto the time grid to schedule them
- Schedule designer: design a weekly timetable once, then stamp it onto the calendar and recolor, edit or duplicate it later
- A compact calendar "peek" panel with quick-add

### Sandboxes
- Infinite canvas built on Konva: freehand drawing (perfect-freehand), shapes, connectors, text boxes
- Attach existing notes and tasks to the board as cards
- Selection, alignment, snapping, z-order, undo/redo
- Export the drawing layer to PNG

### Settings
- Ten color themes, a contrast setting, and a tunable animated star background

## Tech stack

| Layer | Tech |
| --- | --- |
| Framework | React 19 |
| Editor | CodeMirror 6, with a unified/remark/rehype pipeline for reading view and export |
| Canvas | Konva / react-konva, perfect-freehand |
| Routing | React Router v7 |
| Build / test | Vite 8, Vitest |
| Styling | CSS Modules |
| Hosting | Vercel (SPA rewrite in `vercel.json`) |

Auth uses a short-lived JWT access token plus a refresh token in an HttpOnly cookie, both
issued by [siddran-backend](https://github.com/kin-kkoy/siddran-backend).

## Getting started

Run [siddran-backend](https://github.com/kin-kkoy/siddran-backend) locally first (it defaults to
port 3000), or point the client at a deployed instance.

```bash
npm install
npm run dev       # Vite dev server
npm run build     # production build
npm run test      # Vitest
npm run lint
```

Environment variables (Vite, set in a local `.env`):

| Name | Purpose |
| --- | --- |
| `VITE_API_URL` | Backend base URL. Defaults to `http://localhost:3000`. |
| `VITE_R2_PUBLIC_URL` | Public base URL for uploaded images. |

## Not built yet

- Password reset and account management (change name or password)
- Mods: the page exists as a placeholder
