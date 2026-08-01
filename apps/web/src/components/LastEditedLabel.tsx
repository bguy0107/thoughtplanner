'use client'

import { useEffect, useState } from 'react'

function formatRelativeTime(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.round(diffHour / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString()
}

interface Props {
  updatedAt: string
  updatedBy: { name: string }
}

export function LastEditedLabel({ updatedAt, updatedBy }: Props) {
  // Relative time drifts stale on its own — re-render on an interval to keep it current.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <span
      title={new Date(updatedAt).toLocaleString()}
      className="shrink-0 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap"
    >
      Edited {formatRelativeTime(updatedAt)} by {updatedBy.name}
    </span>
  )
}
