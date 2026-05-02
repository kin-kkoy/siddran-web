// Persist collapsed-section ids per note in localStorage.
const KEY = (noteId) => `cinder_collapse_${noteId}`;

export function loadCollapsed(noteId) {
  if (!noteId) return new Set();
  try {
    const raw = localStorage.getItem(KEY(noteId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveCollapsed(noteId, set) {
  if (!noteId) return;
  try {
    localStorage.setItem(KEY(noteId), JSON.stringify([...set]));
  } catch {
    // localStorage is best-effort; ignore quota errors.
  }
}
