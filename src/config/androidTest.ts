/**
 * Recruiting testers for the Google Play closed test.
 *
 * Play will not let the app graduate to production until a set number of
 * testers stay opted in continuously for 14 days, and the app's own web
 * users are the warmest source of those testers — but reaching them needs
 * care, because the opt-in flow dead-ends for anyone who arrives at it cold:
 *
 * - `PLAY_OPT_IN_URL` only works for someone **already on the tester list**.
 *   Everyone else gets a Google error page. So nothing in the app links
 *   straight to it — the banner links to `/android-test`, which walks
 *   through joining the list first. See src/pages/android-test.tsx.
 * - A closed test admits people either from an uploaded email list (no
 *   self-service possible) or from a Google Group (anyone who joins becomes
 *   a tester). Only the group route works for an open call on a website, so
 *   `TESTER_GROUP_URL` is the group's join page.
 *
 * While `TESTER_GROUP_URL` is empty the app shows no banner, no footer link
 * and no steps — an unconfigured deploy recruits nobody rather than sending
 * people somewhere broken. Setting the URL here is the only switch.
 */

/** Where the recruitment call sends people, instead of straight to Play. */
export const ANDROID_TEST_PATH = '/android-test'

/** `appId` in capacitor.config.ts, `applicationId` in android/app/build.gradle. */
export const PLAY_PACKAGE_ID = 'com.timgent.packmeup'

/**
 * Play's opt-in page for the closed test. Reachable only once the visitor's
 * Google account is on the tester list, which is what step one exists for.
 */
export const PLAY_OPT_IN_URL = `https://play.google.com/apps/testing/${PLAY_PACKAGE_ID}`

/**
 * The tester Google Group's join page — set this to start recruiting, clear
 * it to stop. Create the group, set it to let anyone join, then point the
 * Play Console closed track's testers at that same group.
 *
 * Annotated `string` on purpose: without it TypeScript narrows the empty
 * default to the literal type `''`, and every "are we recruiting" branch
 * below becomes statically dead code.
 */
export const TESTER_GROUP_URL: string = ''

/**
 * Whether to show the recruitment call at all. Takes the URL as an argument
 * so tests can cover both states without reaching into module internals.
 */
export function isRecruitingTesters(groupUrl: string = TESTER_GROUP_URL): boolean {
    return groupUrl.trim().length > 0
}
