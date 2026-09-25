import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Where a page puts a banner that belongs with the app's other full-width
 * banners, above the padded page container.
 *
 * The app-wide banners (offline, update, tester call) are rendered by App
 * itself, outside the container, so they run edge to edge. A banner that only
 * a route knows it needs — whose data you are looking at — is rendered by
 * that route, inside the container, and so could never be full width. The
 * slot lets the route keep deciding *whether* and *what* while App decides
 * *where*.
 */
const SlotContext = createContext<{ slot: HTMLElement | null; setSlot: (el: HTMLElement | null) => void } | null>(null)

export function PageBannerSlotProvider({ children }: { children: ReactNode }) {
    const [slot, setSlot] = useState<HTMLElement | null>(null)
    return <SlotContext.Provider value={{ slot, setSlot }}>{children}</SlotContext.Provider>
}

/** The place in the layout that page banners appear. */
export function PageBannerSlot() {
    const context = useContext(SlotContext)
    return <div ref={context?.setSlot} />
}

/** Renders a banner into the slot, or in place when there is no slot. */
export function InPageBannerSlot({ children }: { children: ReactNode }) {
    const slot = useContext(SlotContext)?.slot
    return slot ? createPortal(children, slot) : <>{children}</>
}
