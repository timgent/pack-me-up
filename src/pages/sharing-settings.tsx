import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSolidPod } from '../components/SolidPodContext'
import { useDatabase } from '../components/DatabaseContext'
import { useToast } from '../components/ToastContext'
import { reportError } from '../errorReporting'
import {
    grantFullCollaboratorAccess,
    revokeFullCollaboratorAccess,
    getFullCollaborators,
    getPrimaryPodUrl,
    getPodOwnerName,
    resolveOwnerDisplayName,
    buildSharedListPath,
    POD_CONTAINERS,
    getCollaborators,
    isPubliclyAccessible,
} from '../services/solidPod'
import { useOwnerDisplayNames } from '../hooks/useOwnerDisplayName'
import type { SharedContext, SharedListContext } from '../services/rdfSerialization'
import { SharePackingListModal } from '../components/SharePackingListModal'
import type { PackingList } from '../create-packing-list/types'
import { useSharedListsSync } from '../hooks/useSharedListsSync'
import { useSharedWithMeSync } from '../hooks/useSharedWithMeSync'
import { SolidPodPrompt } from '../components/SolidPodPrompt'
import { Button } from '../components/Button'
import {
    clearPendingSignInAction,
    getPendingSignInAction,
    setPendingSignInAction,
} from '../utils/pendingSignInAction'

type ListSharingStatus = { collaborators: string[]; isPublic: boolean } | 'loading' | 'error'

/**
 * The whole-set share has always worked; it was just buried under a label
 * ("People who can access my data") that described plumbing rather than the
 * thing anyone wants. The copy below is deliberately relationship-agnostic —
 * the examples carry the breadth so nobody has to be someone's "partner" to
 * see themselves in it.
 */
const FULL_SETUP_TAGLINE = 'Let someone else use your questions and lists.'

function FullSetupIntro() {
    return (
        <div className="space-y-2">
            <p className="text-sm text-gray-700 dark:text-gray-300">{FULL_SETUP_TAGLINE}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
                They get your question set and every packing list you have — including the ones you
                make later — and can view and edit them. Handy for anyone who packs with the same
                people over and over: couples, families, sports clubs, scout troops, climbing
                buddies.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Sharing just one list? Open that list and choose <strong>Share</strong> — that sends
                a single list, not your whole setup.
            </p>
        </div>
    )
}

export function SharingSettingsPage() {
    const { session, isLoggedIn } = useSolidPod()
    const { db } = useDatabase()
    const { showToast } = useToast()
    const navigate = useNavigate()
    const { sharedWithMe, saveSharedWithMe } = useSharedWithMeSync()
    const { sharedListsWithMe: sharedListsWithMeData, saveSharedListsWithMe } = useSharedListsSync()

    const [ownPodUrl, setOwnPodUrl] = useState<string | null>(null)
    const [collaboratorWebId, setCollaboratorWebId] = useState('')
    const [isGranting, setIsGranting] = useState(false)
    const [inviteLink, setInviteLink] = useState<string | null>(null)
    const [sharedWith, setSharedWith] = useState<string | null>(null)
    const [signInPromptOpen, setSignInPromptOpen] = useState(false)
    const webIdInputRef = useRef<HTMLInputElement>(null)
    const [collaborators, setCollaborators] = useState<string[]>([])
    const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false)
    const [revokingWebId, setRevokingWebId] = useState<string | null>(null)
    const [sharedContexts, setSharedContexts] = useState<SharedContext[]>([])
    const [podNames, setPodNames] = useState<Record<string, string>>({})
    const [removingPodUrl, setRemovingPodUrl] = useState<string | null>(null)

    // Section 3: individual lists shared with me
    const [sharedLists, setSharedLists] = useState<SharedListContext[]>([])
    const [removingListId, setRemovingListId] = useState<string | null>(null)
    const listOwnerNames = useOwnerDisplayNames(
        sharedLists.map(ctx => ({ id: ctx.listId, podUrl: ctx.podUrl, ownerWebId: ctx.ownerWebId ?? null })),
        session
    )

    // Section 4: individual lists I've shared
    const [ownLists, setOwnLists] = useState<PackingList[]>([])
    const [sharingStatusByListId, setSharingStatusByListId] = useState<Record<string, ListSharingStatus>>({})
    const [managingList, setManagingList] = useState<{ fileUrl: string; listId: string } | null>(null)

    useEffect(() => {
        if (!isLoggedIn || !session) return
        getPrimaryPodUrl(session).then(url => setOwnPodUrl(url ?? null))
    }, [isLoggedIn, session])

    // Someone who signed in from the "share your full setup" prompt lands back
    // here — put the cursor where they were going rather than making them find
    // the field again.
    useEffect(() => {
        if (!isLoggedIn) return
        const pending = getPendingSignInAction()
        if (pending?.type !== 'share-full-setup') return
        clearPendingSignInAction()
        webIdInputRef.current?.focus()
        webIdInputRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }, [isLoggedIn])

    const loadCollaborators = useCallback(async () => {
        if (!session || !ownPodUrl) return
        setIsLoadingCollaborators(true)
        try {
            const list = await getFullCollaborators(session, ownPodUrl)
            setCollaborators(list)
        } catch (err) {
            reportError(err, 'SharingSettingsPage: failed to load collaborators')
        } finally {
            setIsLoadingCollaborators(false)
        }
    }, [session, ownPodUrl])

    useEffect(() => {
        if (ownPodUrl) loadCollaborators()
    }, [ownPodUrl, loadCollaborators])

    useEffect(() => {
        if (sharedWithMe) setSharedContexts(sharedWithMe.contexts)
    }, [sharedWithMe])

    useEffect(() => {
        if (!session || sharedContexts.length === 0) return
        const unlabeled = sharedContexts.filter(c => !c.label)
        if (unlabeled.length === 0) return
        Promise.all(unlabeled.map(c => getPodOwnerName(session, c.podUrl, c.webId).then(n => [c.podUrl, n] as const)))
            .then(results => {
                const names: Record<string, string> = {}
                for (const [podUrl, name] of results) {
                    if (name) names[podUrl] = name
                }
                setPodNames(names)
            })
    }, [sharedContexts, session])

    useEffect(() => {
        if (sharedListsWithMeData) setSharedLists(sharedListsWithMeData.lists)
    }, [sharedListsWithMeData])

    // Load own lists + sharing status for section 4
    useEffect(() => {
        if (!isLoggedIn || !ownPodUrl || !session) return
        db.getAllPackingLists().then(lists => {
            const ownOnly = lists.filter(l => !l.sharedFromPodUrl)
            setOwnLists(ownOnly)
            const initialStatus: Record<string, ListSharingStatus> = {}
            for (const list of ownOnly) initialStatus[list.id] = 'loading'
            setSharingStatusByListId(initialStatus)

            for (const list of ownOnly) {
                const fileUrl = `${ownPodUrl}${POD_CONTAINERS.PACKING_LISTS}${list.id}.ttl`
                Promise.all([
                    getCollaborators(session, fileUrl),
                    isPubliclyAccessible(session, fileUrl),
                ])
                    .then(([col, pub]) => {
                        setSharingStatusByListId(prev => ({
                            ...prev,
                            [list.id]: { collaborators: col, isPublic: pub },
                        }))
                    })
                    .catch(() => {
                        setSharingStatusByListId(prev => ({ ...prev, [list.id]: 'error' }))
                    })
            }
        }).catch(() => {})
    }, [isLoggedIn, ownPodUrl, session, db])

    const handleGrantAccess = async () => {
        if (!session || !ownPodUrl || !collaboratorWebId.trim()) return
        setIsGranting(true)
        setInviteLink(null)
        setSharedWith(null)
        try {
            await grantFullCollaboratorAccess(session, ownPodUrl, collaboratorWebId.trim())
            const ownerWebId = session?.info.webId
            const ownerParam = ownerWebId ? `?owner=${encodeURIComponent(ownerWebId)}` : ''
            const link = `${window.location.origin}/#/pod/${encodeURIComponent(ownPodUrl)}/view-lists${ownerParam}`
            setInviteLink(link)
            setSharedWith(collaboratorWebId.trim())
            setCollaboratorWebId('')
            await loadCollaborators()
            showToast('Your full setup is shared', 'success')
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            const details = reportError(err, 'SharingSettingsPage: failed to grant access')
            showToast(`Failed to share your setup: ${msg}`, 'error', details)
        } finally {
            setIsGranting(false)
        }
    }

    const handleCopyInviteLink = async () => {
        if (!inviteLink) return
        try {
            await navigator.clipboard.writeText(inviteLink)
            showToast('Invite link copied', 'success')
        } catch (err) {
            // Clipboard access can be refused (permissions, insecure origin) —
            // the link is on screen and selectable, so say so rather than fail
            // silently.
            const details = reportError(err, 'SharingSettingsPage: failed to copy invite link')
            showToast('Could not copy — select the link and copy it manually.', 'error', details)
        }
    }

    const handleRemoveSharedContext = async (podUrl: string) => {
        setRemovingPodUrl(podUrl)
        try {
            const existing = sharedWithMe ?? { contexts: [], lastModified: new Date().toISOString() }
            await saveSharedWithMe({
                contexts: existing.contexts.filter(c => c.podUrl !== podUrl),
                lastModified: new Date().toISOString(),
            })
            showToast('Removed', 'success')
        } catch (err) {
            const details = reportError(err, 'SharingSettingsPage: failed to remove shared context')
            showToast('Failed to remove. Please try again.', 'error', details)
        } finally {
            setRemovingPodUrl(null)
        }
    }

    const handleRevoke = async (webId: string) => {
        if (!session || !ownPodUrl) return
        setRevokingWebId(webId)
        try {
            await revokeFullCollaboratorAccess(session, ownPodUrl, webId)
            await loadCollaborators()
            showToast('Access revoked', 'success')
        } catch (err) {
            const details = reportError(err, 'SharingSettingsPage: failed to revoke access')
            showToast('Failed to revoke access. Please try again.', 'error', details)
        } finally {
            setRevokingWebId(null)
        }
    }

    const handleRemoveSharedList = async (listId: string) => {
        setRemovingListId(listId)
        try {
            const existing = sharedListsWithMeData ?? { lists: [], lastModified: new Date().toISOString() }
            await saveSharedListsWithMe({
                lists: existing.lists.filter(l => l.listId !== listId),
                lastModified: new Date().toISOString(),
            })
            // Only the local cache of the owner's list goes; their id is not
            // ours to tombstone, and they may share it with us again.
            await db.deletePackingList(listId, { recordDeletion: false }).catch(() => {})
            showToast('Removed', 'success')
        } catch (err) {
            const details = reportError(err, 'SharingSettingsPage: failed to remove shared list')
            showToast('Failed to remove. Please try again.', 'error', details)
        } finally {
            setRemovingListId(null)
        }
    }

    const fullSetupSignInPrompt = (
        <SolidPodPrompt
            isOpen={signInPromptOpen}
            onClose={() => setSignInPromptOpen(false)}
            title="Sign in to share your full setup"
            message="Handing someone your questions and lists needs somewhere online for them to live. Sign in with a Solid Pod and we'll bring you straight back here to finish."
            benefitsTitle="What signing in unlocks:"
            benefits={[
                { label: 'Share your full setup', text: 'Your question set and every list, in one go' },
                { label: 'Pack together', text: 'You both work from the same questions and lists' },
                { label: 'Free', text: 'All major Pod providers are free to sign up' },
                { label: 'You own your data', text: 'Everything stays in your personal storage' },
            ]}
            confirmLabel="🔗 Sign in and share"
            dismissLabel="Not now"
            onBeforeLogin={() => setPendingSignInAction({ type: 'share-full-setup' })}
        />
    )

    if (!isLoggedIn) {
        return (
            <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
                <h1 className="text-3xl font-bold text-primary-900 dark:text-primary-200">Sharing</h1>
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Share your full setup</h2>
                    <FullSetupIntro />
                    <Button type="button" variant="primary" onClick={() => setSignInPromptOpen(true)}>
                        Sign in to share your setup
                    </Button>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Everything you have made so far stays on this device until you sign in — nothing
                        is shared before you say who with.
                    </p>
                </section>
                {fullSetupSignInPrompt}
            </div>
        )
    }

    // The whole-setup grant lives on the pack-me-up container, so an ACL check on
    // any single list reports those people too. Section 4 is about lists shared
    // one at a time, so the full-setup collaborators come off first — otherwise
    // sharing your setup silently makes every list look individually shared.
    const individualCollaborators = (status: ListSharingStatus) =>
        typeof status === 'object' && status !== null
            ? status.collaborators.filter(webId => !collaborators.includes(webId))
            : []

    const isIndividuallyShared = (status: ListSharingStatus | undefined) => {
        if (typeof status !== 'object' || status === null) return false
        return status.isPublic || individualCollaborators(status).length > 0
    }

    const sharedOwnLists = ownLists.filter(list => isIndividuallyShared(sharingStatusByListId[list.id]))

    return (
        <div className="max-w-2xl mx-auto py-8 px-4 space-y-10">
            <div>
                <h1 className="text-3xl font-bold text-primary-900 dark:text-primary-200">Sharing</h1>
            </div>

            {/* Section 1: Share the whole setup — questions + every list */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Share your full setup</h2>
                <FullSetupIntro />
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        ref={webIdInputRef}
                        type="text"
                        value={collaboratorWebId}
                        onChange={e => setCollaboratorWebId(e.target.value)}
                        placeholder="e.g. https://alice.solidcommunity.net/profile/card#me"
                        aria-label="Their WebID"
                        className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                        onClick={handleGrantAccess}
                        disabled={isGranting || !collaboratorWebId.trim()}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                        {isGranting ? 'Sharing…' : 'Share my setup'}
                    </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    A WebID is the address of someone's Solid Pod — ask them to copy theirs from their
                    own sharing page.
                </p>

                {inviteLink && (
                    <div className="mt-2 rounded-xl border-2 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/40 p-4 space-y-2">
                        <p className="text-sm font-semibold text-primary-900 dark:text-primary-200">
                            ✅ Your full setup is shared{sharedWith ? ' with ' + sharedWith : ''}
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            They now have your question set and all your packing lists. Send them this
                            link so they can open it:
                        </p>
                        <input
                            type="text"
                            readOnly
                            value={inviteLink}
                            aria-label="Invite link"
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none"
                            onClick={e => (e.target as HTMLInputElement).select()}
                        />
                        <Button type="button" variant="secondary" onClick={handleCopyInviteLink}>
                            Copy link
                        </Button>
                    </div>
                )}

                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 pt-2">People with your full setup</h3>
                {isLoadingCollaborators ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
                ) : collaborators.length > 0 ? (
                    <ul className="space-y-2 mt-2">
                        {collaborators.map(webId => (
                            <li key={webId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                <span className="text-sm text-gray-800 dark:text-gray-100 truncate flex-1" title={webId}>{webId}</span>
                                <button
                                    onClick={() => handleRevoke(webId)}
                                    disabled={revokingWebId === webId}
                                    aria-label={`Revoke access for ${webId}`}
                                    className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                                >
                                    {revokingWebId === webId ? 'Revoking…' : 'Revoke'}
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">You haven't shared your full setup with anyone yet.</p>
                )}
            </section>

            {/* Section 2: Pods shared with me */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Data shared with me</h2>
                {sharedContexts.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No shared pods yet. Visit an invite link to add one.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {sharedContexts.map(ctx => (
                            <li key={ctx.podUrl} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                <span className="text-sm text-gray-800 dark:text-gray-100 truncate flex-1" title={ctx.podUrl}>
                                    {ctx.label ?? resolveOwnerDisplayName(podNames[ctx.podUrl], ctx.webId, ctx.podUrl)}
                                </span>
                                <button
                                    onClick={() => navigate(`/pod/${encodeURIComponent(ctx.podUrl)}/view-lists`)}
                                    className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60 transition-colors"
                                >
                                    Open
                                </button>
                                <button
                                    onClick={() => handleRemoveSharedContext(ctx.podUrl)}
                                    disabled={removingPodUrl === ctx.podUrl}
                                    aria-label={`Remove shared pod`}
                                    className="ml-2 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                                >
                                    {removingPodUrl === ctx.podUrl ? 'Removing…' : 'Remove'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Section 3: Individual lists shared with me */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Individual lists shared with me</h2>
                {sharedLists.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No individual lists yet. When someone shares a list link with you and you save it, it will appear here.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {sharedLists.map(ctx => (
                            <li key={`${ctx.listId}-${ctx.podUrl}`} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                        {ctx.label ?? ctx.listId}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={ctx.podUrl}>
                                        {resolveOwnerDisplayName(listOwnerNames[ctx.listId], ctx.ownerWebId, ctx.podUrl)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => navigate(buildSharedListPath(ctx.listId, ctx.podUrl, ctx.ownerWebId ?? undefined))}
                                    className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60 transition-colors"
                                >
                                    Open
                                </button>
                                <button
                                    onClick={() => handleRemoveSharedList(ctx.listId)}
                                    disabled={removingListId === ctx.listId}
                                    aria-label={`Remove shared list ${ctx.label ?? ctx.listId}`}
                                    className="ml-2 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                                >
                                    {removingListId === ctx.listId ? 'Removing…' : 'Remove'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Section 4: Individual lists I've shared */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Individual lists I've shared</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Lists you've shared on their own — with specific people or publicly. People who have
                    your full setup are not listed here; they already have every list.
                </p>
                {ownLists.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No packing lists yet.</p>
                ) : sharedOwnLists.length === 0 && Object.values(sharingStatusByListId).every(s => s !== 'loading') ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">You haven't shared any individual lists yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {ownLists
                            .filter(list => {
                                const status = sharingStatusByListId[list.id]
                                if (status === 'loading') return true
                                return isIndividuallyShared(status)
                            })
                            .map(list => {
                                const status = sharingStatusByListId[list.id]
                                return (
                                    <li key={list.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">✈️ {list.name}</span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {status === 'loading' ? 'Loading sharing info…' :
                                                    status === 'error' ? 'Could not load sharing info' :
                                                    [
                                                        status.isPublic ? '🌐 Public' : null,
                                                        individualCollaborators(status).length > 0 ? `👤 ${individualCollaborators(status).length} person${individualCollaborators(status).length > 1 ? 's' : ''}` : null,
                                                    ].filter(Boolean).join(' · ')}
                                            </span>
                                        </div>
                                        {ownPodUrl && session && (
                                            <button
                                                onClick={() => setManagingList({
                                                    fileUrl: `${ownPodUrl}${POD_CONTAINERS.PACKING_LISTS}${list.id}.ttl`,
                                                    listId: list.id,
                                                })}
                                                className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60 transition-colors"
                                            >
                                                Manage sharing
                                            </button>
                                        )}
                                    </li>
                                )
                            })}
                    </ul>
                )}
            </section>

            {/* Manage sharing modal for section 4 */}
            {managingList && session && ownPodUrl && (
                <SharePackingListModal
                    isOpen={managingList !== null}
                    onClose={() => setManagingList(null)}
                    session={session}
                    fileUrl={managingList.fileUrl}
                    listId={managingList.listId}
                    sharerPodUrl={ownPodUrl}
                />
            )}
        </div>
    )
}
