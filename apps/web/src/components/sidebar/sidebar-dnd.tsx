'use client'

import { createContext, useContext } from 'react'

export type DropZone = 'before' | 'inside' | 'after'

export function zoneId(zone: DropZone, pageId: string) {
  return `${zone}:${pageId}`
}

export function parseZoneId(id: string): { zone: DropZone; pageId: string } | null {
  const idx = id.indexOf(':')
  if (idx === -1) return null
  const zone = id.slice(0, idx)
  if (zone !== 'before' && zone !== 'inside' && zone !== 'after') return null
  return { zone, pageId: id.slice(idx + 1) }
}

interface SidebarDragState {
  overId: string | null
  invalidTargetIds: Set<string>
}

const defaultState: SidebarDragState = { overId: null, invalidTargetIds: new Set() }

export const SidebarDragContext = createContext<SidebarDragState>(defaultState)

export function useSidebarDrag() {
  return useContext(SidebarDragContext)
}
