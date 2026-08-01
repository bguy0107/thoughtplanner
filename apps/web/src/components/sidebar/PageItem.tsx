'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronRight, ChevronDown, Plus, Trash2, FileText, Table2, GripVertical } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { type PageSummary, api } from '@/lib/api'
import { useSidebarStore } from '@/store/sidebar'
import { useSidebarDrag, zoneId } from './sidebar-dnd'
import { PageTree } from './PageTree'

interface PageItemProps {
  page: PageSummary
  depth: number
  tree: Map<string | null, PageSummary[]>
}

export function PageItem({ page, depth, tree }: PageItemProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [hovered, setHovered] = useState(false)
  const expanded = useSidebarStore((s) => s.expandedIds.has(page.id))
  const { addPage, removePage, expandPage, toggleExpanded } = useSidebarStore()
  const { overId, invalidTargetIds } = useSidebarDrag()

  const isActive = pathname === `/page/${page.id}`
  const isInvalidTarget = invalidTargetIds.has(page.id)

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: page.id })
  const { setNodeRef: setBeforeRef } = useDroppable({ id: zoneId('before', page.id), disabled: isInvalidTarget })
  const { setNodeRef: setInsideRef } = useDroppable({ id: zoneId('inside', page.id), disabled: isInvalidTarget })
  const { setNodeRef: setAfterRef } = useDroppable({ id: zoneId('after', page.id), disabled: isInvalidTarget })

  const isBeforeOver = overId === zoneId('before', page.id)
  const isInsideOver = overId === zoneId('inside', page.id)
  const isAfterOver = overId === zoneId('after', page.id)

  async function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation()
    const child = await addPage(page.workspaceId, page.id)
    expandPage(page.id)
    router.push(`/page/${child.id}`)
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    await api.pages.delete(page.id)
    removePage(page.id)
    if (isActive) router.push('/home')
  }

  return (
    <li>
      <div ref={setDragRef} className={cn('relative', isDragging && 'opacity-40')}>
        {/* Drop zones spanning the row: top/bottom edges reorder, middle nests */}
        <div ref={setBeforeRef} className="absolute inset-x-0 top-0 h-[30%] pointer-events-none" />
        <div ref={setInsideRef} className="absolute inset-x-0 top-[30%] h-[40%] pointer-events-none" />
        <div ref={setAfterRef} className="absolute inset-x-0 bottom-0 h-[30%] pointer-events-none" />

        {isBeforeOver && (
          <div
            className="absolute top-0 h-0.5 bg-blue-500 rounded-full pointer-events-none z-10"
            style={{ left: 12 + depth * 16, right: 8 }}
          />
        )}
        {isAfterOver && (
          <div
            className="absolute bottom-0 h-0.5 bg-blue-500 rounded-full pointer-events-none z-10"
            style={{ left: 12 + depth * 16, right: 8 }}
          />
        )}

        <div
          role="button"
          tabIndex={0}
          onClick={() => router.push(`/page/${page.id}`)}
          onKeyDown={(e) => e.key === 'Enter' && router.push(`/page/${page.id}`)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          className={cn(
            'group flex items-center gap-1 py-[3px] pr-2 cursor-pointer rounded-sm text-sm',
            isInsideOver && 'ring-2 ring-inset ring-blue-400',
            isActive
              ? 'bg-[#e3e2e0] dark:bg-sidebar-dark-active text-gray-900 dark:text-sidebar-dark-text'
              : 'text-gray-600 dark:text-sidebar-dark-text hover:bg-[#ebebea] dark:hover:bg-sidebar-dark-hover',
          )}
        >
          {/* Drag handle */}
          {hovered && (
            <span
              {...attributes}
              {...listeners}
              className="flex-shrink-0 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={13} />
            </span>
          )}

          {/* Expand toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpanded(page.id) }}
            className="p-0.5 rounded hover:bg-[#d9d8d6] dark:hover:bg-sidebar-dark-active text-gray-400 dark:text-sidebar-dark-muted flex-shrink-0"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {/* Icon + title */}
          <span className="flex-shrink-0 text-base leading-none">
            {page.icon
              ? page.icon
              : page.isDatabase
                ? <Table2 size={14} className="text-gray-400 dark:text-sidebar-dark-muted" />
                : <FileText size={14} className="text-gray-400 dark:text-sidebar-dark-muted" />}
          </span>
          <span className="flex-1 truncate">{page.title || 'Untitled'}</span>

          {/* Action buttons (visible on hover) */}
          {hovered && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={handleAddChild}
                className="p-0.5 rounded hover:bg-[#d9d8d6] dark:hover:bg-sidebar-dark-active text-gray-400 dark:text-sidebar-dark-muted"
                title="Add sub-page"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={handleDelete}
                className="p-0.5 rounded hover:bg-[#d9d8d6] dark:hover:bg-sidebar-dark-active text-gray-400 dark:text-sidebar-dark-muted hover:text-red-500"
                title="Delete page"
              >
                <Trash2 size={13} />
              </button>
            </span>
          )}
        </div>
      </div>

      {expanded && <PageTree parentId={page.id} depth={depth + 1} tree={tree} />}
    </li>
  )
}
