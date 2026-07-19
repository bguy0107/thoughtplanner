'use client'

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { useEditor, EditorContent, ReactRenderer, ReactNodeViewRenderer, type AnyExtension } from '@tiptap/react'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import { Markdown } from 'tiptap-markdown'
import GlobalDragHandle from 'tiptap-extension-global-drag-handle'
import { BlockClickSelect } from './extensions/BlockClickSelect'
import { CodeBlockView } from './CodeBlockView'
import { Embed } from './extensions/Embed'
import { SlashCommand } from './extensions/SlashCommand'
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu'
import { BubbleMenuBar } from './BubbleMenuBar'
import { api } from '@/lib/api'
import { useSidebarStore } from '@/store/sidebar'
import { usePageSync, type PageMeta } from '@/hooks/usePageSync'

import 'tippy.js/dist/tippy.css'

const lowlight = createLowlight(common)

export interface EditorHandle {
  getMarkdown: () => string
  importMarkdown: (md: string) => void
}

interface EditorProps {
  pageId: string
  // Only needed to create a nested database via the `/database` slash command,
  // which is unavailable in readOnly mode (the public share view) — optional there.
  workspaceId?: string
  initialContent: unknown
  onChange: (content: unknown) => void
  onNavigate?: (url: string) => void
  onRemoteMeta?: (meta: PageMeta) => void
  readOnly?: boolean
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { pageId, workspaceId, initialContent, onChange, onNavigate, onRemoteMeta, readOnly = false },
  ref,
) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { addDatabase } = useSidebarStore()

  const debouncedSave = useCallback(
    (content: unknown) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        onChange(content)
        sendContent(content)
      }, 800)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange],
  )

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: "Type '/' for commands…" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Embed.configure({ pageId }),
      Link.configure({ openOnClick: false }),
      Underline,
      Highlight,
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView)
        },
      }).configure({ lowlight }),
      Markdown.configure({ html: false, transformPastedText: true }),
      ...(!readOnly ? [GlobalDragHandle.configure({ dragHandleWidth: 20, scrollTreshold: 100 }), BlockClickSelect] as AnyExtension[] : []),
      ...(!readOnly ? [SlashCommand.configure({
        suggestion: {
          char: '/',
          items: ({ query }: { query: string }) => {
            const all = [
              { title: 'Text', description: 'Plain paragraph', icon: '¶', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().setParagraph().run() },
              { title: 'Heading 1', description: 'Large heading', icon: 'H1', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 1 }).run() },
              { title: 'Heading 2', description: 'Medium heading', icon: 'H2', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 2 }).run() },
              { title: 'Heading 3', description: 'Small heading', icon: 'H3', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleHeading({ level: 3 }).run() },
              { title: 'Bullet List', description: 'Unordered list', icon: '•', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBulletList().run() },
              { title: 'Numbered List', description: 'Ordered list', icon: '1.', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleOrderedList().run() },
              { title: 'To-do List', description: 'Checkboxes', icon: '☑', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleTaskList().run() },
              { title: 'Code Block', description: 'Syntax highlighted', icon: '</>', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleCodeBlock().run() },
              { title: 'Blockquote', description: 'Indented quote', icon: '"', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().toggleBlockquote().run() },
              { title: 'Divider', description: 'Horizontal rule', icon: '—', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().setHorizontalRule().run() },
              { title: 'Image', description: 'Upload an image', icon: '🖼', command: () => document.getElementById('tp-image-upload')?.click() },
              { title: 'PDF', description: 'Upload a PDF', icon: '📄', command: () => document.getElementById('tp-pdf-upload')?.click() },
              { title: 'File', description: 'Upload a file others can download', icon: '📎', command: () => document.getElementById('tp-file-upload')?.click() },
              { title: 'Link', description: 'Embed a link preview', icon: '🔗', command: (e: ReturnType<typeof useEditor>) => e?.chain().focus().insertEmbed({ embedType: 'link' }).run() },
              {
                title: 'Database',
                description: 'Create a new database page',
                icon: '⊞',
                command: () => {
                  if (!workspaceId) return
                  addDatabase(workspaceId, pageId).then((db) => onNavigate?.(`/page/${db.id}`))
                },
              },
            ]
            const q = query.toLowerCase()
            return q ? all.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) : all
          },
          render: () => {
            let component: ReactRenderer<SlashCommandMenuHandle>
            let popup: TippyInstance[]

            return {
              onStart(props: SuggestionProps) {
                component = new ReactRenderer(SlashCommandMenu, { props, editor: props.editor })
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                })
              },
              onUpdate(props: SuggestionProps) {
                component.updateProps(props)
                popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect })
              },
              onKeyDown(props: SuggestionKeyDownProps) {
                if (props.event.key === 'Escape') { popup[0].hide(); return true }
                return component.ref?.onKeyDown(props.event) ?? false
              },
              onExit() {
                popup[0].destroy()
                component.destroy()
              },
            }
          },
        },
      })] as AnyExtension[] : []),
    ],
    content: initialContent as object ?? '',
    onUpdate: ({ editor }) => {
      if (!readOnly) debouncedSave(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: 'tiptap prose prose-gray dark:prose-invert max-w-none focus:outline-none min-h-[60vh]',
      },
      handlePaste: (view, event) => {
        if (readOnly) return false
        const files = Array.from(event.clipboardData?.items ?? [])
          .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
          .map((item) => item.getAsFile())
          .filter((file): file is File => !!file)
        if (files.length === 0) return false
        event.preventDefault()
        const { schema } = view.state
        files.forEach((file) => {
          const pos = view.state.selection.from
          api.files.upload(pageId, file)
            .then((uploaded) => {
              const node = schema.nodes.image.create({ src: uploaded.url, alt: file.name })
              view.dispatch(view.state.tr.insert(pos, node))
            })
            .catch((err) => console.error('Failed to upload pasted image', err))
        })
        return true
      },
    },
  })

  const { sendContent } = usePageSync(pageId, editor, onRemoteMeta)

  useImperativeHandle(ref, () => ({
    getMarkdown: () => editor?.storage.markdown.getMarkdown() ?? '',
    importMarkdown: (md: string) => editor?.commands.setContent(md),
  }), [editor])

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    e.target.value = ''
    const uploaded = await api.files.upload(pageId, file)
    editor.chain().focus().setImage({ src: uploaded.url, alt: file.name }).run()
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    e.target.value = ''
    const uploaded = await api.files.upload(pageId, file)
    editor
      .chain()
      .focus()
      .insertEmbed({ embedType: 'pdf', status: 'ready', url: uploaded.url, embedUrl: uploaded.url, title: file.name })
      .run()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    e.target.value = ''
    const uploaded = await api.files.upload(pageId, file)
    editor
      .chain()
      .focus()
      .insertEmbed({
        embedType: 'file',
        status: 'ready',
        url: uploaded.url,
        title: uploaded.filename,
        fileSize: uploaded.size,
        mimeType: uploaded.mimeType,
      })
      .run()
  }

  return (
    <div className="relative">
      {!readOnly && editor && <BubbleMenuBar editor={editor} />}
      {!readOnly && (
        <input
          id="tp-image-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />
      )}
      {!readOnly && (
        <input
          id="tp-pdf-upload"
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handlePdfUpload}
        />
      )}
      {!readOnly && (
        <input
          id="tp-file-upload"
          type="file"
          className="hidden"
          onChange={handleFileUpload}
        />
      )}
      <EditorContent editor={editor} />
    </div>
  )
})
