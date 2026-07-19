import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin } from '@tiptap/pm/state'

// tiptap-extension-global-drag-handle only wires up dragstart — clicking its
// handle does nothing on its own. This mirrors its own node-lookup so a click
// selects the same block the handle would otherwise drag, giving a
// NodeSelection that Backspace/Delete removes via tiptap's built-in keymap.
const BLOCK_SELECTORS = ['li', 'p:not(:first-child)', 'pre', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].join(', ')

function nodeDOMAtPoint(x: number, y: number) {
  return document
    .elementsFromPoint(x, y)
    .find((el) => el.parentElement?.matches?.('.ProseMirror') || el.matches(BLOCK_SELECTORS))
}

export const BlockClickSelect = Extension.create({
  name: 'blockClickSelect',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(view) {
          function onClick(event: MouseEvent) {
            const target = event.target as HTMLElement | null
            const handle = target?.closest?.('.drag-handle') as HTMLElement | null
            if (!handle || handle.parentElement !== view.dom.parentElement) return

            const handleRect = handle.getBoundingClientRect()
            const node = nodeDOMAtPoint(handleRect.right + 10, handleRect.top + handleRect.height / 2)
            if (!node) return

            // Map the DOM node we just identified as "the block the handle
            // points at" straight to its document position, rather than
            // re-deriving a position from coordinates: for a nested block
            // (e.g. a list item whose content lives in an inner <p>), a
            // coordinate-based lookup here would land inside that inner
            // paragraph instead of the list item itself, selecting/deleting
            // the wrong node.
            let pos: number
            try {
              const domPos = view.posAtDOM(node, 0)
              const $pos = view.state.doc.resolve(domPos)
              pos = $pos.before($pos.depth)
            } catch {
              return
            }

            event.preventDefault()
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)))
            view.focus()
          }
          document.addEventListener('click', onClick)
          return { destroy: () => document.removeEventListener('click', onClick) }
        },
      }),
    ]
  },
})
