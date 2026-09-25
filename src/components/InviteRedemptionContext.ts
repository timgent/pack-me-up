import { createContext, useContext } from 'react'

/**
 * How many invites this app run has redeemed so far.
 *
 * Redemption happens app-wide and asynchronously — the grant lands a moment
 * after the page it affects has already loaded its data. Without this, opening
 * the Sharing page just as somebody's acceptance came in showed the toast
 * saying they had been added and a list that did not include them, until you
 * navigated away and back.
 *
 * A counter rather than the data itself: pages use it as "something changed on
 * the Pod, read again", which is all any of them need.
 */
export const InviteRedemptionContext = createContext<{
    version: number
    /** Check the Pod for acceptances now; resolves to how many were granted. */
    redeemNow: () => Promise<number>
}>({ version: 0, redeemNow: async () => 0 })

export const useInviteRedemptionVersion = (): number => useContext(InviteRedemptionContext).version

/** For a page waiting on somebody to accept — see the Sharing page's invite list. */
export const useRedeemInvitesNow = (): (() => Promise<number>) => useContext(InviteRedemptionContext).redeemNow
