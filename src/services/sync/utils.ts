/**
 * Utilities for sync operations
 */

const DEVICE_ID_KEY = 'pack-me-up:device-id';

/**
 * Generate a unique device ID
 */
function generateDeviceId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `device-${timestamp}-${random}`;
}

/**
 * Get or create device ID
 * Device ID is stored in localStorage and persists across sessions
 */
export function getDeviceId(): string {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);

    if (!deviceId) {
        deviceId = generateDeviceId();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    return deviceId;
}

/**
 * Simple hash function for checksums
 * Using DJB2 hash algorithm
 */
function simpleHash(str: string): string {
    let hash = 5381;

    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) + hash) + char; // hash * 33 + char
    }

    // Convert to positive number and hex string
    return (hash >>> 0).toString(16);
}

/**
 * Calculate checksum for a document
 * Sorts keys to ensure consistent ordering
 */
export function calculateChecksum(doc: any): string {
    // Create a copy without syncMetadata and PouchDB metadata
    const { syncMetadata, _rev, ...docWithoutMeta } = doc;

    // Sort keys for consistent ordering
    const sortedKeys = Object.keys(docWithoutMeta).sort();
    const sortedDoc: any = {};

    for (const key of sortedKeys) {
        sortedDoc[key] = docWithoutMeta[key];
    }

    const str = JSON.stringify(sortedDoc);
    return simpleHash(str);
}

/**
 * Check if document has changed based on checksum
 */
export function hasDocumentChanged(doc: any, previousChecksum: string): boolean {
    const currentChecksum = calculateChecksum(doc);
    return currentChecksum !== previousChecksum;
}

/**
 * Check if a document has unsynced local changes
 */
export function hasUnsyncedLocalChanges(doc: any): boolean {
    if (!doc.syncMetadata?.lastSyncedAt) {
        return true; // Never synced
    }

    const updatedAt = new Date(doc.updatedAt);
    const lastSyncedAt = new Date(doc.syncMetadata.lastSyncedAt);

    return updatedAt > lastSyncedAt;
}

/**
 * Compare timestamps to determine which is newer
 */
export function compareTimestamps(
    timestamp1: string,
    timestamp2: string
): 'before' | 'after' | 'equal' {
    const date1 = new Date(timestamp1);
    const date2 = new Date(timestamp2);

    if (date1 < date2) return 'before';
    if (date1 > date2) return 'after';
    return 'equal';
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) {
                throw error;
            }

            // Exponential backoff: 1s, 2s, 4s, etc.
            const delay = baseDelay * Math.pow(2, i);
            await sleep(delay);
        }
    }

    throw new Error('Retry failed'); // Should never reach here
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: any): boolean {
    return (
        error.message?.includes('network') ||
        error.message?.includes('fetch') ||
        error.message?.includes('Failed to fetch') ||
        error.name === 'NetworkError'
    );
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: any): boolean {
    return (
        error.status === 401 ||
        error.status === 403 ||
        error.message?.includes('unauthorized') ||
        error.message?.includes('authentication')
    );
}

/**
 * Format relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(timestamp: string): string {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (seconds > 0) return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
    return 'just now';
}
