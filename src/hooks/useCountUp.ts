import { useEffect, useRef, useState } from 'react'

/**
 * Eases a number from zero to its target so metric cards animate on mount.
 * Respects the user's reduced-motion preference by snapping to the value.
 */
export function useCountUp(target: number, duration = 1100) {
  const [value, setValue] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    if (!Number.isFinite(target)) {
      setValue(0)
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }

    const started = performance.now()
    function tick(now: number) {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(target * eased))
      if (progress < 1) frame.current = window.requestAnimationFrame(tick)
    }

    frame.current = window.requestAnimationFrame(tick)
    // Safety net: rAF is suspended in background tabs, so guarantee the final value.
    const failsafe = window.setTimeout(() => setValue(target), duration + 250)

    return () => {
      window.cancelAnimationFrame(frame.current)
      window.clearTimeout(failsafe)
    }
  }, [target, duration])

  return value
}
