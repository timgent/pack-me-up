import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSolidPod } from '../components/SolidPodContext'
import { useDatabase } from '../components/DatabaseContext'
import { useToast } from '../components/ToastContext'
import { successToast } from '../utils/successToastCopy'
import { reportError } from '../errorReporting'
import {
    grantFullCollaboratorAccess,
    revokeFullCollaboratorAccess,
    getFullCollaborators,
    getPrimaryPodUrl,
    getPodOwnerName,
    resolveOwnerDisplayName,
    buildSharedListPath,
    buildSharedSetupUrl,
    POD_CONTAINERS,
    getCollaborators,
    isPubliclyAccessible,
    friendlyWebIdName,
} from '../services/solidPod'
import { useOwnerDisplayNames } from '../hooks/useOwnerDisplayName'
import { useSolidProfile } from '../hooks/useSolidProfile'
import type { SharedContext, SharedListContext } from '../services/rdfSerialization'
import { SharePackingListModal } from '../components/SharePackingListModal'
import type { PackingList } from '../create-packing-list/types'
import { useSharedListsSync } from '../hooks/useSharedListsSync'
import { useSharedWithMeSync } from '../hooks/useSharedWithMeSync'
import { useSharedAccess } from '../hooks/useSharedAccess'
import { withAccessConfirmed } from '../services/acceptedInvites'
import { SolidPodPrompt } from '../components/SolidPodPrompt'
import { Button } from '../components/Button'
import { CollaboratorIdentity } from '../components/CollaboratorIdentity'
import { CreateInviteLink } from '../components/CreateInviteLink'
import { PeopleSuggestions } from '../components/PeopleSuggestions'
import { ShareableLink } from '../components/ShareableLink'
import { WebIdField } from '../components/WebIdField'
import { YourSharingAddress } from '../components/YourSharingAddress'
import { ShareByAddress } from '../components/ShareByAddress'
import { useInviteRedemptionVersion } from '../components/InviteRedemptionContext'
import { useKnownPeople } from '../hooks/useKnownPeople'
import { deleteInvite, listInvites, type StoredInvite } from '../services/invites'
import { useWebIdLookup } from '../hooks/useWebIdLookup'
import {
    clearPendingSignInAction,
    getPendingSignInAction,
    setPendingSignInAction,
} from '../utils/pendingSignInAction'

type ListSharingStatus = { collaborators: string[]; isPublic: boolean } | 'loading' | 'error'

/**
 * The whole-set share has always worked; it was just buried under a label
 * ("People who can access my data") that described plumbing rather than the
 * thing anyone wants. Two sentences: what they get, and where to go for less.
 * Relationship-agnostic, so nobody has to be someone's "partner" to see
 * themselves in it.
 */
function FullSetupIntro() {
    return (
        <div className="space-y-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
                Let someone else use your questions and every packing list — including ones you
                make later. They can view and edit them.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Just one list? Open it and choose <strong>Share</strong>.
            </p>
        </div>
    )
}

/**
 * Why a share that is refused cannot be opened — and there are two reasons,
 * which call for opposite things from the reader.
 *
 * Never yet opened (`awaitingAccess`): an accepted invite whose sender's app
 * has not run since. Nothing can grant on their behalf while they are away, so
 * this is a wait, said as one. Opened before: they have stopped sharing it,
 * and waiting would be waiting for ever — so it says so, and Remove is the
 * way to tidy it away.
 */
function ShareUnavailable({ ownerName, awaitingAccess }: { ownerName: string; awaitingAccess?: boolean }) {
    return awaitingAccess ? (
        <span className="text-xs text-amber-700 dark:text-amber-300">
            Waiting for {ownerName} to open Pack Me Up — you can open this once they have
        </span>
    ) : (
        <span className="text-xs text-red-700 dark:text-red-300">
            {ownerName} has stopped sharing this with you — ask them to share it again, or remove it
        </span>
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
    const collaboratorLookup = useWebIdLookup(collaboratorWebId, session)
    const knownPeople = useKnownPeople()
    // Redemption grants access moments after this page has loaded, so both
    // lists below have to re-read when it does.
    const redemptionVersion = useInviteRedemptionVersion()
    const [pendingInvites, setPendingInvites] = useState<StoredInvite[]>([])
    const [revokingInvite, setRevokingInvite] = useState<string | null>(null)
    const [isGranting, setIsGranting] = useState(false)
    const [inviteLink, setInviteLink] = useState<string | null>(null)
    const [sharedWith, setSharedWith] = useState<string | null>(null)
    // Their card is already cached from the field's own check a moment ago, so
    // naming them in the confirmation costs nothing.
    const sharedWithProfile = useSolidProfile(sharedWith ?? undefined, session)
    const [signInPromptOpen, setSignInPromptOpen] = useState(false)
    const fullSetupRef = useRef<HTMLElement>(null)
    const [addressOpen, setAddressOpen] = useState(false)
    const [collaborators, setCollaborators] = useState<string[]>([])
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

    // An accepted invite is recorded before the sender's app has granted
    // anything, so each share says whether it can be opened yet.
    const accessTargets = useMemo(() => [
        ...sharedContexts.map(ctx => ({ key: `setup:${ctx.podUrl}`, target: { kind: 'setup' as const, podUrl: ctx.podUrl } })),
        ...sharedLists.map(ctx => ({ key: `list:${ctx.listUrl}`, target: { kind: 'list' as const, listUrl: ctx.listUrl } })),
    ], [sharedContexts, sharedLists])
    const shareAccess = useSharedAccess(accessTargets, session)

    // A share that was waiting and has now opened stops waiting, so that a
    // later refusal reads as what it is: access taken away.
    useEffect(() => {
        const now = new Date().toISOString()
        if (sharedWithMe) {
            for (const ctx of sharedWithMe.contexts) {
                if (!ctx.awaitingAccess || shareAccess[`setup:${ctx.podUrl}`] !== 'open') continue
                const updated = withAccessConfirmed(sharedWithMe, { kind: 'setup', podUrl: ctx.podUrl }, now)
                if (updated) saveSharedWithMe(updated).catch(err => reportError(err, 'SharingSettingsPage: failed to record that a share opened'))
                break
            }
        }
        if (sharedListsWithMeData) {
            for (const ctx of sharedListsWithMeData.lists) {
                if (!ctx.awaitingAccess || shareAccess[`list:${ctx.listUrl}`] !== 'open') continue
                const updated = withAccessConfirmed(sharedListsWithMeData, { kind: 'list', listUrl: ctx.listUrl }, now)
                if (updated) saveSharedListsWithMe(updated).catch(err => reportError(err, 'SharingSettingsPage: failed to record that a share opened'))
                break
            }
        }
    // Re-runs when an answer arrives or a save lands; each pass clears one
    // entry, and the saved document drives the next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shareAccess, sharedWithMe, sharedListsWithMeData])

    // Section 4: individual lists I've shared
    const [ownLists, setOwnLists] = useState<PackingList[]>([])
    const [sharingStatusByListId, setSharingStatusByListId] = useState<Record<string, ListSharingStatus>>({})
    const [managingList, setManagingList] = useState<{ fileUrl: string; listId: string; name: string } | null>(null)

    useEffect(() => {
        if (!isLoggedIn || !session) return
        getPrimaryPodUrl(session).then(url => setOwnPodUrl(url ?? null))
    }, [isLoggedIn, session])

    // Someone who signed in from the "share your full setup" prompt lands back
    // here — put them on the invite link, which is where they were going. It
    // renders once the Pod URL is known, so this waits for that.
    useEffect(() => {
        if (!isLoggedIn || !ownPodUrl) return
        const pending = getPendingSignInAction()
        if (pending?.type !== 'share-full-setup') return
        clearPendingSignInAction()
        const button = fullSetupRef.current?.querySelector('button')
        button?.focus()
        button?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }, [isLoggedIn, ownPodUrl])

    const loadCollaborators = useCallback(async () => {
        if (!session || !ownPodUrl) return
        try {
            const list = await getFullCollaborators(session, ownPodUrl)
            setCollaborators(list)
        } catch (err) {
            reportError(err, 'SharingSettingsPage: failed to load collaborators')
        }
    // `redemptionVersion` is a change signal rather than an input: redeeming
    // an invite grants access, which is exactly what this reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, ownPodUrl, redemptionVersion])

    useEffect(() => {
        if (ownPodUrl) loadCollaborators()
    }, [ownPodUrl, loadCollaborators])

    const loadInvites = useCallback(async () => {
        if (!session || !ownPodUrl) return
        // Never fatal: an unreadable invites container only means no links to
        // show, and the rest of this page is unaffected by it.
        setPendingInvites(await listInvites(session, ownPodUrl).catch(() => []))
    // Redeeming an invite deletes it, so this list changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, ownPodUrl, redemptionVersion])

    useEffect(() => { loadInvites() }, [loadInvites])

    const handleRevokeInvite = async (invite: StoredInvite) => {
        if (!session) return
        setRevokingInvite(invite.url)
        try {
            await deleteInvite(session, invite.url)
            setPendingInvites(current => current.filter(i => i.url !== invite.url))
            showToast('Invite link revoked — it stops working straight away', 'success')
        } catch (err) {
            const details = reportError(err, 'SharingSettingsPage: failed to revoke invite')
            showToast('Failed to revoke that invite link. Please try again.', 'error', details)
        } finally {
            setRevokingInvite(null)
        }
    }

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
        const theirWebId = collaboratorLookup.webId
        if (!session || !ownPodUrl || !theirWebId) return
        setIsGranting(true)
        setInviteLink(null)
        setSharedWith(null)
        try {
            await grantFullCollaboratorAccess(session, ownPodUrl, theirWebId)
            const ownerWebId = session?.info.webId
            // Built on the app's public origin, not this device's: inside the
            // native shell the runtime origin is `https://localhost` (#357).
            const link = buildSharedSetupUrl(ownPodUrl, ownerWebId ?? undefined)
            setInviteLink(link)
            setSharedWith(theirWebId)
            setCollaboratorWebId('')
            await loadCollaborators()
            showToast(successToast('setupShared'), 'success')
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            const details = reportError(err, 'SharingSettingsPage: failed to grant access')
            showToast(`Failed to share your setup: ${msg}`, 'error', details)
        } finally {
            setIsGranting(false)
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
            // The "shared with X" confirmation is component state, and this page
            // is not remounted by hash navigation — so revoking X left a banner
            // on screen saying they still had everything. Nothing else clears
            // it, so it has to be cleared here.
            if (sharedWith === webId) {
                setInviteLink(null)
                setSharedWith(null)
            }
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
            confirmLabel="Sign in and share"
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
            <section ref={fullSetupRef} className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Share your full setup</h2>
                <FullSetupIntro />
                {session && ownPodUrl && (
                    <CreateInviteLink
                        session={session}
                        podUrl={ownPodUrl}
                        kind="full-setup"
                        subject="my questions and packing lists"
                        onCreated={invite => setPendingInvites(current => [...current, invite])}
                    />
                )}

                {/* One tap for people the device already knows — kept in view,
                    unlike the typed address, because it asks nothing of anyone. */}
                <PeopleSuggestions
                    people={knownPeople}
                    alreadyShared={collaborators}
                    onPick={webId => {
                        setCollaboratorWebId(webId)
                        setAddressOpen(true)
                    }}
                    label="Or share straight away with"
                />
                <ShareByAddress open={addressOpen} onOpenChange={setAddressOpen}>
                    <WebIdField
                        label="Their sharing address (WebID)"
                        placeholder="e.g. https://alice.solidcommunity.net/profile/card#me"
                        value={collaboratorWebId}
                        onChange={setCollaboratorWebId}
                        lookup={collaboratorLookup}
                        disabled={isGranting}
                    />
                    <button
                        onClick={handleGrantAccess}
                        disabled={isGranting || !collaboratorLookup.webId}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                        {isGranting ? 'Sharing…' : 'Share my setup'}
                    </button>
                    {/* Theirs is what this path needs; yours is what the same path
                        needs when it runs the other way. */}
                    {session?.info.webId && (
                        <YourSharingAddress
                            webId={session.info.webId}
                            title="Your own address"
                            description="If someone wants to share with you this way, send them this."
                        />
                    )}
                </ShareByAddress>

                {inviteLink && (
                    <div className="mt-2 rounded-xl border-2 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/40 p-4 space-y-2">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-primary-900 dark:text-primary-200">
                            <CheckCircleIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                            Your full setup is shared
                            {sharedWith && ` with ${sharedWithProfile.name ?? friendlyWebIdName(sharedWith)}`}
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            They now have your question set and all your packing lists. Send them this
                            link so they can open it:
                        </p>
                        <ShareableLink link={inviteLink} label="Invite link" subject="my questions and packing lists" />
                    </div>
                )}

                {collaborators.length > 0 && (
                    <>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 pt-2">People with your full setup</h3>
                    <ul className="space-y-2 mt-2">
                        {collaborators.map(webId => (
                            <li key={webId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                <CollaboratorIdentity webId={webId} session={session} />
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
                    </>
                )}
            </section>

            {/* Invite links that have been handed out and not yet used up. */}
            {pendingInvites.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Invite links you've sent</h2>
                    <ul className="space-y-2">
                        {pendingInvites.map(invite => (
                            <li key={invite.url} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                        {invite.kind === 'full-setup'
                                            ? 'Your full setup'
                                            : invite.label ?? 'One packing list'}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {invite.acceptedBy.length > 0
                                            ? 'Accepted — access is granted next time this app opens'
                                            : `Sent ${new Date(invite.createdAt).toLocaleDateString()}, not accepted yet`}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleRevokeInvite(invite)}
                                    disabled={revokingInvite === invite.url}
                                    aria-label={`Revoke invite link for ${invite.kind === 'full-setup' ? 'your full setup' : invite.label ?? 'a packing list'}`}
                                    className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                                >
                                    {revokingInvite === invite.url ? 'Revoking…' : 'Revoke'}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Section 2: everything shared with me — whole setups and single
                lists together, because to the person receiving them it is one
                question: what do I have? */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Shared with me</h2>
                {sharedContexts.length === 0 && sharedLists.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Nothing has been shared with you yet.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {sharedContexts.map(ctx => {
                            const ownerName = ctx.label ?? resolveOwnerDisplayName(podNames[ctx.podUrl], ctx.webId, ctx.podUrl)
                            const refused = shareAccess[`setup:${ctx.podUrl}`] === 'refused'
                            return (
                                <li key={ctx.podUrl} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate" title={ctx.podUrl}>
                                            {ownerName}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Full setup</span>
                                        {refused && <ShareUnavailable ownerName={ownerName} awaitingAccess={ctx.awaitingAccess} />}
                                    </div>
                                    {!refused && <button
                                        onClick={() => navigate(`/pod/${encodeURIComponent(ctx.podUrl)}/view-lists`)}
                                        className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60 transition-colors"
                                    >
                                        Open
                                    </button>}
                                    <button
                                        onClick={() => handleRemoveSharedContext(ctx.podUrl)}
                                        disabled={removingPodUrl === ctx.podUrl}
                                        aria-label={`Remove shared pod`}
                                        className="ml-2 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                                    >
                                        {removingPodUrl === ctx.podUrl ? 'Removing…' : 'Remove'}
                                    </button>
                                </li>
                            )
                        })}
                        {sharedLists.map(ctx => {
                            const ownerName = resolveOwnerDisplayName(listOwnerNames[ctx.listId], ctx.ownerWebId, ctx.podUrl)
                            const refused = shareAccess[`list:${ctx.listUrl}`] === 'refused'
                            return (
                                <li key={`${ctx.listId}-${ctx.podUrl}`} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                            {ctx.label ?? ctx.listId}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={ctx.podUrl}>
                                            {ownerName}
                                        </span>
                                        {refused && <ShareUnavailable ownerName={ownerName} awaitingAccess={ctx.awaitingAccess} />}
                                    </div>
                                    {!refused && <button
                                        onClick={() => navigate(buildSharedListPath(ctx.listId, ctx.podUrl, ctx.ownerWebId ?? undefined))}
                                        className="ml-3 px-3 py-1 text-xs font-semibold rounded-md bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/60 transition-colors"
                                    >
                                        Open
                                    </button>}
                                    <button
                                        onClick={() => handleRemoveSharedList(ctx.listId)}
                                        disabled={removingListId === ctx.listId}
                                        aria-label={`Remove shared list ${ctx.label ?? ctx.listId}`}
                                        className="ml-2 px-3 py-1 text-xs font-semibold rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                                    >
                                        {removingListId === ctx.listId ? 'Removing…' : 'Remove'}
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>

            {/* Section 4: Individual lists I've shared — only once some are
                known to be. Full-setup people are left out: they already have
                every list. Nothing shows while checking, since otherwise every
                list flashes up as "loading" and then vanishes. */}
            {sharedOwnLists.length > 0 && (
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Individual lists I've shared</h2>
                <ul className="space-y-2">
                    {sharedOwnLists.map(list => {
                            const status = sharingStatusByListId[list.id]
                            if (typeof status !== 'object') return null
                            const people = individualCollaborators(status).length
                            return (
                                <li key={list.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                                    <div className="flex flex-col flex-1 min-w-0">
                                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{list.name}</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                            {[
                                                status.isPublic ? 'Public' : null,
                                                people > 0 ? `Shared with ${people} ${people === 1 ? 'person' : 'people'}` : null,
                                            ].filter(Boolean).join(' · ')}
                                        </span>
                                    </div>
                                    {ownPodUrl && session && (
                                        <button
                                            onClick={() => setManagingList({
                                                fileUrl: `${ownPodUrl}${POD_CONTAINERS.PACKING_LISTS}${list.id}.ttl`,
                                                listId: list.id,
                                                name: list.name,
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
            </section>
            )}

            {/* Manage sharing modal for section 4 */}
            {managingList && session && ownPodUrl && (
                <SharePackingListModal
                    isOpen={managingList !== null}
                    onClose={() => setManagingList(null)}
                    session={session}
                    fileUrl={managingList.fileUrl}
                    listId={managingList.listId}
                    listName={managingList.name}
                    sharerPodUrl={ownPodUrl}
                    knownPeople={knownPeople}
                />
            )}
        </div>
    )
}
