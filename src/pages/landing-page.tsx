import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSolidPod } from '../components/SolidPodContext'
import { useHasQuestions } from '../hooks/useHasQuestions'
import { profileDisplayName, useSolidProfile } from '../hooks/useSolidProfile'
import { SolidProviderSelector } from '../components/SolidProviderSelector'

export const LandingPage = () => {
    const { isLoggedIn, isReconnecting, webId, session, login } = useSolidPod()
    const profile = useSolidProfile(webId, session)
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const hasQuestions = useHasQuestions()
    const primaryCta = hasQuestions ? (
        <Link
            to="/view-lists"
            className="inline-block bg-gradient-primary-button text-white px-8 py-4 rounded-2xl text-lg font-bold motion-safe:hover:scale-105 transition-all duration-200 shadow-soft hover:shadow-glow-primary"
        >
            📋 View Packing Lists
        </Link>
    ) : (
        <Link
            to="/wizard"
            className="inline-block bg-gradient-primary-button text-white px-8 py-4 rounded-2xl text-lg font-bold motion-safe:hover:scale-105 transition-all duration-200 shadow-soft hover:shadow-glow-primary"
        >
            ✨ Get Started with the Wizard
        </Link>
    )
    return (
        <>
            {(isLoggedIn || isReconnecting) && (
                <div className="mb-6 p-4 bg-gradient-to-r from-success-50 dark:from-success-950/40 to-primary-50 dark:to-primary-950/40 border-2 border-success-300 dark:border-success-700 rounded-2xl shadow-soft animate-fade-in">
                    {/*
                      * Their name, not their WebID. The nav stopped printing the
                      * raw WebID in #302 and this greeting sits right under it —
                      * a URL is not what being signed in looks like. The photo
                      * stays in the nav rather than being repeated an inch away.
                      */}
                    <p className="text-success-800 dark:text-success-200 font-semibold">
                        🎉 Signed in as <span className="font-bold">{profileDisplayName(profile, webId)}</span>
                        {/* Signed in but unreachable is still signed in (#342) —
                            the greeting stays and says which of the two it is. */}
                        {isReconnecting && (
                            <span className="ml-2 font-normal text-success-700 dark:text-success-300">
                                · offline, changes will sync later
                            </span>
                        )}
                    </p>
                </div>
            )}
            <div className="max-w-4xl mx-auto">
                {/* Hero leads with the travel benefit and keeps the primary CTA above the
                    fold — the data-ownership story lives in the trust section further down. */}
                <div className="text-center mb-10 animate-slide-up">
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-primary-900 dark:text-primary-200 text-balance">
                        Packing lists that learn how you travel
                    </h1>
                    <p className="text-lg sm:text-xl text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">
                        Set up your questions once, then get a personalised list for every trip. Share one list with your partner or the whole family and pack as a team.
                    </p>
                </div>

                <div className="text-center space-y-4 mb-14">
                    {primaryCta}
                </div>

                <div className="mb-12">
                    <h2 className="text-center text-sm font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-6">How it works</h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="bg-gradient-to-br from-primary-50 dark:from-primary-950/40 to-primary-100 dark:to-primary-900/40 p-6 rounded-2xl shadow-soft hover:shadow-glow-primary transition-all duration-300 hover:scale-105 border-2 border-primary-200 dark:border-primary-800">
                            <div className="text-3xl mb-2">✨</div>
                            <h3 className="text-xl font-bold mb-3 text-primary-900 dark:text-primary-200">1. Set up in a minute</h3>
                            <p className="text-gray-700 dark:text-gray-300">
                                One screen — tell us who you travel with, and we'll generate a starter set of packing questions for your group.
                            </p>
                        </div>

                        <div className="bg-gradient-to-br from-secondary-50 dark:from-secondary-950/40 to-secondary-100 dark:to-secondary-900/40 p-6 rounded-2xl shadow-soft hover:shadow-glow-secondary transition-all duration-300 hover:scale-105 border-2 border-secondary-200 dark:border-secondary-800">
                            <div className="text-3xl mb-2">✏️</div>
                            <h3 className="text-xl font-bold mb-3 text-secondary-900 dark:text-secondary-200">2. Fine-tune your questions</h3>
                            <p className="text-gray-700 dark:text-gray-300">
                                Add, remove, and customise questions and packing items until they perfectly match how you travel.
                            </p>
                        </div>

                        <div className="bg-gradient-to-br from-success-50 dark:from-success-950/40 to-success-100 dark:to-success-900/40 p-6 rounded-2xl shadow-soft hover:shadow-lg transition-all duration-300 hover:scale-105 border-2 border-success-200 dark:border-success-800">
                            <div className="text-3xl mb-2">📋</div>
                            <h3 className="text-xl font-bold mb-3 text-success-900 dark:text-success-200">3. Pack for every trip</h3>
                            <p className="text-gray-700 dark:text-gray-300">
                                Before each trip, answer your questions to instantly generate a personalised packing list.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-10 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center text-sm text-gray-500 dark:text-gray-400">
                    <h2 className="font-semibold text-gray-600 dark:text-gray-400 inline">Own Your Data</h2>
                    {' '}— Your lists live in storage you control, never on our servers. They save to this device automatically, even without an account.
                    {!isLoggedIn && (
                        <span className="block mt-1">
                            <button
                                className="font-semibold text-primary-700 dark:text-primary-300 underline hover:text-primary-900 dark:hover:text-primary-200"
                                onClick={() => setIsProviderSelectorOpen(true)}
                            >
                                Get a free Solid Pod
                            </button>
                            {' '}to sync across your devices and share lists with the people you travel with.
                        </span>
                    )}
                </div>
            </div>
            <SolidProviderSelector
                isOpen={isProviderSelectorOpen}
                onClose={() => setIsProviderSelectorOpen(false)}
                onSelect={(issuer) => login(issuer)}
            />
        </>
    )
}