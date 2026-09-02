import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useSolidPod } from './SolidPodContext'
import { useDatabase } from './DatabaseContext'
import { SolidProviderSelector } from './SolidProviderSelector'
import { AccountMenu, ProfileBadge } from './AccountMenu'
import { ThemeToggle } from './ThemeToggle'
import { profileDisplayName, useSolidProfile } from '../hooks/useSolidProfile'
import type { SharedContext } from '../services/rdfSerialization'

/**
 * The one thing the nav owes a signed-in user whose Pod is unreachable: which of
 * the two states they are in. Their name is on screen either way, so without
 * this the only difference between "synced" and "not syncing" would be invisible.
 */
const OfflineBadge = () => (
    <span
        data-testid="nav-offline-badge"
        className="px-2 py-0.5 rounded-full bg-white/20 text-xs font-semibold whitespace-nowrap"
        title="You're still signed in. Your Pod is out of reach, so changes will sync when the connection is back."
    >
        Offline
    </span>
)

export const Navigation = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const { login, logout, isLoggedIn, isReconnecting, webId, session } = useSolidPod()
    const { db, loginSyncVersion } = useDatabase()
    const location = useLocation()
    const navigate = useNavigate()
    const [sharedContexts, setSharedContexts] = useState<SharedContext[]>([])

    useEffect(() => {
        db.getSharedWithMe()
            .then(swm => setSharedContexts(swm.contexts))
            .catch(() => {})
    }, [db, loginSyncVersion])

    const profile = useSolidProfile(webId, session)
    const displayName = profileDisplayName(profile, webId)

    // Signed in is signed in, whether or not the Pod can be reached right now.
    // Offering "Sync & Share" to someone whose session is merely offline is what
    // made a lost connection read as a logout (#342); the badge below says which
    // of the two it is, so nothing is hidden — it just isn't a sign-in prompt.
    const showsAsSignedIn = isLoggedIn || isReconnecting

    const podMatch = /^\/pod\/([^/]+)/.exec(location.pathname)
    const currentForeignEncoded = podMatch?.[1] ?? null
    const inForeignContext = currentForeignEncoded !== null

    // When viewing a foreign pod, contextual links stay inside that pod's routes
    const viewListsPath = inForeignContext ? `/pod/${currentForeignEncoded}/view-lists` : '/view-lists'
    const manageQuestionsPath = inForeignContext ? `/pod/${currentForeignEncoded}/manage-questions` : '/manage-questions'

    const handleSolidLogin = () => {
        setIsProviderSelectorOpen(true)
    }

    const handleProviderSelect = (issuer: string) => {
        return login(issuer)
    }

    const handleLogout = async () => {
        await logout()
    }

    return (
        <>
            <nav className="bg-primary-950 text-white shadow-soft safe-area-top">
                <div className="max-w-7xl mx-auto px-4">
                    <div data-testid="nav-bar" className="flex items-center justify-between h-14 md:h-16">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <Link to="/home" className="flex items-center gap-2 text-xl md:text-2xl font-bold hover:scale-105 transition-transform duration-200 drop-shadow-md">
                                    <img src="/favicon.svg" alt="" className="h-7 w-7 md:h-8 md:w-8" />
                                    Pack Me Up
                                </Link>
                            </div>
                            <div className="hidden md:block">
                                <div className="ml-10 flex items-baseline space-x-2">
                                    <Link
                                        to={manageQuestionsPath}
                                        className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-all duration-200 hover:scale-105"
                                    >
                                        {inForeignContext ? 'Questions & Items' : 'My Questions & Items'}
                                    </Link>
                                    {/*
                                      * No "Create List" here: creating starts from
                                      * Lists, where the "New List" button sits, in
                                      * your own pod and in someone else's alike.
                                      * Backups lives in the account menu — it is a
                                      * once-in-a-while destination, not an everyday
                                      * one. See #302.
                                      */}
                                    <Link
                                        to={viewListsPath}
                                        className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-all duration-200 hover:scale-105"
                                    >
                                        Lists
                                    </Link>
                                    {/*
                                      * Sharing stays visible logged out: the page's own
                                      * benefit-framed sign-in handles that case, and hiding
                                      * the link is what made whole-setup sharing invisible.
                                      */}
                                    <Link
                                        to="/sharing"
                                        className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-all duration-200 hover:scale-105"
                                    >
                                        Sharing
                                    </Link>
                                </div>
                            </div>
                        </div>
                        {/* Solid Login/Logout section */}
                        <div className="hidden md:flex items-center gap-4">
                            <ThemeToggle />
                            {showsAsSignedIn ? (
                                <div className="flex items-center gap-3">
                                    {isReconnecting && <OfflineBadge />}
                                    {/*
                                      * The context switcher stays out here rather than
                                      * inside the account menu: whose data you are
                                      * looking at has to be answerable at a glance,
                                      * without opening anything.
                                      */}
                                    {sharedContexts.length > 0 && (
                                        <select
                                            value={currentForeignEncoded ?? '__own__'}
                                            onChange={e => {
                                                const val = e.target.value
                                                if (val === '__own__') navigate('/view-lists')
                                                else navigate(`/pod/${val}/view-lists`)
                                            }}
                                            className="text-sm font-medium bg-white/20 text-white rounded-lg px-2 py-1 border-0 focus:ring-0 cursor-pointer"
                                            aria-label="Switch context"
                                        >
                                            <option value="__own__" className="text-gray-900 dark:text-gray-100">Your data</option>
                                            {sharedContexts.map(ctx => (
                                                <option
                                                    key={ctx.podUrl}
                                                    value={encodeURIComponent(ctx.podUrl)}
                                                    className="text-gray-900 dark:text-gray-100"
                                                >
                                                    {ctx.label ?? ctx.podUrl}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <AccountMenu
                                        webId={webId ?? ''}
                                        displayName={displayName}
                                        photoUrl={profile.photo}
                                        onLogout={handleLogout}
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col items-end">
                                    <button
                                        onClick={handleSolidLogin}
                                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/90 text-primary-700 hover:bg-white hover:scale-105 transition-all duration-200 shadow-soft"
                                        title="Sign in to sync your lists across devices and share them - your data stays in your own Solid Pod"
                                    >
                                        Sync &amp; Share
                                    </button>
                                    <span className="text-xs text-white mt-1 font-medium">Sync across devices</span>
                                </div>
                            )}
                        </div>
                        {/* Mobile menu button */}
                        <div className="md:hidden flex items-center gap-1">
                            <ThemeToggle />
                            <button
                                onClick={() => setIsOpen(!isOpen)}
                                className="inline-flex items-center justify-center p-2.5 rounded-lg text-white hover:bg-white/20 focus:outline-none transition-all duration-200"
                                aria-expanded="false"
                            >
                                <span className="sr-only">Open main menu</span>
                                {/* Hamburger icon */}
                                <svg
                                    className={`${isOpen ? 'hidden' : 'block'} h-6 w-6`}
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                {/* Close icon */}
                                <svg
                                    className={`${isOpen ? 'block' : 'hidden'} h-6 w-6`}
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile menu */}
                <div data-testid="mobile-menu" className={`${isOpen ? 'block' : 'hidden'} md:hidden bg-primary-950`}>
                    <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                        <Link
                            to={manageQuestionsPath}
                            className="block px-3 py-3 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                            onClick={() => setIsOpen(false)}
                        >
                            {inForeignContext ? 'Questions & Items' : 'My Questions & Items'}
                        </Link>
                        <Link
                            to={viewListsPath}
                            className="block px-3 py-3 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                            onClick={() => setIsOpen(false)}
                        >
                            Lists
                        </Link>
                        <Link
                            to="/sharing"
                            className="block px-3 py-3 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                            onClick={() => setIsOpen(false)}
                        >
                            Sharing
                        </Link>
                        <ThemeToggle showLabel />
                        {/* Mobile Solid Login/Logout */}
                        <div className="border-t border-white/20 pt-2 mt-2">
                            {showsAsSignedIn ? (
                                <>
                                    {/*
                                      * The same things the desktop account menu holds,
                                      * flat: the mobile menu is already a disclosure,
                                      * and a dropdown inside a dropdown buys nothing.
                                      */}
                                    <div className="flex items-center gap-2 px-3 py-2">
                                        <ProfileBadge name={displayName} photoUrl={profile.photo} />
                                    </div>
                                    <div className="px-3 pb-2">
                                        <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Signed in as</p>
                                        <p className="mt-0.5 text-xs text-white/80 break-all" title={webId}>{webId}</p>
                                    </div>
                                    {isReconnecting && (
                                        <div className="px-3 pb-2">
                                            <OfflineBadge />
                                        </div>
                                    )}
                                    <Link
                                        to="/backups"
                                        className="block px-3 py-3 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                                        onClick={() => setIsOpen(false)}
                                    >
                                        Backups
                                    </Link>
                                    <button
                                        onClick={() => {
                                            handleLogout()
                                            setIsOpen(false)
                                        }}
                                        className="w-full text-left px-3 py-3 rounded-xl text-base font-semibold bg-white/20 hover:bg-white/30 transition-all duration-200"
                                    >
                                        Logout
                                    </button>
                                </>
                            ) : (
                                <div>
                                    <button
                                        onClick={() => {
                                            handleSolidLogin()
                                            setIsOpen(false)
                                        }}
                                        className="w-full text-left px-3 py-3 rounded-xl text-base font-semibold bg-white/90 text-primary-700 hover:bg-white transition-all duration-200"
                                        title="Sign in to sync your lists across devices and share them - your data stays in your own Solid Pod"
                                    >
                                        Sync &amp; Share
                                    </button>
                                    <p className="px-3 py-1 text-xs text-white font-medium">Sync across devices and share lists</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Solid Provider Selector Modal - rendered outside nav to avoid styling conflicts */}
            <SolidProviderSelector
                isOpen={isProviderSelectorOpen}
                onClose={() => setIsProviderSelectorOpen(false)}
                onSelect={handleProviderSelect}
            />
        </>
    )
} 