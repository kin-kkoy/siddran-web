import { DecoratorNode } from 'lexical'
import { useState } from 'react'
import { resolveImageUrl } from '../../../utils/imageUpload'
import styles from './ImageNode.module.css'

function ImageComponent({ src, altText }) {
    const [errored, setErrored] = useState(false)
    const url = resolveImageUrl(src)

    if (errored) {
        return (
            <span className={styles.broken} title={`Failed to load: ${altText || src}`}>
                [image unavailable]
            </span>
        )
    }

    return (
        <img
            src={url}
            alt={altText || ''}
            loading="lazy"
            draggable={false}
            className={styles.image}
            onError={() => setErrored(true)}
        />
    )
}

export class ImageNode extends DecoratorNode {
    __src
    __altText

    static getType() {
        return 'image'
    }

    static clone(node) {
        return new ImageNode(node.__src, node.__altText, node.__key)
    }

    constructor(src, altText, key) {
        super(key)
        this.__src = src
        this.__altText = altText || ''
    }

    static importJSON(serialized) {
        return new ImageNode(serialized.src, serialized.altText)
    }

    exportJSON() {
        return {
            type: 'image',
            version: 1,
            src: this.__src,
            altText: this.__altText,
        }
    }

    static importDOM() {
        return {
            img: () => ({
                conversion: (domNode) => {
                    const src = domNode.getAttribute('src') || ''
                    const alt = domNode.getAttribute('alt') || ''
                    if (!src) return null
                    return { node: $createImageNode({ src, altText: alt }) }
                },
                priority: 1,
            }),
        }
    }

    exportDOM() {
        const img = document.createElement('img')
        img.setAttribute('src', resolveImageUrl(this.__src))
        if (this.__altText) img.setAttribute('alt', this.__altText)
        return { element: img }
    }

    createDOM() {
        const span = document.createElement('span')
        span.className = styles.wrapper
        return span
    }

    updateDOM() {
        return false
    }

    isInline() {
        return true
    }

    decorate() {
        return <ImageComponent src={this.__src} altText={this.__altText} />
    }

    getSrc() {
        return this.__src
    }

    getAltText() {
        return this.__altText
    }
}

export function $createImageNode({ src, altText }) {
    return new ImageNode(src, altText || '')
}

export function $isImageNode(node) {
    return node instanceof ImageNode
}
