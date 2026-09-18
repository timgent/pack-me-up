import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import React, { type ReactNode } from 'react'
import type { WebIdLookup } from '../hooks/useWebIdLookup'
import { friendlyWebIdName } from '../services/solidPod'
import { Input } from './Input'

/**
 * The field that asks for somebody else's sharing address.
 *
 * Every share in this app is gated on one string that only the other person can
 * produce, and for a long time this field took that string on trust: a Pod root
 * instead of a WebID, a profile card missing its `#me`, a typo — all of them
 * were written into the access list, reported as a success, and reached nobody.
 * The person sharing had no way to know, and the person waiting had nothing to
 * look at. That is the failure this component exists to end.
 *
 * So it does two things the plain input did not. It shows the address it is
 * actually going to use, once `normaliseWebIdInput` has made one — so "typed a
 * Pod root" stops being a silent difference. And it names who is there, from
 * their own profile card, before anything is granted.
 *
 * What it never does is block. An unreadable card means the address is wrong,
 * *or* the server is down, *or* the card is private, and this end cannot tell
 * which; refusing to share on that evidence would invent a new way to be stuck.
 * `unknown` warns and lets them through.
 */
export function WebIdField({
    label,
    value,
    onChange,
    lookup,
    disabled,
    placeholder = 'e.g. https://alice.solidcommunity.net/profile/card#me',
    inputRef,
    inputAriaLabel,
    onBlur,
    emptyHint = (
        <>
            Ask them to open Pack Me Up, go to their <strong>Sharing page</strong>, and
            tap “Copy my address”.
        </>
    ),
}: {
    label: string
    value: string
    onChange: (raw: string) => void
    lookup: WebIdLookup
    disabled?: boolean
    placeholder?: string
    inputRef?: React.Ref<HTMLInputElement>
    /**
     * A fuller accessible name, where the visible label cannot say who this is
     * about — one field per person in a list of them. Keep the visible label
     * inside it, so what is read matches what is seen.
     */
    inputAriaLabel?: string
    /** Somewhere to normalise the value, for callers that store what is typed. */
    onBlur?: () => void
    /** What an empty field suggests. The default points at the sharing flow. */
    emptyHint?: ReactNode
}) {
    const { webId, status, profile } = lookup
    // Worth saying out loud only when we changed something. Told "we'll use
    // exactly what you typed", nobody learns anything.
    const showsNormalised = webId !== null && webId !== value.trim()

    return (
        <div className="space-y-2">
            <Input
                label={label}
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                disabled={disabled}
                ref={inputRef}
                aria-label={inputAriaLabel}
                onBlur={onBlur}
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
            />

            {/* One live region for every verdict, so a screen reader hears the
                result of typing an address rather than only sighted users. */}
            <div role="status" aria-live="polite" className="min-h-[1.25rem]">
                {status === 'empty' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{emptyHint}</p>
                )}

                {status === 'invalid' && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <ExclamationTriangleIcon aria-hidden="true" className="h-4 w-4 shrink-0 mt-px" />
                        <span>
                            That doesn't look like a sharing address. They usually look like
                            <span className="font-mono"> https://their-name.solidcommunity.net/profile/card#me</span>.
                        </span>
                    </p>
                )}

                {status === 'checking' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Checking that address…</p>
                )}

                {status === 'found' && webId && (
                    <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 px-3 py-2">
                        {profile.photo
                            ? <img src={profile.photo} alt="" aria-hidden="true" className="h-7 w-7 rounded-full object-cover shrink-0" />
                            : <CheckCircleIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-green-700 dark:text-green-400" />}
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-green-900 dark:text-green-200 truncate">
                                {profile.name ?? friendlyWebIdName(webId)}
                            </p>
                            {showsNormalised && (
                                <p className="text-[11px] text-green-800/80 dark:text-green-300/80 break-all">{webId}</p>
                            )}
                        </div>
                    </div>
                )}

                {status === 'unknown' && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-3 py-2">
                        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                            <ExclamationTriangleIcon aria-hidden="true" className="h-4 w-4 shrink-0 mt-px" />
                            <span>
                                We couldn't find anyone at that address. Check it with them before you
                                share — or carry on if you know it's right, as some Pods keep their
                                profile private.
                            </span>
                        </p>
                        {showsNormalised && webId && (
                            <p className="mt-1 text-[11px] text-amber-800/80 dark:text-amber-300/80 break-all">
                                We'll share with {webId}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
