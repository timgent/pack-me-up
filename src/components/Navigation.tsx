import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useSolidPod } from './SolidPodContext'
import { SolidProviderSelector } from './SolidProviderSelector'
import { useSync } from './SyncContext'

export const Navigation = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const { login, logout, isLoggedIn, webId } = useSolidPod()
    const { syncState } = useSync()

    const handleSolidLogin = () => {
        setIsProviderSelectorOpen(true)
    }

    const handleProviderSelect = (issuer: string) => {
        return login(issuer)
    }

    const handleLogout = async () => {
        await logout()
    }

    const isOnline = syncState?.online ?? true

    // Get sync status for display
    const getSyncStatusIcon = () => {
        if (!syncState) return null

        const status = syncState.questionSet.status

        if (status === 'syncing') {
            return (
                <svg className="w-3 h-3 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            )
        } else if (status === 'conflict') {
            return <span className="text-yellow-400">⚠️</span>
        } else if (status === 'error') {
            return <span className="text-red-400">❌</span>
        } else {
            // idle
            return <span className="text-green-400">✓</span>
        }
    }

    const getSyncStatusText = () => {
        if (!syncState) return 'Unknown'

        const status = syncState.questionSet.status

        if (status === 'syncing') return 'Syncing...'
        if (status === 'conflict') return 'Conflict'
        if (status === 'error') return 'Error'

        // idle - show last synced time if available
        const lastSynced = syncState.questionSet.lastSyncedAt
        if (lastSynced) {
            const date = new Date(lastSynced)
            const now = new Date()
            const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))

            if (diffMinutes < 1) return 'Synced just now'
            if (diffMinutes < 60) return `Synced ${diffMinutes}m ago`

            const diffHours = Math.floor(diffMinutes / 60)
            if (diffHours < 24) return `Synced ${diffHours}h ago`

            return 'Synced'
        }

        return 'Not synced'
    }

    const getSyncStatusTitle = () => {
        if (!syncState) return ''

        const status = syncState.questionSet.status
        const lastSynced = syncState.questionSet.lastSyncedAt

        if (status === 'syncing') return 'Syncing with your Pod...'
        if (status === 'conflict') return 'Sync conflict detected - review required'
        if (status === 'error') return 'Sync error occurred'

        if (lastSynced) {
            return `Last synced: ${new Date(lastSynced).toLocaleString()}`
        }

        return 'Not yet synced with Pod'
    }

    return (
        <>
            <nav className="bg-gray-800 text-white shadow-lg">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <Link to="/" className="text-xl font-bold hover:text-gray-300">
                                    Pack Me Up
                                </Link>
                            </div>
                            <div className="hidden md:block">
                                <div className="ml-10 flex items-baseline space-x-4">
                                    <Link
                                        to="/manage-questions"
                                        className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 hover:text-white"
                                    >
                                        Edit Questions
                                    </Link>
                                    <Link
                                        to="/create-packing-list"
                                        className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 hover:text-white"
                                    >
                                        Create List
                                    </Link>
                                    <Link
                                        to="/view-lists"
                                        className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700 hover:text-white"
                                    >
                                        View Lists
                                    </Link>
                                </div>
                            </div>
                        </div>
                        {/* Online/Offline Status & Solid Login/Logout section */}
                        <div className="hidden md:flex items-center gap-4">
                            {/* Online/Offline Indicator */}
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
                                     title={isOnline ? 'Online' : 'Offline'} />
                                <span className="text-xs text-gray-400">
                                    {isOnline ? 'Online' : 'Offline'}
                                </span>
                            </div>

                            {/* Sync Status Indicator */}
                            {isLoggedIn && syncState && (
                                <div className="flex items-center gap-2" title={getSyncStatusTitle()}>
                                    {getSyncStatusIcon()}
                                    <span className="text-xs text-gray-400">
                                        {getSyncStatusText()}
                                    </span>
                                </div>
                            )}

                            {isLoggedIn ? (
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-gray-300 truncate max-w-xs" title={webId}>
                                        {webId}
                                    </span>
                                    <button
                                        onClick={handleLogout}
                                        className="px-3 py-2 rounded-md text-sm font-medium bg-gray-700 hover:bg-gray-600 transition-colors"
                                    >
                                        Logout
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-end">
                                    <button
                                        onClick={handleSolidLogin}
                                        className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 transition-colors"
                                        title="Store your packing lists in your own personal Pod - you own your data"
                                    >
                                        Login with Solid Pod
                                    </button>
                                    <span className="text-xs text-gray-400 mt-1">Own your data</span>
                                </div>
                            )}
                        </div>
                        {/* Mobile menu button */}
                        <div className="md:hidden">
                            <button
                                onClick={() => setIsOpen(!isOpen)}
                                className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none"
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
                <div className={`${isOpen ? 'block' : 'hidden'} md:hidden`}>
                    <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                        {/* Online/Offline Indicator - Mobile */}
                        <div className="flex items-center gap-2 px-3 py-2">
                            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
                                 title={isOnline ? 'Online' : 'Offline'} />
                            <span className="text-xs text-gray-400">
                                {isOnline ? 'Online' : 'Offline'}
                            </span>
                        </div>

                        {/* Sync Status Indicator - Mobile */}
                        {isLoggedIn && syncState && (
                            <div className="flex items-center gap-2 px-3 py-2" title={getSyncStatusTitle()}>
                                {getSyncStatusIcon()}
                                <span className="text-xs text-gray-400">
                                    {getSyncStatusText()}
                                </span>
                            </div>
                        )}

                        <Link
                            to="/manage-questions"
                            className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700 hover:text-white"
                            onClick={() => setIsOpen(false)}
                        >
                            Edit Questions
                        </Link>
                        <Link
                            to="/create-packing-list"
                            className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700 hover:text-white"
                            onClick={() => setIsOpen(false)}
                        >
                            Create List
                        </Link>
                        <Link
                            to="/view-lists"
                            className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700 hover:text-white"
                            onClick={() => setIsOpen(false)}
                        >
                            View Lists
                        </Link>
                        {/* Mobile Solid Login/Logout */}
                        <div className="border-t border-gray-700 pt-2 mt-2">
                            {isLoggedIn ? (
                                <>
                                    <div className="px-3 py-2 text-sm text-gray-300 truncate" title={webId}>
                                        {webId}
                                    </div>
                                    <button
                                        onClick={() => {
                                            handleLogout()
                                            setIsOpen(false)
                                        }}
                                        className="w-full text-left px-3 py-2 rounded-md text-base font-medium bg-gray-700 hover:bg-gray-600"
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
                                        className="w-full text-left px-3 py-2 rounded-md text-base font-medium bg-blue-600 hover:bg-blue-700"
                                        title="Store your packing lists in your own personal Pod - you own your data"
                                    >
                                        Login with Solid Pod
                                    </button>
                                    <p className="px-3 py-1 text-xs text-gray-400">Own your data</p>
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