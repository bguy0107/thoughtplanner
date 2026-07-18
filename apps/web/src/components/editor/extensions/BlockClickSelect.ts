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
            const nodeRect = node.getBoundingClientRect()
            const result = view.posAtCoords({ left: nodeRect.left + 1, top: nodeRect.top + 1 })
            if (!result || result.inside < 0) return

            let pos = result.inside
            const $pos = view.state.doc.resolve(pos)
            if ($pos.depth > 1) pos = $pos.before($pos.depth)

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
