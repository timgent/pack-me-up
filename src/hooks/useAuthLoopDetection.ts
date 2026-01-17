import { logout as solidLogout } from "@inrupt/solid-client-authn-browser";

// Configuration for redirect loop detection
export const AUTH_CONFIG = {
  TRACKER_KEY: 'solid-auth-init-tracker',
  ATTEMPT_THRESHOLD: 1,
  TIME_WINDOW_MS: 60000, // 60 seconds
  INRUPT_STORAGE_PREFIX: 'solidClientAuthentication',
} as const;

interface AuthTracker {
  attempts: number;
  firstAttemptTime: number;
  lastAttemptTime: number;
}

/**
 * Creates a new authentication tracker
 */
function createTracker(now: number): AuthTracker {
  return {
    attempts: 1,
    firstAttemptTime: now,
    lastAttemptTime: now
  };
}

/**
 * Retrieves the tracker from sessionStorage
 * Returns null if not found or corrupted
 */
function getTrackerFromStorage(): AuthTracker | null {
  const stored = sessionStorage.getItem(AUTH_CONFIG.TRACKER_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as AuthTracker;
  } catch (error) {
    console.error('Corrupted auth tracker, removing:', error);
    sessionStorage.removeItem(AUTH_CONFIG.TRACKER_KEY);
    return null;
  }
}

/**
 * Saves the tracker to sessionStorage
 */
function saveTracker(tracker: AuthTracker): void {
  sessionStorage.setItem(AUTH_CONFIG.TRACKER_KEY, JSON.stringify(tracker));
}

/**
 * Checks for and tracks authentication initialization attempts
 * Returns whether corrupted session data should be cleared
 */
export function checkAndUpdateTracker(): { shouldClear: boolean } {
  const now = Date.now();
  const tracker = getTrackerFromStorage();

  if (!tracker) {
    // First attempt
    const newTracker = createTracker(now);
    saveTracker(newTracker);
    console.log('Auth tracker initialized (attempt 1)');
    return { shouldClear: false };
  }

  const timeSinceFirst = now - tracker.firstAttemptTime;

  if (timeSinceFirst > AUTH_CONFIG.TIME_WINDOW_MS) {
    // Outside time window - reset tracker
    const newTracker = createTracker(now);
    saveTracker(newTracker);
    console.log('Auth tracker reset (outside time window)');
    return { shouldClear: false };
  }

  // Within time window - increment attempts
  tracker.attempts += 1;
  tracker.lastAttemptTime = now;
  saveTracker(tracker);

  console.log(`Auth attempt ${tracker.attempts} within ${timeSinceFirst}ms`);

  if (tracker.attempts >= AUTH_CONFIG.ATTEMPT_THRESHOLD) {
    console.warn(
      `Detected ${tracker.attempts} auth attempts in ${timeSinceFirst}ms - redirect loop detected`
    );
    return { shouldClear: true };
  }

  return { shouldClear: false };
}

/**
 * Clears the authentication attempt tracker
 */
export function clearTracker(): void {
  sessionStorage.removeItem(AUTH_CONFIG.TRACKER_KEY);
  console.log('Auth tracker cleared');
}

/**
 * Clears all Inrupt-related storage to fix corrupted sessions
 */
export async function clearInruptStorage(): Promise<void> {
  console.log('Clearing Inrupt session storage...');

  // Get all localStorage keys
  const keys = Object.keys(localStorage);

  // Remove all Inrupt-related keys
  const removedKeys: string[] = [];
  keys.forEach(key => {
    if (key.startsWith(AUTH_CONFIG.INRUPT_STORAGE_PREFIX)) {
      localStorage.removeItem(key);
      removedKeys.push(key);
    }
  });

  console.log(`Removed ${removedKeys.length} Inrupt storage keys:`, removedKeys);

  // Also try to logout using the library's method to ensure clean state
  try {
    await solidLogout();
    console.log('Inrupt logout completed');
  } catch (error) {
    console.error('Error during Inrupt logout:', error);
  }

  console.log('Inrupt session storage cleared successfully');
}

/**
 * Custom hook for authentication loop detection
 * Provides utilities to detect and recover from redirect loops
 */
export function useAuthLoopDetection() {
  return {
    checkAndUpdateTracker,
    clearTracker,
    clearInruptStorage,
  };
}
