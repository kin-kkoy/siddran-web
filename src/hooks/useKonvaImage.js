import { useEffect, useState } from 'react'

/**
 * Loads a base64 / URL src into an HTMLImageElement for Konva's <Image>.
 * Tiny local replacement for the `use-image` dep — no extra bundle weight.
 */
export function useKonvaImage(src) {
    const [image, setImage] = useState(null)
    useEffect(() => {
        if (!src) { setImage(null); return }
        const img = new window.Image()
        let alive = true
        img.onload = () => { if (alive) setImage(img) }
        img.src = src
        return () => { alive = false }
    }, [src])
    return image
}
