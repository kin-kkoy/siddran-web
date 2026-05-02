import { DecoratorNode } from 'lexical'
import styles from './ImageNode.module.css'

function PlaceholderComponent() {
    return (
        <span className={styles.placeholder} aria-label="Uploading image">
            <span className={styles.spinner} />
            <span className={styles.placeholderText}>Uploading…</span>
        </span>
    )
}

export class ImagePlaceholderNode extends DecoratorNode {
    static getType() {
        return 'image-placeholder'
    }

    static clone(node) {
        return new ImagePlaceholderNode(node.__key)
    }

    static importJSON() {
        return new ImagePlaceholderNode()
    }

    exportJSON() {
        return { type: 'image-placeholder', version: 1 }
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
        return <PlaceholderComponent />
    }
}

export function $createImagePlaceholderNode() {
    return new ImagePlaceholderNode()
}

export function $isImagePlaceholderNode(node) {
    return node instanceof ImagePlaceholderNode
}
