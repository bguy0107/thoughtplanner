'use client'

import { PageItem } from './PageItem'
import type { PageSummary } from '@/lib/api'

interface PageTreeProps {
  parentId: string | null
  depth: number
  tree: Map<string | null, PageSummary[]>
}

export function PageTree({ parentId, depth, tree }: PageTreeProps) {
  const children = (tree.get(parentId) ?? []).slice().sort((a, b) => a.position - b.position)

  if (children.length === 0 && depth === 0) {
    return <p className="px-4 py-2 text-xs text-gray-400 dark:text-sidebar-dark-muted">No pages yet</p>
  }

  return (
    <ul>
      {children.map((page) => (
        <PageItem key={page.id} page={page} depth={depth} tree={tree} />
      ))}
    </ul>
  )
}
