import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import { type Editor } from '@tiptap/react'

export type SlashCommandItem = {
  title: string
  description: string
  icon: string
  command: (editor: Editor) => void
}

function getItems(): SlashCommandItem[] {
  return [
    {
      title: 'Text',
      description: 'Plain paragraph',
      icon: '¶',
      command: (editor) => editor.chain().focus().setParagraph().run(),
    },
    {
      title: 'Heading 1',
      description: 'Large heading',
      icon: 'H1',
      command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      description: 'Medium heading',
      icon: 'H2',
      command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      description: 'Small heading',
      icon: 'H3',
      command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      title: 'Bullet List',
      description: 'Unordered list',
      icon: '•',
      command: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: 'Numbered List',
      description: 'Ordered list',
      icon: '1.',
      command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: 'To-do List',
      description: 'Checkboxes',
      icon: '☑',
      command: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
    {
      title: 'Code Block',
      description: 'Syntax highlighted code',
      icon: '</>',
      command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      title: 'Blockquote',
      description: 'Indented quote',
      icon: '"',
      command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      title: 'Divider',
      description: 'Horizontal rule',
      icon: '—',
      command: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
  ]
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }) => {
          props.command(editor)
          editor.chain().focus().deleteRange(range).run()
        },
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return getItems().filter(
            (i) =>
              i.title.toLowerCase().includes(q) ||
              i.description.toLowerCase().includes(q),
          )
        },
      } satisfies Partial<SuggestionOptions>,
    }
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
  },
})
