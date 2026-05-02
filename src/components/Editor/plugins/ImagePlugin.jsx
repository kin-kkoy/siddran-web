import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
    $getSelection,
    $isRangeSelection,
    $getRoot,
    $getNodeByKey,
    $createParagraphNode,
    COMMAND_PRIORITY_LOW,
    COMMAND_PRIORITY_NORMAL,
    PASTE_COMMAND,
    DROP_COMMAND,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'
import {
    $createImagePlaceholderNode,
    $isImagePlaceholderNode,
} from '../nodes/ImagePlaceholderNode'
import { $createImageNode } from '../nodes/ImageNode'
import { uploadImageFile, ALLOWED_IMAGE_MIME } from '../../../utils/imageUpload'
import { useApi } from '../../../contexts/ApiContext'
import { toast } from '../../../utils/toast'
import logger from '../../../utils/logger'

const CONCURRENCY = 3

const partitionImageFiles = (fileList) => {
    const all = Array.from(fileList || [])
    const imageLike = all.filter(f => f && typeof f.type === 'string' && f.type.startsWith('image/'))
    const valid = imageLike.filter(f => ALLOWED_IMAGE_MIME.has(f.type))
    return { valid, hadAnyImage: imageLike.length > 0, hadInvalidImage: imageLike.length > valid.length }
}

const insertPlaceholder = (editor) => new Promise((resolve) => {
    let key = null
    editor.update(() => {
        const placeholder = $createImagePlaceholderNode()
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
            selection.insertNodes([placeholder])
        } else {
            // No active selection (toolbar button blurred the editor).
            // Wrap in a new paragraph at the end since placeholder is inline.
            const para = $createParagraphNode()
            para.append(placeholder)
            $getRoot().append(para)
        }
        key = placeholder.getKey()
    }, { onUpdate: () => resolve(key) })
})

const replacePlaceholder = (editor, key, path, altText) => {
    editor.update(() => {
        const node = $getNodeByKey(key)
        if (!node || !$isImagePlaceholderNode(node)) return
        node.replace($createImageNode({ src: path, altText: altText || '' }))
    })
}

const removePlaceholder = (editor, key) => {
    editor.update(() => {
        const node = $getNodeByKey(key)
        if (node && $isImagePlaceholderNode(node)) node.remove()
    })
}

async function processFile(editor, authFetch, API, file) {
    const key = await insertPlaceholder(editor)
    if (!key) return
    try {
        const { path } = await uploadImageFile(authFetch, API, file)
        replacePlaceholder(editor, key, path, file.name)
    } catch (err) {
        logger.error('Image upload failed:', err)
        removePlaceholder(editor, key)
        toast.error(err.message || 'Image upload failed')
    }
}

export async function insertImagesFromFiles(editor, authFetch, API, fileList) {
    if (!editor.isEditable()) return
    const { valid, hadInvalidImage } = partitionImageFiles(fileList)
    if (hadInvalidImage) {
        toast.error('Unsupported image type (use PNG, JPEG, GIF, or WEBP)')
    }
    if (valid.length === 0) return

    const queue = valid.slice()
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
            const file = queue.shift()
            if (!file) break
            await processFile(editor, authFetch, API, file)
        }
    })
    await Promise.all(workers)
}

export default function ImagePlugin() {
    const [editor] = useLexicalComposerContext()
    const { authFetch, API } = useApi()

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                PASTE_COMMAND,
                (event) => {
                    if (!editor.isEditable()) return false
                    const clipboard = event?.clipboardData
                    if (!clipboard) return false
                    const { hadAnyImage } = partitionImageFiles(clipboard.files)
                    if (!hadAnyImage) return false
                    event.preventDefault()
                    insertImagesFromFiles(editor, authFetch, API, clipboard.files)
                    return true
                },
                COMMAND_PRIORITY_LOW,
            ),
            editor.registerCommand(
                DROP_COMMAND,
                (event) => {
                    if (!editor.isEditable()) return false
                    const dt = event?.dataTransfer
                    if (!dt) return false
                    const { hadAnyImage } = partitionImageFiles(dt.files)
                    if (!hadAnyImage) return false
                    event.preventDefault()
                    insertImagesFromFiles(editor, authFetch, API, dt.files)
                    return true
                },
                COMMAND_PRIORITY_NORMAL,
            ),
        )
    }, [editor, authFetch, API])

    return null
}
