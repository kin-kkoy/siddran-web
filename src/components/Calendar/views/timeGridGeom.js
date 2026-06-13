// Geometry helpers shared by TimeGrid and the unscheduled drawer. Kept out of TimeGrid.jsx so
// that file only exports a component (react-refresh / fast-refresh requirement).

export const HOUR_H = 52      // px per hour row — MUST match the 52px gradient in TimeGrid.module.css
export const SNAP_MIN = 15    // snap granularity for click-create + drag

const pad = (n) => String(n).padStart(2, '0')
export const fmtMin = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

// Resolve a viewport point to { day, time } via the grid column under the pointer. Body columns
// carry data-slot="time" (→ compute time from y); all-day cells carry only data-day (→ time null).
export function slotFromPoint(x, y) {
    const col = document.elementFromPoint(x, y)?.closest('[data-day]')
    if (!col) return null
    const day = col.getAttribute('data-day')
    if (col.getAttribute('data-slot') === 'time') {
        const rect = col.getBoundingClientRect()
        const raw = ((y - rect.top) / HOUR_H) * 60
        const min = Math.min(Math.max(Math.round(raw / SNAP_MIN) * SNAP_MIN, 0), 24 * 60 - SNAP_MIN)
        return { day, time: fmtMin(min) }
    }
    return { day, time: null }
}
