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
import { useSidebarStore, buildPageTree } from '@/store/sidebar'
import { api } from '@/lib/api'
import { PageItem } from './PageItem'
import type { PageSummary } from '@/lib/api'

interface PageTreeProps {
  parentId: string | null
  depth: number
}

export function PageTree({ parentId, depth }: PageTreeProps) {
  const pages = useSidebarStore((s) => s.pages)
  const setPages = useSidebarStore((s) => s.setPages)
  const tree = buildPageTree(pages)
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

    const reordered = arrayMove(children, oldIndex, newIndex)

    // Assign new integer positions
    const updates: Array<{ id: string; position: number }> = reordered.map((p, i) => ({
      id: p.id,
      position: i,
    }))

    // Optimistically update local state
    const updatedPages: PageSummary[] = pages.map((p) => {
      const u = updates.find((u) => u.id === p.id)
      return u ? { ...p, position: u.position } : p
    })
    setPages(updatedPages)

    // Persist each changed position
    await Promise.all(
      updates.map((u, i) =>
        reordered[i].position !== children[i]?.position
          ? api.pages.update(u.id, { position: u.position })
          : Promise.resolve(),
      ),
    )
  }

  if (children.length === 0 && depth === 0) {
    return <p className="px-4 py-2 text-xs text-gray-400">No pages yet</p>
  }

  if (depth > 0) {
    return (
      <ul>
        {children.map((page) => (
          <PageItem key={page.id} page={page} depth={depth} />
        ))}
      </ul>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={children.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <ul>
          {children.map((page) => (
            <PageItem key={page.id} page={page} depth={depth} sortable />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
