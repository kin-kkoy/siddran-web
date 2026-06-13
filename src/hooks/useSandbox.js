import { useCallback, useEffect, useRef, useState } from 'react'
import logger from '../utils/logger'

const STORAGE_PREFIX = 'cinder_sandbox_'
const SIZE_WARN_THRESHOLD = 3 * 1024 * 1024 // 3MB — warn before localStorage's ~5MB cap

const key = (sandboxId) => `${STORAGE_PREFIX}${sandboxId}`

const readSandbox = (sandboxId) => {
    try {
        const raw = localStorage.getItem(key(sandboxId))
        if (!raw) return { items: [] }
        const parsed = JSON.parse(raw)
        return { items: Array.isArray(parsed?.items) ? parsed.items : [] }
    } catch (err) {
        logger.error('useSandbox — failed to read', err)
        return { items: [] }
    }
}

const writeSandbox = (sandboxId, items) => {
    try {
        const serialized = JSON.stringify({ items })
        if (serialized.length > SIZE_WARN_THRESHOLD) {
            logger.warn(`useSandbox — payload ${(serialized.length / 1024 / 1024).toFixed(1)}MB near localStorage cap`)
        }
        localStorage.setItem(key(sandboxId), serialized)
    } catch (err) {
        logger.error('useSandbox — failed to write', err)
    }
}

const newItemId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`)

/**
 * Items live in `cinder_sandbox_<id>`. Writes are debounced 300ms so a long
 * drawing session doesn't flush localStorage on every stroke commit.
 */
export function useSandbox(sandboxId) {
    const [items, setItems] = useState(() => sandboxId ? readSandbox(sandboxId).items : [])
    const flushTimerRef = useRef(null)
    const latestItemsRef = useRef(items)

    // Reload when the sandbox id changes (route change).
    useEffect(() => {
        if (!sandboxId) {
            setItems([])
            return
        }
        const fresh = readSandbox(sandboxId).items
        latestItemsRef.current = fresh
        setItems(fresh)
    }, [sandboxId])

    // Debounced write.
    useEffect(() => {
        if (!sandboxId) return
        latestItemsRef.current = items
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
        flushTimerRef.current = setTimeout(() => {
            writeSandbox(sandboxId, latestItemsRef.current)
        }, 300)
        return () => {
            if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
        }
    }, [items, sandboxId])

    // Flush on unmount so the last edit isn't lost mid-debounce.
    useEffect(() => () => {
        if (sandboxId) writeSandbox(sandboxId, latestItemsRef.current)
    }, [sandboxId])

    const addItem = useCallback((item) => {
        const withId = { ...item, id: item.id ?? newItemId() }
        setItems(prev => [...prev, withId])
        return withId
    }, [])

    const updateItem = useCallback((id, patch) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
    }, [])

    const removeItem = useCallback((id) => {
        setItems(prev => prev.filter(it => it.id !== id))
    }, [])

    // Stale-free lookup for undo/redo command closures (they capture the
    // pre-mutation value of an item and must read the LATEST array, not the
    // one closed over at command-creation time).
    const getItemById = useCallback((id) => latestItemsRef.current.find(it => it.id === id), [])

    return { items, addItem, updateItem, removeItem, getItemById, itemsRef: latestItemsRef }
}

export const newSandboxItemId = newItemId

// Collapse the canvas item types into the four colour buckets the hub mosaic
// uses. Anything unrecognised (incl. connectors) falls back to 'text'.
const TYPE_BUCKET = {
    stroke: 'draw', shape: 'draw', image: 'draw',
    note: 'note',
    task: 'task',
    text: 'text', connector: 'text',
}

// Lightweight per-sandbox summary read straight from localStorage, so the hub
// cards can render a density mosaic without mounting the full useSandbox hook.
// `buckets` is one entry per item, in stored order.
export const getSandboxSummary = (sandboxId) => {
    if (!sandboxId) return { count: 0, buckets: [] }
    const items = readSandbox(sandboxId).items
    return {
        count: items.length,
        buckets: items.map(it => TYPE_BUCKET[it?.type] || 'text'),
    }
}
