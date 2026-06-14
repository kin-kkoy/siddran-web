// Geometry helpers for the proportional time-grid (Week/Day). Kept out of TimeGrid.jsx so that
// file only exports a component (fast-refresh requirement).
//
// The grid is a CONTINUOUS timeline (Google-Calendar style): the vertical axis is real time at
// HOUR_PX pixels/hour, an event's top = its start time and height = its duration, and overlapping
// events are packed into side-by-side columns ("lanes").

export const HOUR_PX = 64            // pixels per hour
export const MIN_BLOCK_PX = 18       // floor height so tiny/zero-duration blocks stay readable
export const DAY_PX = HOUR_PX * 24

const pad = (n) => String(n).padStart(2, '0')

export const snap15 = (min) => Math.round(min / 15) * 15
export const minutesToY = (min) => (min / 60) * HOUR_PX
export const yToMinutes = (y) => (y / HOUR_PX) * 60
export const timeToMinutes = (t) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
export const minutesToTime = (min) => {
    const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)))
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

// Resolve a viewport point to { day, minutes } using the day column under the pointer (data-col).
// minutes is measured from the column's top, scaled by HOUR_PX, clamped to [0, 1440].
export function pointToDayTime(x, y) {
    const col = document.elementFromPoint(x, y)?.closest('[data-col]')
    if (!col) return null
    const day = col.getAttribute('data-col')
    const rect = col.getBoundingClientRect()
    const minutes = Math.max(0, Math.min(24 * 60, yToMinutes(y - rect.top)))
    return { day, minutes }
}

// Greedy column packing for overlapping events. Input objects need { startMin, endMin };
// returns copies with { colIndex, colCount } so each renders at left = colIndex/colCount,
// width = 1/colCount. A "cluster" is a maximal run of mutually-overlapping events.
export function packLanes(evs) {
    const sorted = [...evs].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
    const out = []
    let cluster = []
    let clusterEnd = -1

    const flush = () => {
        const colEnds = [] // last endMin placed in each column
        for (const ev of cluster) {
            let col = colEnds.findIndex(end => ev.startMin >= end)
            if (col === -1) { col = colEnds.length; colEnds.push(ev.endMin) }
            else colEnds[col] = ev.endMin
            ev.__col = col
        }
        const colCount = colEnds.length
        for (const ev of cluster) out.push({ ...ev, colIndex: ev.__col, colCount })
        cluster = []
        clusterEnd = -1
    }

    for (const ev of sorted) {
        if (cluster.length && ev.startMin >= clusterEnd) flush() // no overlap with the cluster → new one
        cluster.push(ev)
        clusterEnd = Math.max(clusterEnd, ev.endMin)
    }
    if (cluster.length) flush()
    return out
}
