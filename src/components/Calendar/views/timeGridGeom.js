// Geometry helper shared by TimeGrid and the unscheduled drawer. Kept out of TimeGrid.jsx so
// that file only exports a component (fast-refresh requirement).
//
// The Day/Week grid is an HOUR-BUCKET grid (each hour is a cell, 'HH:00–HH:59'), not a
// continuous timeline — so a drop resolves to whole-hour cells, never sub-hour minutes.

const pad = (n) => String(n).padStart(2, '0')

// Resolve a viewport point to { day, time } via the grid cell under the pointer. Hour cells carry
// data-day + data-hour; within a cell the vertical position picks a 15-min quarter (top → :00 …
// bottom → :45), so click/drag snaps to 15 min. The all-day cell carries only data-day (→ null).
export function slotFromPoint(x, y) {
    const cell = document.elementFromPoint(x, y)?.closest('[data-day]')
    if (!cell) return null
    const day = cell.getAttribute('data-day')
    const hourAttr = cell.getAttribute('data-hour')
    if (hourAttr == null) return { day, time: null } // all-day cell
    const hour = Number(hourAttr)
    const rect = cell.getBoundingClientRect()
    const frac = rect.height ? (y - rect.top) / rect.height : 0
    const quarter = Math.min(3, Math.max(0, Math.floor(frac * 4)))
    return { day, time: `${pad(hour)}:${pad(quarter * 15)}` }
}
