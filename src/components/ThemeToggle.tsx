import React, { useRef, useState, useEffect } from 'react'
import { motion, useMotionValue, useSpring, PanInfo } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useTheme, THEMES, ThemeId } from '../hooks/useTheme'

interface ThemeToggleProps {
  theme?: ThemeId
  onThemeChange?: (theme: ThemeId) => void
  compact?: boolean
}

const SLOT_WIDTH = 34 // Width of each slot in px
const MAX_DRAG = 34 // 1 * 34 = 34px for 2 modes

export function ThemeToggle({ theme: propTheme, onThemeChange, compact = false }: ThemeToggleProps) {
  const hookTheme = useTheme()
  const activeTheme = propTheme ?? hookTheme.theme
  const selectTheme = onThemeChange ?? hookTheme.setTheme
  const trackRef = useRef<HTMLDivElement>(null)

  const activeIndex = THEMES.findIndex((t) => t.id === activeTheme)
  const safeIndex = activeIndex === -1 ? 0 : activeIndex

  const [isDragging, setIsDragging] = useState(false)
  const x = useMotionValue(safeIndex * SLOT_WIDTH)
  const springX = useSpring(x, { stiffness: 450, damping: 30 })

  // Keep spring in sync with active theme whenever activeIndex changes while not dragging
  useEffect(() => {
    if (!isDragging) {
      x.set(safeIndex * SLOT_WIDTH)
    }
  }, [safeIndex, isDragging, x])

  const handleDragStart = () => {
    setIsDragging(true)
  }

  const handleDrag = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const currentX = safeIndex * SLOT_WIDTH + info.offset.x
    const clampedX = Math.max(0, Math.min(MAX_DRAG, currentX))
    const nearestIndex = Math.round(clampedX / SLOT_WIDTH)
    if (THEMES[nearestIndex] && THEMES[nearestIndex].id !== activeTheme) {
      selectTheme(THEMES[nearestIndex].id)
    }
  }

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false)
    const currentX = safeIndex * SLOT_WIDTH + info.offset.x
    const clampedX = Math.max(0, Math.min(MAX_DRAG, currentX))
    const nearestIndex = Math.round(clampedX / SLOT_WIDTH)
    const targetTheme = THEMES[nearestIndex] ? THEMES[nearestIndex].id : 'dark-obsidian'
    selectTheme(targetTheme)
    x.set(nearestIndex * SLOT_WIDTH)
  }

  const handleSlotClick = (index: number, themeId: ThemeId) => {
    selectTheme(themeId)
    x.set(index * SLOT_WIDTH)
  }

  const currentTheme = THEMES[safeIndex] || THEMES[0]

  return (
    <div className={`capsule-switch-wrapper ${compact ? 'is-compact' : ''}`}>
      <div
        ref={trackRef}
        className="capsule-switch-track"
        role="radiogroup"
        aria-label="Theme Switcher (Dark Mode, Light Mode)"
        title={`Current: ${currentTheme.name} (Drag side by side or tap to toggle)`}
      >
        {/* Draggable Active Capsule Thumb */}
        <motion.div
          className={`capsule-switch-thumb theme-${currentTheme.id}`}
          style={{ x: isDragging ? x : springX }}
          drag="x"
          dragConstraints={{ left: 0, right: MAX_DRAG }}
          dragElastic={0.08}
          dragMomentum={false}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          whileDrag={{ scale: 1.08, cursor: 'grabbing' }}
          whileHover={{ scale: 1.04 }}
          transition={{ type: 'spring', stiffness: 450, damping: 30 }}
        >
          <div className="capsule-switch-thumb-glow" />
        </motion.div>

        {/* 2 White Icon Buttons Inside Capsule Track */}
        {THEMES.map((item, index) => {
          const isActive = activeTheme === item.id
          const Icon = item.id === 'dark-obsidian' ? Moon : Sun

          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={item.name}
              title={`${item.name} — ${item.description}`}
              className={`capsule-switch-slot ${isActive ? 'is-active' : ''}`}
              onClick={() => handleSlotClick(index, item.id)}
            >
              <span className={`capsule-switch-icon-container ${isActive ? 'is-active-icon' : ''}`}>
                <Icon size={15} className="capsule-white-icon" strokeWidth={2.2} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
