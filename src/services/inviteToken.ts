/**
 * The secret in an invite link.
 *
 * An invite link is how sharing stops needing an address up front: Alice sends
 * a link, Bob opens it and accepts, and his WebID travels back to her Pod
 * without either of them typing anything. The token is the whole proof that
 * whoever accepted was sent the link — there is nothing else to check — so it
 * has to be unguessable, and it has to survive a URL, a QR code and a paste
 * into a chat window without being mangled.
 *
 * 128 bits of `crypto.getRandomValues`, base64url. Not `Math.random`: this is a
 * credential, and the difference costs nothing.
 */

const TOKEN_BYTES = 16

/** base64url: the URL-safe alphabet, no padding, so nothing needs escaping. */
function base64url(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createInviteToken(): string {
    const bytes = new Uint8Array(TOKEN_BYTES)
    crypto.getRandomValues(bytes)
    return base64url(bytes)
}

/**
 * Whether something is shaped like one of our tokens.
 *
 * Worth having because tokens come back from *other people's* Pods: an
 * acceptance is a document a stranger wrote, and it reaches this app as an
 * untrusted string that then gets compared, logged and put in URLs. Checking
 * the shape first keeps everything downstream dealing with a token rather than
 * with whatever somebody felt like writing.
 */
export function isInviteToken(value: unknown): boolean {
    if (typeof value !== 'string') return false
    // 22 characters is 128 bits in base64url; the upper bound is slack for a
    // longer token later, not licence for an essay.
    return /^[A-Za-z0-9_-]{22,64}$/.test(value)
}
