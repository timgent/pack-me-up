/**
 * Where to send someone once the OIDC round trip lands.
 *
 * Login returns you to where you started, and that is the point of it: someone
 * who follows a shared list's URL and signs in to read it has to land on that
 * list, not on their own index. But the neutral entry points carry no such
 * intent — signing in via "Sync & Share" on the home page stored `/home` and
 * dropped you straight back on the home page, so the suggestion the app already
 * makes for `/` (`DefaultRedirect` in App.tsx) never got to run (#334).
 *
 * So the substitution is scoped to those neutral routes, and every other stored
 * route is restored untouched.
 */

/**
 * Routes that mean "wherever the app happened to open", not "take me back here".
 *
 * `/solid-pod-handle-redirect` is one of them: it is where the neutral case is
 * sent, and it re-reads the stored route on arrival, so leaving it out would let
 * the substitution point at itself.
 */
const NEUTRAL_AUTH_RETURN_ROUTES = ['', '/home', '/solid-pod-handle-redirect']

export const isNeutralAuthReturnRoute = (route: string | null | undefined): boolean => {
    if (!route) return true
    // Compare paths only — a stored `/home?utm=x` is still the home page — and
    // let `/` and `/home/` normalise onto the same entries as `` and `/home`.
    const path = route.split(/[?#]/)[0].replace(/\/+$/, '')
    return NEUTRAL_AUTH_RETURN_ROUTES.includes(path)
}

/**
 * The suggested destination for someone arriving with no route of their own —
 * the same rule the home page's primary CTA uses (`landing-page.tsx`).
 *
 * Only ask this once the question check has settled: an empty answer that the
 * login sync has not finished contradicting sends a returning user into the
 * wizard, which is #333.
 */
export const suggestedPostLoginRoute = (hasQuestions: boolean): string =>
    hasQuestions ? '/view-lists' : '/wizard'
