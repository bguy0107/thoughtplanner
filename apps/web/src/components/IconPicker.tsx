'use client'

import { useState, useRef, useEffect } from 'react'
import { Smile } from 'lucide-react'
import { cn } from '@/lib/utils'

const EMOJI_GROUPS = [
  {
    label: 'Documents',
    emojis: ['📝', '📄', '📃', '📋', '📊', '📈', '📉', '🗒️', '📅', '📆', '🗓️', '📁', '📂', '🗂️', '🔖', '🏷️'],
  },
  {
    label: 'Objects',
    emojis: ['💡', '🔍', '🔑', '🔒', '🔓', '📌', '📍', '✏️', '🖊️', '🖋️', '📏', '📐', '🔧', '🔨', '⚙️', '🧩'],
  },
  {
    label: 'Nature',
    emojis: ['🌱', '🌿', '🌲', '🌳', '🌸', '🌺', '🌻', '🌙', '⭐', '🌟', '☀️', '🌈', '❄️', '🌊', '🔥', '💧'],
  },
  {
    label: 'Symbols',
    emojis: ['✅', '❌', '⚡', '💯', '🎯', '🏆', '🥇', '🎖️', '🎗️', '🚀', '💎', '❤️', '🧡', '💛', '💚', '💙'],
  },
  {
    label: 'People',
    emojis: ['👤', '👥', '🧠', '👁️', '✋', '👍', '👎', '🤝', '🙌', '💪', '🎭', '🎪', '🧑‍💻', '👩‍🎨', '🧑‍🔬', '👨‍🏫'],
  },
]

interface IconPickerProps {
  value: string | null
  onChange: (icon: string | null) => void
  size?: 'sm' | 'lg'
}

export function IconPicker({ value, onChange, size = 'lg' }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const triggerClass = size === 'lg'
    ? 'text-5xl hover:opacity-70 transition-opacity leading-none'
    : 'text-xl hover:opacity-70 transition-opacity leading-none'

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        title={value ? 'Change icon' : 'Add icon'}
      >
        {value || (
          <span className="flex items-center gap-1 text-sm text-gray-400 font-normal hover:text-gray-600 transition-colors">
            <Smile size={16} />
            Add icon
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-2xl p-3 w-72">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Icon</span>
            {value && (
              <button
                onClick={() => { onChange(null); setOpen(false) }}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Remove
              </button>
            )}
          </div>

          {EMOJI_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="text-xs text-gray-400 mb-1">{group.label}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => { onChange(emoji); setOpen(false) }}
                    className={cn(
                      'text-xl p-1 rounded hover:bg-gray-100 transition-colors leading-none',
                      value === emoji && 'bg-blue-50 ring-1 ring-blue-400',
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
