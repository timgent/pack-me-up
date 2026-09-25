import { useEffect, useMemo, useState } from 'react'
import { checkSharedAccess, type SharedAccessState, type SharedAccessTarget } from '../services/sharedAccess'
import type { AppSession } from '../types/AppSession'

/**
 * Which of the shares recorded on this device can be opened yet, keyed as the
 * caller keyed them. A key missing from the result is still being checked,
 * and callers treat that as open — the common case, and what they showed
 * before any check existed.
 */
export function useSharedAccess(
    targets: { key: string; target: SharedAccessTarget }[],
    session: AppSession | null | undefined,
): Record<string, SharedAccessState> {
    const [states, setStates] = useState<Record<string, SharedAccessState>>({})

    // Callers build `targets` afresh each render; this is what actually changes.
    const signature = useMemo(() => JSON.stringify(targets), [targets])

    useEffect(() => {
        if (!session) return
        let cancelled = false
        const current: { key: string; target: SharedAccessTarget }[] = JSON.parse(signature)
        for (const { key, target } of current) {
            checkSharedAccess(session, target).then(state => {
                if (!cancelled) setStates(prev => (prev[key] === state ? prev : { ...prev, [key]: state }))
            })
        }
        return () => { cancelled = true }
    }, [signature, session])

    return states
}
