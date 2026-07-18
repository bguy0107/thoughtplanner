'use client'

import { useState } from 'react'
import { BubbleMenu, type Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { Bold, Italic, Underline, Strikethrough, Link, Highlighter, Code } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BubbleMenuBarProps {
  editor: Editor
}

export function BubbleMenuBar({ editor }: BubbleMenuBarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  function applyLink() {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100 }}
      shouldShow={({ state }) => !state.selection.empty && !(state.selection instanceof NodeSelection)}
      className="flex items-center bg-gray-900 text-white rounded-lg shadow-xl overflow-hidden divide-x divide-gray-700"
    >
      {showLinkInput ? (
        <form
          onSubmit={(e) => { e.preventDefault(); applyLink() }}
          className="flex items-center gap-1.5 px-2 py-1"
        >
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
            className="bg-gray-800 text-white text-sm rounded px-2 py-0.5 w-48 outline-none border border-gray-600 focus:border-blue-500"
          />
          <button type="submit" className="text-xs px-2 py-1 bg-blue-600 rounded hover:bg-blue-500 transition-colors">
            Apply
          </button>
          <button
            type="button"
            onClick={() => setShowLinkInput(false)}
            className="text-xs text-gray-400 hover:text-white px-1"
          >
            ✕
          </button>
        </form>
      ) : (
        <>
          <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (⌘B)">
            <Bold size={13} />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (⌘I)">
            <Italic size={13} />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline (⌘U)">
            <Underline size={13} />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
            <Strikethrough size={13} />
          </Btn>
          <Btn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">
            <Code size={13} />
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            active={editor.isActive('highlight')}
            title="Highlight"
          >
            <Highlighter size={13} />
          </Btn>
          <Btn
            onClick={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run()
              } else {
                setLinkUrl(editor.getAttributes('link').href ?? '')
                setShowLinkInput(true)
              }
            }}
            active={editor.isActive('link')}
            title="Link"
          >
            <Link size={13} />
          </Btn>
        </>
      )}
    </BubbleMenu>
  )
}

function Btn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={cn(
        'p-2 hover:bg-gray-700 transition-colors',
        active && 'bg-gray-700 text-blue-400',
      )}
    >
      {children}
    </button>
  )
}
