/**
 * What someone actually types when an app asks them for a WebID.
 *
 * Sharing needs a string only the other person can produce, and the shapes they
 * produce it in are all different: the Pod root they bookmarked, the profile
 * card without its `#me`, the host on its own because that is what they call
 * their Pod. Every one of those used to be handed straight to the ACL writer,
 * which happily records an agent nobody is — the grant "succeeds", the other
 * person sees nothing, and neither end has any way to tell.
 *
 * So the input is met where it is. Nothing here guesses at identity: each rule
 * below is a documented Solid convention, and anything that matches none of
 * them is returned untouched (an identity provider's WebID is already whole) or
 * rejected outright.
 */

/** A hostname with no dot is a typo, not a Pod — except the one the tests run on. */
function isPlausibleHost(hostname: string): boolean {
    return hostname.includes('.') || hostname === 'localhost'
}

/**
 * The WebID hiding in what someone typed, or null when there isn't one.
 *
 * Returning null is a real answer: it is what lets the field say "that doesn't
 * look like an address" instead of writing an ACL entry for `https://alice`.
 */
export function normaliseWebIdInput(raw: string): string | null {
    const trimmed = raw.trim()
    if (trimmed === '') return null

    // A bare host is the commonest shape of all — it is how people say where
    // their Pod is out loud. Anything carrying a real scheme keeps it, so a
    // deliberate http:// (localhost, a LAN server) survives.
    //
    // "Carrying a real scheme" means `scheme://`, not merely `word:`. A bare
    // `example.org:8443/alice/` otherwise parses as the scheme "example.org",
    // and a Pod on a non-default port reads as gibberish.
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    const hasHostPort = /^[^/:\s]+:\d+(\/|$)/.test(trimmed)
    // `mailto:`, `javascript:`, `data:` — a scheme with no authority is not a
    // Pod, and is the shape worth refusing outright rather than mangling.
    if (!hasScheme && !hasHostPort && /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null

    const withScheme = hasScheme ? trimmed : `https://${trimmed}`

    let url: URL
    try {
        url = new URL(withScheme)
    } catch {
        return null
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!isPlausibleHost(url.hostname)) return null

    // A fragment means they gave us a WebID: it names a thing inside a
    // document, which is exactly what a WebID is.
    if (url.hash !== '' && url.hash !== '#') return url.toString()

    const path = url.pathname

    // The profile card without the `#me` that makes it a WebID — the single
    // easiest thing to lose when copying from a browser address bar.
    if (path.endsWith('/profile/card') || path.endsWith('/profile/card/')) {
        url.pathname = path.replace(/\/$/, '')
        url.hash = '#me'
        return url.toString()
    }

    // A trailing slash is a container, and a container that someone offers as
    // their address is their Pod: the card lives at the conventional place
    // inside it. `https://example.org` arrives here as `/` for the same reason.
    if (path.endsWith('/')) {
        url.pathname = `${path}profile/card`
        url.hash = '#me'
        return url.toString()
    }

    // Everything else is left alone, because the remaining shape is a WebID an
    // identity provider minted (`https://id.inrupt.com/alice`), which is whole
    // already and says nothing about where any Pod lives.
    return url.toString()
}
