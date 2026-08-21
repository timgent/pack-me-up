import { useEffect, useRef, useState } from 'react'

/**
 * How wide an element actually is, watched.
 *
 * Used where a layout decision depends on the room available rather than on
 * the screen size: a card in a two-up desktop grid and a card on a phone are
 * different widths at the same breakpoint, and rotating a phone changes the
 * answer without changing anything a media query can see.
 *
 * Reports 0 until it has measured (and where there is no ResizeObserver, such
 * as in tests), so callers need a sensible answer for "not known yet".
 */
export function useMeasuredWidth<T extends HTMLElement>() {
    const ref = useRef<T | null>(null)
    const [width, setWidth] = useState(0)

    useEffect(() => {
        const element = ref.current
        if (!element) return
        const measure = () => setWidth(element.clientWidth)
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    return { ref, width }
}
