import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useSolidPod } from './SolidPodContext';
import { SolidProviderSelector } from './SolidProviderSelector';

/**
 * Reasons `SessionEndedError` throws for that mean the identity provider itself
 * revoked or lost the grant — as opposed to `no-stored-session`, which just means
 * there was nothing on this device to restore. Telling them apart matters: a
 * provider-side rejection is not this app's fault, and saying so stops a user
 * from assuming the app broke when their own provider (often a self-hosted one)
 * restarted or revoked access.
 */
const PROVIDER_ENDED_REASONS = new Set([
    'invalid_grant',
    'invalid_client',
    'unauthorized_client',
    'dpop-key-mismatch',
    'client-id-mismatch',
]);

function sessionExpiredMessage(reason: string | undefined): string {
    if (reason && PROVIDER_ENDED_REASONS.has(reason)) {
        return 'Your identity provider ended this session — it may have restarted or your access may have been revoked there. Your data is saved locally.';
    }
    return 'Your session has expired. Your data is saved locally.';
}

export function SessionExpiredBanner() {
    const { sessionExpired, sessionExpiredReason, isLoggedIn, clearSessionExpired, login } = useSolidPod();
    const [isProviderSelectorOpen, setIsProviderSelectorOpen] = useState(false);

    if (!sessionExpired || isLoggedIn) return null;

    return (
        <>
            <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between">
                <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">
                    {sessionExpiredMessage(sessionExpiredReason)}
                </p>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsProviderSelectorOpen(true)}
                        className="text-sm font-semibold text-amber-900 dark:text-amber-200 underline hover:no-underline"
                    >
                        Log in again
                    </button>
                    <button onClick={clearSessionExpired} aria-label="Dismiss">
                        <XMarkIcon className="h-4 w-4 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200" />
                    </button>
                </div>
            </div>
            <SolidProviderSelector
                isOpen={isProviderSelectorOpen}
                onClose={() => setIsProviderSelectorOpen(false)}
                onSelect={(issuer) => login(issuer)}
            />
        </>
    );
}
