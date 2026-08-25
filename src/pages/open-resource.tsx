import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useSolidPod } from '../components/SolidPodContext'
import { LoadingState } from '../components/LoadingState'
import { getPrimaryPodUrl } from '../services/solidPod'
import { openInvocationPath } from '../capability/openInvocation'

/**
 * Where an `#open={open}` invocation lands (src/capability/openInvocation.ts
 * rewrites the fragment to `/open?resource=…` before the router sees it).
 *
 * Its only job is to work out where the visitor actually wanted to go. That
 * needs the signed-in person's own pod URL — a list on your own pod is your
 * list, the same IRI on someone else's pod is a list shared with you, and the
 * two open through different routes — which is why this is a route with a
 * session rather than a pure function.
 */
export function OpenResourcePage() {
    const [searchParams] = useSearchParams()
    const resource = searchParams.get('resource')
    const { isLoggedIn, session, isLoading } = useSolidPod()

    // undefined while we still don't know; null means "no pod of your own",
    // which is a real answer and sends everything down the shared route.
    const [ownPodUrl, setOwnPodUrl] = useState<string | null | undefined>(undefined)

    useEffect(() => {
        if (isLoading) return
        if (!isLoggedIn || !session) {
            setOwnPodUrl(null)
            return
        }
        let cancelled = false
        getPrimaryPodUrl(session)
            .then(url => { if (!cancelled) setOwnPodUrl(url) })
            .catch(() => { if (!cancelled) setOwnPodUrl(null) })
        return () => { cancelled = true }
    }, [isLoading, isLoggedIn, session])

    if (!resource) return <CannotOpen resource={null} />

    if (ownPodUrl === undefined) {
        return <LoadingState message="Opening…" rows={1} />
    }

    const path = openInvocationPath(resource, ownPodUrl)
    if (!path) return <CannotOpen resource={resource} />

    return <Navigate to={path} replace />
}

/**
 * Another app can hand this one any IRI it likes, so "we don't know what that
 * is" has to be an ordinary outcome with an ordinary explanation rather than a
 * blank page. The IRI is shown back so the person can see what was asked for.
 */
function CannotOpen({ resource }: { resource: string | null }) {
    return (
        <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Sorry, we can't open that
            </h1>
            <p className="text-gray-700 dark:text-gray-300">
                {resource
                    ? 'Pack Me Up opens packing lists and question sets stored by Pack Me Up. This doesn\'t look like either:'
                    : 'Nothing was passed for Pack Me Up to open.'}
            </p>
            {resource && (
                <p className="break-all rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 font-mono text-sm text-gray-800 dark:text-gray-200">
                    {resource}
                </p>
            )}
            <Link to="/" className="inline-block text-primary-700 dark:text-primary-300 hover:underline">
                Go to your packing lists
            </Link>
        </div>
    )
}
