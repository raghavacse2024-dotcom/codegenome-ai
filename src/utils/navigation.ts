/**
 * Utility to reliably detect if the current page load is a browser reload/refresh
 * versus a fresh navigation (e.g. opening the link in a new tab/window).
 */
export function isPageReload(): boolean {
  try {
    if (typeof window === 'undefined' || !window.performance) {
      return false
    }

    // Modern Navigation Timing API (Level 2)
    if (typeof window.performance.getEntriesByType === 'function') {
      const navEntries = window.performance.getEntriesByType('navigation')
      if (navEntries && navEntries.length > 0) {
        const navTiming = navEntries[0] as PerformanceNavigationTiming
        return navTiming.type === 'reload'
      }
    }

    // Fallback for Navigation Timing (Level 1)
    if (window.performance.navigation) {
      return window.performance.navigation.type === window.performance.navigation.TYPE_RELOAD
    }
  } catch {}

  return false
}
