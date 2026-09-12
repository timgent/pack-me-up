import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { DevicePhoneMobileIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { Capacitor } from '@capacitor/core'
import { ANDROID_TEST_PATH, isRecruitingTesters } from '../config/androidTest'

export const ANDROID_TEST_DISMISSED_KEY = 'android-test-banner-dismissed'

function wasDismissed(): boolean {
    try {
        return localStorage.getItem(ANDROID_TEST_DISMISSED_KEY) === 'true'
    } catch {
        // localStorage unavailable — banner just reappears next visit
        return false
    }
}

/**
 * The one channel this app has to its own users.
 *
 * Storage is local-first and accounts are optional, so there is no mailing
 * list and no push — someone who likes Pack Me Up cannot be reached again
 * unless they come back to it. That makes an in-app banner the whole of the
 * warm-audience funnel for the Play closed test, which needs testers to stay
 * opted in for 14 days before the app can ship publicly.
 *
 * It sits app-wide next to `OfflineBanner` rather than on the landing page,
 * because `/` redirects a signed-in user straight to `/view-lists`
 * (see App.tsx `DefaultRedirect`) — the people most likely to help are
 * exactly the ones who never see the landing page.
 *
 * Three things keep it from being a nuisance or a dead end:
 *
 * - It links to `/android-test`, never to Play. The Play opt-in URL errors
 *   for anyone not already on the tester list, and the account caveat that
 *   breaks most opt-ins has to be said before the click, not after.
 * - It is hidden in the native app, where the reader already has the thing
 *   it is asking them to install.
 * - It is hidden entirely while no tester group is configured, so the call
 *   never outlives the round of recruitment it was for.
 */
export function AndroidTestBanner() {
    const [dismissed, setDismissed] = useState(wasDismissed)
    const { pathname } = useLocation()

    if (dismissed) return null
    if (!isRecruitingTesters()) return null
    if (Capacitor.isNativePlatform()) return null
    if (pathname === ANDROID_TEST_PATH) return null

    const handleDismiss = () => {
        try {
            localStorage.setItem(ANDROID_TEST_DISMISSED_KEY, 'true')
        } catch {
            // localStorage unavailable — banner just reappears next visit
        }
        setDismissed(true)
    }

    return (
        <div
            data-testid="android-test-banner"
            className="bg-accent-50 dark:bg-accent-950/40 border-b border-accent-200 dark:border-accent-800 px-4 py-2.5 flex items-center justify-between gap-3"
        >
            <p className="text-sm text-accent-900 dark:text-accent-200 font-medium">
                <DevicePhoneMobileIcon aria-hidden="true" className="mr-1 inline-block h-4 w-4 align-[-0.2em]" />
                Got an Android phone?{' '}
                <span className="font-normal text-accent-800 dark:text-accent-300">
                    Pack Me Up needs a few testers before it can launch on Google Play.
                </span>
            </p>
            <div className="flex items-center gap-3 shrink-0">
                <Link
                    to={ANDROID_TEST_PATH}
                    className="text-sm font-semibold text-accent-900 dark:text-accent-200 underline hover:no-underline"
                >
                    How to help
                </Link>
                <button onClick={handleDismiss} aria-label="Dismiss">
                    <XMarkIcon className="h-4 w-4 text-accent-700 dark:text-accent-300 hover:text-accent-900 dark:hover:text-accent-200" />
                </button>
            </div>
        </div>
    )
}
