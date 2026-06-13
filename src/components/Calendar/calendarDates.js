// Shared date helpers for the Calendar feature. Native Date only (per project convention),
// all local-time — we store UTC in the DB but render against the user's local day. Keep this
// pure (no React) so useCalendar, the views, and the page can all import it.

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_NAMES_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' for a Date, in LOCAL time (not UTC — toISOString would shift the day near midnight).
export function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' → Date at LOCAL midnight.
export function parseISODate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// Any timestamp (ISO string or Date) → its LOCAL 'YYYY-MM-DD'.
export function localDayOf(ts) {
    return isoDate(new Date(ts));
}

export function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

export function startOfDay(d) {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
}

export function isSameDay(a, b) {
    return isoDate(a) === isoDate(b);
}

export function isTodayISO(iso) {
    return iso === isoDate(new Date());
}

// First cell of a Monday-start month grid containing `monthDate` (back up to the Monday
// on/just before the 1st). Returns a Date at local midnight.
export function monthGridStart(monthDate) {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // days back to Monday (0=Sun → 6)
    return addDays(first, -offset);
}

// The 42 dates (6 weeks) of a Monday-start month grid.
export function monthGridDays(monthDate) {
    const start = monthGridStart(monthDate);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function isWeekday(d) {
    const g = d.getDay();
    return g >= 1 && g <= 5;
}

// Combine a 'YYYY-MM-DD' day + optional 'HH:MM' into a UTC ISO string (local → UTC).
// Returns null for a missing/invalid day rather than throwing on toISOString.
export function toISOFromParts(dayISO, time) {
    if (!dayISO || !/^\d{4}-\d{2}-\d{2}$/.test(dayISO)) return null;
    const [y, m, d] = dayISO.split('-').map(Number);
    let hh = 0, mm = 0;
    if (time && /^\d{1,2}:\d{2}$/.test(time)) {
        [hh, mm] = time.split(':').map(Number);
    }
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

// 'HH:MM' (local) for a timestamp, for prefilling time inputs.
export function timeOf(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
