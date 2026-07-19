import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { EmbedView } from '../EmbedView'

export interface EmbedOptions {
  pageId: string
}

export interface EmbedAttrs {
  url?: string | null
  status?: 'empty' | 'loading' | 'ready' | 'error'
  embedType?: 'link' | 'pdf' | 'file' | null
  title?: string | null
  description?: string | null
  image?: string | null
  siteName?: string | null
  embedUrl?: string | null
  provider?: string | null
  errorMessage?: string | null
  fileSize?: number | null
  mimeType?: string | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      insertEmbed: (attrs?: EmbedAttrs) => ReturnType
    }
  }
}

export const Embed = Node.create<EmbedOptions>({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return { pageId: '' }
  },

  addAttributes() {
    return {
      url: { default: null },
      status: { default: 'empty' }, // 'empty' | 'loading' | 'ready' | 'error'
      embedType: { default: null }, // 'link' | 'pdf' | 'file' — hint pre-resolve, confirmed type once ready
      title: { default: null },
      description: { default: null },
      image: { default: null },
      siteName: { default: null },
      embedUrl: { default: null },
      provider: { default: null },
      errorMessage: { default: null },
      fileSize: { default: null },
      mimeType: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'embed' }), node.attrs.url ?? '']
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView)
  },

  addCommands() {
    return {
      insertEmbed:
        (attrs) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs: attrs ?? {} })
            .run(),
    }
  },
})
