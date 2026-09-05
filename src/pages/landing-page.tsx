import { useState } from 'react'
import { CheckBadgeIcon, ClipboardDocumentListIcon, PencilSquareIcon, SparklesIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { useSolidPod } from '../components/SolidPodContext'
import { useHasQuestions } from '../hooks/useHasQuestions'
import { profileDisplayName, useSolidProfile } from '../hooks/useSolidProfile'
import { SolidProviderSelector } from '../components/SolidProviderSelector'

const CTA_CLASSES =
    'inline-block bg-gradient-primary-button text-white px-8 py-4 rounded-2xl text-lg font-bold motion-safe:hover:scale-105 transition-all duration-200 shadow-soft hover:shadow-glow-primary'

/*
 * One surface for all three steps, so they read as a single sequence rather
 * than three unrelated features (#336). They used to carry a colour family
 * each — primary, secondary, success — competing with the CTA's gradient and
 * the page's own background for the same attention. Colour now marks the one
 * primary action; everything around it is neutral, and the step number is the
 * only accent the section gets.
 *
 * Shared as a constant because three hand-copied class strings are how they
 * drifted apart in the first place.
 */
const CARD_CLASSES =
    'flex flex-col gap-3 p-6 rounded-2xl bg-white/70 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 shadow-soft'

const STEPS = [
    {
        number: 1,
        Icon: SparklesIcon,
        title: 'Set up in a minute',
        body: "One screen — tell us who you travel with, and we'll generate a starter set of packing questions for your group.",
    },
    {
        number: 2,
        Icon: PencilSquareIcon,
        title: 'Fine-tune your questions',
        body: 'Add, remove, and customise questions and packing items until they perfectly match how you travel.',
    },
    {
        number: 3,
        Icon: ClipboardDocumentListIcon,
        title: 'Pack for every trip',
        body: 'Before each trip, answer your questions to instantly generate a personalised packing list.',
    },
]

export const LandingPage = () => {
    const { isLoggedIn, isReconnecting, webId, session, login } = useSolidPod()
    const profile = useSolidProfile(webId, session)
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false)
    const { hasQuestions, isLoading: isCheckingQuestions } = useHasQuestions()
    // Which CTA is right depends on data that arrives from the pod after the
    // page has painted, so until the check settles the page says neither. It
    // used to guess "new user", which sent a returning user to the wizard and
    // left them there until they reloaded (#333). A placeholder of the same
    // size keeps everything below it still while the answer lands.
    const primaryCta = isCheckingQuestions ? (
        <div
            role="status"
            aria-live="polite"
            className={`${CTA_CLASSES} pointer-events-none opacity-60 motion-safe:animate-pulse`}
        >
            Checking your questions...
        </div>
    ) : hasQuestions ? (
        <Link to="/view-lists" className={CTA_CLASSES}>
            View Packing Lists
        </Link>
    ) : (
        <Link to="/wizard" className={CTA_CLASSES}>
            Get Started with the Wizard
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
                        <CheckBadgeIcon aria-hidden="true" className="mr-1 inline-block h-5 w-5 align-[-0.25em]" />
                        Signed in as <span className="font-bold">{profileDisplayName(profile, webId)}</span>
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
                    {/* Neutral, not tinted: in dark mode `primary-200` made the headline the
                        brightest thing on screen, ahead of the CTA it is meant to lead
                        into (#336). */}
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-gray-900 dark:text-gray-100 text-balance">
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
                    {/* An ordered list, because that is what it is. No hover
                        growth or glow: these are not clickable, and promising an
                        affordance that isn't there was half of what made the
                        section feel busy. */}
                    <ol className="grid md:grid-cols-3 gap-6">
                        {STEPS.map(({ number, Icon, title, body }) => (
                            <li key={number} className={CARD_CLASSES}>
                                <div className="flex items-center gap-3">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-200 text-sm font-bold">
                                        {number}
                                    </span>
                                    <Icon aria-hidden="true" className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
                                <p className="text-gray-700 dark:text-gray-300">{body}</p>
                            </li>
                        ))}
                    </ol>
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