import { useEffect, useRef, useState } from 'react'
import { registerPwaServiceWorker, type ApplyUpdate } from '../services/pwaUpdate'

/**
 * Registers the service worker once per app lifetime and exposes whether a
 * shipped build is waiting to take over, plus the way to apply it. See
 * services/pwaUpdate.ts for why this waits to be asked rather than reloading
 * on its own.
 */
export function usePwaUpdate() {
    const [needsRefresh, setNeedsRefresh] = useState(false)
    const updateRef = useRef<ApplyUpdate | undefined>(undefined)
    const registered = useRef(false)

    useEffect(() => {
        if (registered.current) return
        registered.current = true
        updateRef.current = registerPwaServiceWorker(() => setNeedsRefresh(true))
    }, [])

    const reload = () => {
        updateRef.current?.()
    }

    return { needsRefresh, reload }
}
