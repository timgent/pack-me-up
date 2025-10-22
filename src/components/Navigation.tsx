import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useSolidPod } from './SolidPodContext'
import { SolidProviderSelector } from './SolidProviderSelector'

export const Navigation = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const { login, logout, isLoggedIn, webId } = useSolidPod()

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
                    {/* Solid Login/Logout section */}
                    <div className="hidden md:flex items-center">
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
                            <button
                                onClick={handleSolidLogin}
                                className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700 transition-colors"
                            >
                                Solid Login
                            </button>
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
                            <button
                                onClick={() => {
                                    handleSolidLogin()
                                    setIsOpen(false)
                                }}
                                className="w-full text-left px-3 py-2 rounded-md text-base font-medium bg-blue-600 hover:bg-blue-700"
                            >
                                Solid Login
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Solid Provider Selector Modal */}
            <SolidProviderSelector
                isOpen={isProviderSelectorOpen}
                onClose={() => setIsProviderSelectorOpen(false)}
                onSelect={handleProviderSelect}
            />
        </nav>
    )
} 