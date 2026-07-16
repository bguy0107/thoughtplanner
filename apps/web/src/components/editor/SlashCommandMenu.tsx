'use client'

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { type SlashCommandItem } from './extensions/SlashCommand'

interface Props {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

export interface SlashCommandMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, Props>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0)

    useEffect(() => setSelected(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown({ key }) {
        if (key === 'ArrowUp') {
          setSelected((s) => (s - 1 + items.length) % items.length)
          return true
        }
        if (key === 'ArrowDown') {
          setSelected((s) => (s + 1) % items.length)
          return true
        }
        if (key === 'Enter') {
          command(items[selected])
          return true
        }
        return false
      },
    }))

    if (items.length === 0) return null

    return (
      <div className="slash-command-menu">
        {items.map((item, i) => (
          <button
            key={item.title}
            className={`slash-command-item w-full text-left ${i === selected ? 'is-selected' : ''}`}
            onClick={() => command(item)}
            onMouseEnter={() => setSelected(i)}
          >
            <span className="w-7 h-7 flex items-center justify-center text-xs font-mono bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300 flex-shrink-0">
              {item.icon}
            </span>
            <span>
              <div className="font-medium text-gray-800 dark:text-gray-200">{item.title}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500">{item.description}</div>
            </span>
          </button>
        ))}
      </div>
    )
  },
)

SlashCommandMenu.displayName = 'SlashCommandMenu'
