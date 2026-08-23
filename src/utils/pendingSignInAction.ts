/**
 * Remembers the action a logged-out user was attempting when they were offered
 * a contextual sign-in, so it can be resumed once they come back from the
 * provider's login page. sessionStorage (not localStorage) because the intent
 * belongs to this tab and this visit — a stale "open the share dialog" a week
 * later would be a surprise.
 */
export const PENDING_SIGN_IN_ACTION_KEY = 'pending-sign-in-action'

export type PendingSignInAction =
    /** Share one packing list — resumed on that list's page. */
    | { type: 'share'; listId: string }
    /** Share the whole setup (question set + every list) — resumed on the sharing page. */
    | { type: 'share-full-setup' }

function isPendingSignInAction(value: unknown): value is PendingSignInAction {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Record<string, unknown>
    if (candidate.type === 'share-full-setup') return true
    return candidate.type === 'share' && typeof candidate.listId === 'string'
}

export function setPendingSignInAction(action: PendingSignInAction): void {
    try {
        sessionStorage.setItem(PENDING_SIGN_IN_ACTION_KEY, JSON.stringify(action))
    } catch {
        // Storage unavailable (private mode, quota) — the user just lands back
        // on the page without the action resuming.
    }
}

export function getPendingSignInAction(): PendingSignInAction | null {
    try {
        const raw = sessionStorage.getItem(PENDING_SIGN_IN_ACTION_KEY)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        return isPendingSignInAction(parsed) ? parsed : null
    } catch {
        return null
    }
}

export function clearPendingSignInAction(): void {
    try {
        sessionStorage.removeItem(PENDING_SIGN_IN_ACTION_KEY)
    } catch {
        // Nothing to do — see setPendingSignInAction.
    }
}
