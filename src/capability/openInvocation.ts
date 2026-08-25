/**
 * Handling for the `#open={open}` invocation this app advertises in its
 * Application Capability description (./document.ts).
 *
 * A consumer — a pod browser showing a `pmu:PackingList`, say — expands the
 * template with the IRI of the resource it wants opened and navigates the user
 * agent to `https://packmeup.tim-gent.com/#open=https%3A%2F%2F…`. The value
 * rides in the fragment on purpose: a fragment is never sent to this app's
 * host, so the IRI of the resource you are opening stays between your browser
 * and the pod it lives on.
 *
 * `#open=…` is not a shape HashRouter can route, so the fragment is rewritten
 * to the app's own `/open` route (src/pages/open-resource.tsx) before the
 * router ever sees it — see installOpenInvocationHandler, called from main.tsx.
 * The route then decides where you actually land, which needs to know your own
 * pod URL and so can't be settled here.
 *
 * The parsing rules come from §5.3.1 of the spec: `&` is the sole pair
 * separator and `=` the sole name/value separator, `;` is not a separator,
 * unrecognised variables are ignored rather than treated as errors, and an
 * absent or unusable value fails safe. Invocation values are untrusted input,
 * so only http(s) IRIs get anywhere near a navigation.
 */
import { POD_CONTAINERS, buildSharedListPath } from '../services/solidPod'

/** Where the app's own hash routes send an invocation once it is understood. */
export const OPEN_ROUTE = '/open'

/**
 * A pod IRI this app recognises as one of its own resources.
 *
 * `podUrl` keeps its trailing slash, matching every other pod URL in the app
 * (POD_CONTAINERS paths are appended to it directly).
 */
export type PackMeUpResource =
    | { kind: 'packing-list'; podUrl: string; listId: string }
    | { kind: 'question-set'; podUrl: string }

/**
 * The value of an `#open={open}` invocation's variable, or null if this
 * fragment is not such an invocation at all (the common case — every ordinary
 * in-app hash route lands here too).
 *
 * An empty string means the variable was there but carried nothing usable.
 * That is a different answer from null on purpose: an invocation that arrived
 * empty still deserves the page that says so, rather than a blank screen.
 * Judging the value itself is resolvePackMeUpResource's job.
 */
export function parseOpenInvocation(hash: string): string | null {
    const fragment = hash.startsWith('#') ? hash.slice(1) : hash
    // An in-app route, not an invocation. Bailing here keeps the app's own
    // navigation off this path entirely.
    if (!fragment || fragment.startsWith('/')) return null

    for (const pair of fragment.split('&')) {
        const separator = pair.indexOf('=')
        if (separator === -1) continue
        if (pair.slice(0, separator) !== 'open') continue

        try {
            return decodeURIComponent(pair.slice(separator + 1))
        } catch {
            // A malformed percent-sequence is not something to guess at.
            return ''
        }
    }

    return null
}

const LISTS_PATH = POD_CONTAINERS.PACKING_LISTS
const QUESTIONS_PATH = POD_CONTAINERS.QUESTIONS

/**
 * Work out what a pod IRI is, from where the app stores things. Anything that
 * isn't one of this app's own resources is not claimed — a capability
 * description that promises to open `pmu:PackingList` resources should not
 * pretend it can open a stranger's shopping list.
 */
export function resolvePackMeUpResource(iri: string): PackMeUpResource | null {
    // Schemes a pod resource can plausibly live on, and nothing else: the spec
    // asks a receiving application to refuse file:, data: and javascript:
    // before it navigates anywhere near them. `http:` is here for a Community
    // Solid Server on localhost, which is how this app is developed and tested
    // against a real pod.
    if (!/^https?:\/\/./i.test(iri)) return null

    const listsAt = iri.lastIndexOf(LISTS_PATH)
    if (listsAt !== -1) {
        const file = iri.slice(listsAt + LISTS_PATH.length)
        const listId = file.endsWith('.ttl') ? file.slice(0, -'.ttl'.length) : ''
        if (listId && !listId.includes('/')) {
            return { kind: 'packing-list', podUrl: iri.slice(0, listsAt), listId }
        }
        return null
    }

    const questionsAt = iri.lastIndexOf(QUESTIONS_PATH)
    if (questionsAt !== -1 && questionsAt + QUESTIONS_PATH.length === iri.length) {
        return { kind: 'question-set', podUrl: iri.slice(0, questionsAt) }
    }

    return null
}

/**
 * The in-app route that opens `iri`, given the pod the signed-in person owns
 * (null when that isn't known yet or nobody is signed in — everything is then
 * treated as someone else's pod, which is the safe way round: the foreign-pod
 * routes ask for sign-in and verify access, the personal ones assume it).
 */
export function openInvocationPath(iri: string, ownPodUrl: string | null): string | null {
    const resource = resolvePackMeUpResource(iri)
    if (!resource) return null

    const isOwn = ownPodUrl !== null && resource.podUrl === ownPodUrl

    if (resource.kind === 'packing-list') {
        return isOwn
            ? `/view-lists/${resource.listId}`
            // The share-link shape rather than /pod/…, deliberately: a list
            // shared on its own grants access to that one file, and the
            // /pod/… routes verify access to the whole container.
            : buildSharedListPath(resource.listId, resource.podUrl)
    }

    return isOwn
        ? '/manage-questions'
        : `/pod/${encodeURIComponent(resource.podUrl)}/manage-questions`
}

/**
 * The hash to put in place of an invocation fragment, or null to leave the
 * fragment alone. Keeping the IRI in a query parameter means the `/open` route
 * can read it with the router's own tools.
 */
export function rewriteOpenInvocationHash(hash: string): string | null {
    const iri = parseOpenInvocation(hash)
    if (iri === null) return null
    return `#${OPEN_ROUTE}?resource=${encodeURIComponent(iri)}`
}

/**
 * Rewrite an invocation fragment into an app route: once now, and again
 * whenever the fragment changes. Called from main.tsx before the router mounts,
 * so on a cold load the router only ever sees a fragment it can route.
 *
 * The listeners cover a consumer that changes the fragment of an already-open
 * tab, which reloads nothing. That case needs care: a fragment change fires
 * `popstate` as well as `hashchange`, and HashRouter listens on `popstate` — so
 * depending on which listener the browser reaches first, the router may already
 * have tried to route the raw `#open=…` and landed nowhere. Rewriting the
 * history entry doesn't tell it to look again, so a synthetic `popstate` does.
 * Re-entering here from that event is harmless: the fragment is no longer an
 * invocation by then, so nothing happens the second time.
 */
export function installOpenInvocationHandler(win: Window = window): void {
    const apply = () => {
        const rewritten = rewriteOpenInvocationHash(win.location.hash)
        if (!rewritten) return

        // replaceState, not assignment: the invocation fragment is a delivery
        // mechanism, not a place in the app worth going Back to.
        win.history.replaceState(null, '', rewritten)
        win.dispatchEvent(new PopStateEvent('popstate'))
    }

    apply()
    win.addEventListener('hashchange', apply)
    win.addEventListener('popstate', apply)
}
