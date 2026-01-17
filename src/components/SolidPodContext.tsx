import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  Session,
  handleIncomingRedirect,
  getDefaultSession,
  login as solidLogin,
  logout as solidLogout
} from "@inrupt/solid-client-authn-browser";
import { useToast } from "./ToastContext";
import { isAuthenticationError } from "../services/solidPod";
import { useAuthLoopDetection } from "../hooks/useAuthLoopDetection";

interface SolidPodContextValue {
  session: Session | null;
  isLoggedIn: boolean;
  webId: string | undefined;
  isLoading: boolean;
  login: (oidcIssuer: string, returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SolidPodContext = createContext<SolidPodContextValue | undefined>(undefined);

/**
 * Updates the session state and increments the session version
 */
function updateSessionState(
  setSession: (session: Session) => void,
  setSessionVersion: (updater: (v: number) => number) => void
): void {
  const updatedSession = getDefaultSession();
  setSession(updatedSession);
  setSessionVersion(v => v + 1);
}

/**
 * Handles errors during session initialization by clearing corrupted data
 */
async function handleSessionClearingError(
  error: unknown,
  setSession: (session: Session) => void,
  setSessionVersion: (updater: (v: number) => number) => void
): Promise<void> {
  console.error("Error initializing session:", error);
  console.log("Session restoration failed, clearing any corrupted session data...");

  try {
    await solidLogout();
    updateSessionState(setSession, setSessionVersion);
    console.log("Session data cleared successfully");
  } catch (logoutError) {
    console.error("Error clearing session data:", logoutError);
    // Even if logout fails, try to set a fresh session
    updateSessionState(setSession, setSessionVersion);
  }
}

/**
 * Sets up event listeners for session lifecycle events
 * Monitors login, logout, and session restoration events
 */
function setupSessionEventListeners(
  session: Session,
  showToast: (message: string, type: 'success' | 'error') => void,
  setSession: (session: Session) => void,
  setSessionVersion: (updater: (v: number) => number) => void
) {
  // Listen for logout events (including session expiration)
  session.events.on("logout", () => {
    console.log("Session logout event fired");
    updateSessionState(setSession, setSessionVersion);

    // Notify user that session has expired
    showToast(
      "Your Solid session has expired. Your data is saved locally - log in again to sync with your Pod.",
      "error"
    );
  });

  // Listen for login events
  session.events.on("login", () => {
    console.log("Session login event fired");
    updateSessionState(setSession, setSessionVersion);
  });

  // Listen for session restore events
  session.events.on("sessionRestore", () => {
    console.log("Session restore event fired");
    updateSessionState(setSession, setSessionVersion);
  });
}

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setSessionVersion] = useState(0);
  const { showToast } = useToast();
  const { checkAndUpdateTracker, clearTracker, clearInruptStorage } = useAuthLoopDetection();

  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log("Initializing Solid session...");

        // Check for redirect loop before attempting session restoration
        const tracker = checkAndUpdateTracker();

        if (tracker.shouldClear) {
          console.warn("Redirect loop detected - clearing corrupted session data");
          showToast(
            "Detected authentication issue - clearing session. Please log in again.",
            "error"
          );
          await clearInruptStorage();
          clearTracker();
          // Continue with fresh state
        }

        await handleIncomingRedirect({ restorePreviousSession: true });

        // Success! Clear the tracker since we didn't get stuck in a loop
        clearTracker();

        const currentSession = getDefaultSession();
        console.log("Session initialized:", {
          isLoggedIn: currentSession.info.isLoggedIn,
          webId: currentSession.info.webId,
          sessionId: currentSession.info.sessionId
        });
        setSession(currentSession);
        setSessionVersion(v => v + 1);

        // Set up session event listeners
        setupSessionEventListeners(currentSession, showToast, setSession, setSessionVersion);
      } catch (error) {
        await handleSessionClearingError(error, setSession, setSessionVersion);
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
  }, [showToast, checkAndUpdateTracker, clearTracker, clearInruptStorage]);

  // Validate session when user returns to the tab
  useEffect(() => {
    if (!session?.info.isLoggedIn || !session?.info.webId) {
      return;
    }

    const validateSession = async () => {
      try {
        // Make a lightweight HEAD request to verify the session is still valid
        await session.fetch(session.info.webId!, { method: 'HEAD' });
      } catch (error: any) {
        // If authentication error, the session has expired
        if (isAuthenticationError(error)) {
          console.log("Session validation failed - session has expired");
          await solidLogout();
          updateSessionState(setSession, setSessionVersion);
          showToast(
            "Your session expired while you were away. Please log in again.",
            "error"
          );
        } else {
          // Network errors or other issues - log but don't logout
          console.error("Session validation failed with non-auth error:", error);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("Tab became visible - validating session");
        validateSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session?.info.isLoggedIn, session?.info.webId, showToast]);

  const login = async (oidcIssuer: string, returnTo?: string) => {
    const currentLocation = returnTo || window.location.hash.substring(1) || "/";
    const redirectUrl = new URL("/pod-auth-callback.html", window.location.href);
    redirectUrl.searchParams.set("returnTo", currentLocation);

    return solidLogin({
      oidcIssuer,
      redirectUrl: redirectUrl.toString(),
      clientName: "Pack Me Up",
    });
  };

  const logout = async () => {
    await solidLogout();
    updateSessionState(setSession, setSessionVersion);
  };

  const value: SolidPodContextValue = {
    session,
    isLoggedIn: session?.info.isLoggedIn ?? false,
    webId: session?.info.webId,
    isLoading,
    login,
    logout,
  };

  return (
    <SolidPodContext.Provider value={value}>
      {children}
    </SolidPodContext.Provider>
  );
}

export function useSolidPod() {
  const context = useContext(SolidPodContext);

  if (context === undefined) {
    throw new Error('useSolidPod must be used within a SolidPodProvider');
  }

  return context;
}
