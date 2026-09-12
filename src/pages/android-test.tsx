import { Link } from 'react-router-dom'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { FEEDBACK_EMAIL } from '../components/Footer'
import { PLAY_OPT_IN_URL, TESTER_GROUP_URL, isRecruitingTesters } from '../config/androidTest'

const stepLinkStyles =
    'inline-block mt-2 bg-gradient-primary-button text-white px-5 py-2.5 rounded-xl font-bold motion-safe:hover:scale-105 transition-all duration-200 shadow-soft'

interface StepProps {
    testid: string
    number: number
    title: string
    href: string
    cta: string
    children: React.ReactNode
}

function Step({ testid, number, title, href, cta, children }: StepProps) {
    return (
        <li
            data-testid={testid}
            className="flex flex-col gap-1 p-5 rounded-2xl bg-white/70 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 shadow-soft"
        >
            <span className="text-sm font-bold text-primary-700 dark:text-primary-300">Step {number}</span>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
            <div className="text-gray-700 dark:text-gray-300 space-y-2">{children}</div>
            {/* noreferrer alongside noopener: these are outbound links to Google,
                and the referrer tells it nothing useful about a packing list. */}
            <a href={href} target="_blank" rel="noopener noreferrer" className={stepLinkStyles}>
                {cta}
            </a>
        </li>
    )
}

/**
 * Where the recruitment banner sends people, and the reason the banner does
 * not simply link to Google Play.
 *
 * Play's opt-in URL answers anyone who is not already on the tester list with
 * an error page, so a direct link would burn the click of the warmest user the
 * app has. Worse, the two things that actually decide whether an opt-in
 * succeeds cannot be said on a page Google controls:
 *
 * - the Google account used to opt in must be the one signed in on the phone,
 *   which is the usual reason the link "doesn't work for me"; and
 * - the 14 days are a real commitment — Play counts testers who stay opted in,
 *   so someone uninstalling on day nine sets the whole round back.
 *
 * Both are said here, before the click, and the page stays a stable URL as the
 * track moves from closed to open testing.
 */
export const AndroidTestPage = () => {
    return (
        <div className="max-w-3xl mx-auto bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-soft p-6 md:p-10 space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-primary-900 dark:text-primary-200 mb-1">
                    Help test the Android app
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Pack Me Up is free, open source, and has no adverts or tracking to sell you.
                </p>
            </div>

            {isRecruitingTesters() ? (
                <>
                    <p className="text-gray-700 dark:text-gray-300">
                        Pack Me Up is on Google Play, but in a closed test. Google won't let it out to
                        everyone until enough people have been signed up as testers for{' '}
                        <strong>14 days</strong> — so joining genuinely gets the app released, even if
                        you only install it and leave it alone.
                    </p>

                    <ol className="space-y-4 list-none p-0">
                        <Step
                            testid="android-test-step-join"
                            number={1}
                            title="Join the testers group"
                            href={TESTER_GROUP_URL}
                            cta="Join the group"
                        >
                            <p>
                                Google only lets group members into the test, so this has to come first —
                                the opt-in link in step 2 shows an error until you're in.
                            </p>
                            <p className="font-semibold text-primary-900 dark:text-primary-200">
                                Join with the <strong>same Google account</strong> that's signed in on
                                your phone. A different account is the usual reason step 2 doesn't work.
                            </p>
                        </Step>

                        <Step
                            testid="android-test-step-opt-in"
                            number={2}
                            title="Opt in, then install"
                            href={PLAY_OPT_IN_URL}
                            cta="Opt in on Google Play"
                        >
                            <p>
                                Accept the invitation, then use the Play Store link on that page to
                                install Pack Me Up like any other app. Easiest on the phone itself.
                            </p>
                        </Step>
                    </ol>

                    <section className="flex gap-3 p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                        <ExclamationTriangleIcon
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300 mt-0.5"
                        />
                        <p className="text-sm text-amber-900 dark:text-amber-200">
                            <strong>Please stay opted in for 14 days.</strong> Play only counts testers
                            who are still signed up, so leaving early sets the whole round back rather
                            than just removing one person. After that, keep it or bin it — no hard
                            feelings.
                        </p>
                    </section>

                    <p className="text-gray-700 dark:text-gray-300">
                        Found something broken, or something that just feels wrong?{' '}
                        <a
                            href={`mailto:${FEEDBACK_EMAIL}?subject=Android%20test%20feedback`}
                            className="text-primary-700 dark:text-primary-300 font-semibold underline hover:no-underline"
                        >
                            Send feedback
                        </a>{' '}
                        — that's the part I can't get any other way.
                    </p>
                </>
            ) : (
                <div data-testid="android-test-closed" className="space-y-4">
                    <p className="text-gray-700 dark:text-gray-300">
                        The Android test isn't open for sign-ups at the moment. Thanks for looking —
                        everything works in the browser in the meantime, on a phone as well as a laptop.
                    </p>
                    <Link
                        to="/home"
                        className="inline-block bg-gradient-primary-button text-white px-5 py-2.5 rounded-xl font-bold motion-safe:hover:scale-105 transition-all duration-200 shadow-soft"
                    >
                        Use Pack Me Up here
                    </Link>
                </div>
            )}
        </div>
    )
}
