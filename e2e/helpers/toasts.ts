import { SUCCESS_TOAST_VARIANTS, type SuccessToastKey } from '../../src/utils/successToastCopy'

/**
 * Matcher for a success confirmation that is deliberately worded more than one
 * way — see `src/utils/successToastCopy.ts`. Pinning one sentence would make
 * the test fail two runs in three.
 */
export function successToastMatching(key: SuccessToastKey): RegExp {
    const escaped = SUCCESS_TOAST_VARIANTS[key].map(variant => variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp(escaped.join('|'))
}
