import { useEffect, useRef, useState } from 'react'

/**
 * Marks a ref as is-visible once it enters the viewport (once).
 * Used for CSS-driven scroll reveals on decorative landing elements.
 */
export function useRevealOnScroll(
  threshold = 0.12,
  rootMargin = '-10% 0px -10% 0px',
) {
  const ref = useRef<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(node)
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold, rootMargin])
  return { ref, visible }
}

/**
 * Tracks the active element ID based on viewport scroll position.
 */
export function useScrollSpy(ids: string[], offset = 100): string {
  const [activeId, setActiveId] = useState<string>(ids[0] || '')

  useEffect(() => {
    if (!ids || ids.length === 0) return

    const handleScroll = () => {
      const scrollPosition = window.scrollY + offset
      let current = ids[0]

      for (const id of ids) {
        const element = document.getElementById(id)
        if (element) {
          const top = element.offsetTop
          if (scrollPosition >= top) {
            current = id
          }
        }
      }
      setActiveId(current)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [ids, offset])

  return activeId
}


