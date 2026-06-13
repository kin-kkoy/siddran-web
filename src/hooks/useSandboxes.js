import { useCallback, useEffect, useState } from 'react'
import logger from '../utils/logger'

const STORAGE_KEY = 'cinder_sandboxes'

const readAll = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch (err) {
        logger.error('useSandboxes — failed to read', err)
        return []
    }
}

const writeAll = (arr) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
    } catch (err) {
        logger.error('useSandboxes — failed to write', err)
    }
}

// Lightweight ULID-ish id. crypto.randomUUID is available in all modern browsers
// and on Node ≥ 19, so no polyfill needed.
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`)

export function useSandboxes() {
    const [sandboxes, setSandboxes] = useState(readAll)

    useEffect(() => { writeAll(sandboxes) }, [sandboxes])

    const create = useCallback((title = 'Untitled Sandbox') => {
        const now = new Date().toISOString()
        const sandbox = {
            id: newId(),
            title: title.trim() || 'Untitled Sandbox',
            createdAt: now,
            updatedAt: now,
        }
        setSandboxes(prev => [sandbox, ...prev])
        return sandbox
    }, [])

    const rename = useCallback((id, title) => {
        setSandboxes(prev => prev.map(s => s.id === id
            ? { ...s, title: title.trim() || s.title, updatedAt: new Date().toISOString() }
            : s
        ))
    }, [])

    const remove = useCallback((id) => {
        setSandboxes(prev => prev.filter(s => s.id !== id))
        try { localStorage.removeItem(`cinder_sandbox_${id}`) } catch (err) {
            logger.error('useSandboxes — failed to remove sandbox payload', err)
        }
    }, [])

    const touch = useCallback((id) => {
        setSandboxes(prev => prev.map(s => s.id === id
            ? { ...s, updatedAt: new Date().toISOString() }
            : s
        ))
    }, [])

    return { sandboxes, create, rename, remove, touch }
}

export const STORAGE_KEY_SANDBOXES = STORAGE_KEY
