'use client'

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useSidebarStore } from '@/store/sidebar'
import { api } from '@/lib/api'
import { positionBetween } from '@/lib/position'
import { PageItem } from './PageItem'
import type { PageSummary } from '@/lib/api'

interface PageTreeProps {
  parentId: string | null
  depth: number
  tree: Map<string | null, PageSummary[]>
}

export function PageTree({ parentId, depth, tree }: PageTreeProps) {
  const pages = useSidebarStore((s) => s.pages)
  const setPages = useSidebarStore((s) => s.setPages)
  const children = tree.get(parentId) ?? []

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = children.findIndex((p) => p.id === active.id)
    const newIndex = children.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Only the dragged page's position needs to change — a fractional value
    // between its new neighbors keeps every other sibling's position (and
    // therefore its stored row) untouched.
    const reorderedSiblings = arrayMove(children, oldIndex, newIndex)
    const movedIndex = reorderedSiblings.findIndex((p) => p.id === active.id)
    const position = positionBetween(
      reorderedSiblings[movedIndex - 1]?.position,
      reorderedSiblings[movedIndex + 1]?.position,
    )

    // Optimistically move the dragged page within the flat list.
    const oldFlatIndex = pages.findIndex((p) => p.id === active.id)
    const newFlatIndex = pages.findIndex((p) => p.id === over.id)
    const updatedPages: PageSummary[] = arrayMove(pages, oldFlatIndex, newFlatIndex).map((p) =>
      p.id === active.id ? { ...p, position } : p,
    )
    setPages(updatedPages)

    await api.pages.update(active.id as string, { position })
  }

  if (children.length === 0 && depth === 0) {
    return <p className="px-4 py-2 text-xs text-gray-400 dark:text-sidebar-dark-muted">No pages yet</p>
  }

  if (depth > 0) {
    return (
      <ul>
        {children.map((page) => (
          <PageItem key={page.id} page={page} depth={depth} tree={tree} />
        ))}
      </ul>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={children.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul>
          {children.map((page) => (
            <PageItem key={page.id} page={page} depth={depth} tree={tree} sortable />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
