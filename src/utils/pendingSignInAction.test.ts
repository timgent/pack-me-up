import { describe, it, expect, beforeEach } from 'vitest'
import {
    setPendingSignInAction,
    getPendingSignInAction,
    clearPendingSignInAction,
    PENDING_SIGN_IN_ACTION_KEY,
} from './pendingSignInAction'

describe('pendingSignInAction', () => {
    beforeEach(() => {
        sessionStorage.clear()
    })

    it('returns null when nothing is pending', () => {
        expect(getPendingSignInAction()).toBeNull()
    })

    it('round-trips a share action so it survives the login redirect', () => {
        setPendingSignInAction({ type: 'share', listId: 'list-1' })

        expect(getPendingSignInAction()).toEqual({ type: 'share', listId: 'list-1' })
    })

    it('round-trips a full-setup share action', () => {
        setPendingSignInAction({ type: 'share-full-setup' })

        expect(getPendingSignInAction()).toEqual({ type: 'share-full-setup' })
    })

    it('clears the pending action', () => {
        setPendingSignInAction({ type: 'share', listId: 'list-1' })

        clearPendingSignInAction()

        expect(getPendingSignInAction()).toBeNull()
    })

    it('ignores stored values it does not recognise', () => {
        sessionStorage.setItem(PENDING_SIGN_IN_ACTION_KEY, 'not json')
        expect(getPendingSignInAction()).toBeNull()

        sessionStorage.setItem(PENDING_SIGN_IN_ACTION_KEY, JSON.stringify({ type: 'something-else' }))
        expect(getPendingSignInAction()).toBeNull()

        sessionStorage.setItem(PENDING_SIGN_IN_ACTION_KEY, JSON.stringify({ type: 'share' }))
        expect(getPendingSignInAction()).toBeNull()
    })
})
