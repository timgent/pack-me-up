import { useEffect, useRef, useState } from 'react'
import type { AppSession } from '../types/AppSession'
import { getPodOwnerName } from '../services/solidPod'

export function useOwnerDisplayName(
    podUrl: string | undefined,
    ownerWebId: string | undefined,
    session: AppSession | null | undefined,
): string | null {
    const [name, setName] = useState<string | null>(null)
    useEffect(() => {
        if (!podUrl || !session) return
        let cancelled = false
        getPodOwnerName(session, podUrl, ownerWebId)
            .then(n => { if (n && !cancelled) setName(n) })
            .catch(() => {})
        return () => { cancelled = true }
    }, [podUrl, ownerWebId, session])
    return name
}

export function useOwnerDisplayNames(
    items: Array<{ id: string; podUrl: string; ownerWebId?: string | null }>,
    session: AppSession | null | undefined,
): Record<string, string> {
    const [names, setNames] = useState<Record<string, string>>({})
    const itemsRef = useRef(items)
    itemsRef.current = items
    // Stable key: only re-fetch when item identities change, not on every render
    const itemsKey = items.map(i => `${i.id}:${i.ownerWebId ?? ''}`).join(',')

    useEffect(() => {
        if (!session || itemsRef.current.length === 0) return
        for (const item of itemsRef.current) {
            getPodOwnerName(session, item.podUrl, item.ownerWebId ?? undefined)
                .then(name => {
                    if (name) setNames(prev => ({ ...prev, [item.id]: name }))
                })
                .catch(() => {})
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsKey captures item identity; ref used to read latest values
    }, [itemsKey, session])
    return names
}
