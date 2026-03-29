import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useSolidPod } from './SolidPodContext'
import { SolidProviderSelector } from './SolidProviderSelector'
import { useHasQuestions } from '../hooks/useHasQuestions'

export const Navigation = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const { login, logout, isLoggedIn, webId } = useSolidPod()
    const hasQuestions = useHasQuestions()

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
            <nav className="bg-primary-950 text-white shadow-soft">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center">
                            <div className="flex-shrink-0">
                                <Link to="/" className="text-2xl font-bold hover:scale-105 transition-transform duration-200 drop-shadow-md">
                                    🎒 Pack Me Up
                                </Link>
                            </div>
                            <div className="hidden md:block">
                                <div className="ml-10 flex items-baseline space-x-2">
                                    <Link
                                        to="/wizard"
                                        className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-all duration-200 hover:scale-105"
                                    >
                                        {hasQuestions ? 'Redo Setup Wizard' : 'Setup Wizard'}
                                    </Link>
                                    <Link
                                        to="/manage-questions"
                                        className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-all duration-200 hover:scale-105"
                                    >
                                        My Questions & Items
                                    </Link>
                                    <Link
                                        to="/create-packing-list"
                                        className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-all duration-200 hover:scale-105"
                                    >
                                        Create List
                                    </Link>
                                    <Link
                                        to="/view-lists"
                                        className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-all duration-200 hover:scale-105"
                                    >
                                        View Lists
                                    </Link>
                                    {isLoggedIn && (
                                        <Link
                                            to="/backups"
                                            className="px-4 py-2 rounded-xl text-sm font-semibold hover:bg-white/20 transition-all duration-200 hover:scale-105"
                                        >
                                            Backups
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </div>
                        {/* Solid Login/Logout section */}
                        <div className="hidden md:flex items-center gap-2">
                            {isLoggedIn ? (
                                <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-xl">
                                    <span className="text-sm font-medium truncate max-w-xs" title={webId}>
                                        {webId}
                                    </span>
                                    <button
                                        onClick={handleLogout}
                                        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white/20 hover:bg-white/30 transition-all duration-200 hover:scale-105"
                                    >
                                        Logout
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-end">
                                    <button
                                        onClick={handleSolidLogin}
                                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/90 text-primary-700 hover:bg-white hover:scale-105 transition-all duration-200 shadow-soft"
                                        title="Store your packing lists in your own personal Pod - you own your data"
                                    >
                                        Login with Solid Pod
                                    </button>
                                    <span className="text-xs text-white mt-1 font-medium">Own your data</span>
                                </div>
                            )}
                        </div>
                        {/* Mobile menu button */}
                        <div className="md:hidden">
                            <button
                                onClick={() => setIsOpen(!isOpen)}
                                className="inline-flex items-center justify-center p-2 rounded-lg text-white hover:bg-white/20 focus:outline-none transition-all duration-200"
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
                <div className={`${isOpen ? 'block' : 'hidden'} md:hidden bg-primary-950`}>
                    <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                        <Link
                            to="/wizard"
                            className="block px-3 py-2 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                            onClick={() => setIsOpen(false)}
                        >
                            {hasQuestions ? 'Redo Setup Wizard' : 'Setup Wizard'}
                        </Link>
                        <Link
                            to="/manage-questions"
                            className="block px-3 py-2 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                            onClick={() => setIsOpen(false)}
                        >
                            My Questions & Items
                        </Link>
                        <Link
                            to="/create-packing-list"
                            className="block px-3 py-2 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                            onClick={() => setIsOpen(false)}
                        >
                            Create List
                        </Link>
                        <Link
                            to="/view-lists"
                            className="block px-3 py-2 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                            onClick={() => setIsOpen(false)}
                        >
                            View Lists
                        </Link>
                        {isLoggedIn && (
                            <Link
                                to="/backups"
                                className="block px-3 py-2 rounded-xl text-base font-semibold hover:bg-white/20 transition-all duration-200"
                                onClick={() => setIsOpen(false)}
                            >
                                Backups
                            </Link>
                        )}
                        {/* Mobile Solid Login/Logout */}
                        <div className="border-t border-white/20 pt-2 mt-2">
                            {isLoggedIn ? (
                                <>
                                    <div className="px-3 py-2 text-sm font-medium truncate" title={webId}>
                                        {webId}
                                    </div>
                                    <button
                                        onClick={() => {
                                            handleLogout()
                                            setIsOpen(false)
                                        }}
                                        className="w-full text-left px-3 py-2 rounded-xl text-base font-semibold bg-white/20 hover:bg-white/30 transition-all duration-200"
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
                                        className="w-full text-left px-3 py-2 rounded-xl text-base font-semibold bg-white/90 text-primary-700 hover:bg-white transition-all duration-200"
                                        title="Store your packing lists in your own personal Pod - you own your data"
                                    >
                                        Login with Solid Pod
                                    </button>
                                    <p className="px-3 py-1 text-xs text-white font-medium">Own your data</p>
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