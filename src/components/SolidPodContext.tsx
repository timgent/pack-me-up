import { createContext, ReactNode, useContext, useState, useEffect, useRef } from "react";
import {
  Session,
  handleIncomingRedirect,
  getDefaultSession,
  login as solidLogin,
  logout as solidLogout
} from "@inrupt/solid-client-authn-browser";
import { useToast } from "./ToastContext";
import { isAuthenticationError } from "../services/solidPod";
import { databaseManager } from "../services/databaseManager";

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
 * Sets up event listeners for session lifecycle events
 * Monitors login, logout, and session restoration events
 */
function setupSessionEventListeners(
  session: Session,
  showToast: (message: string, type: 'success' | 'error') => void,
  setSession: (session: Session) => void,
  setSessionVersion: (updater: (v: number) => number) => void,
  isExplicitLogoutRef: React.MutableRefObject<boolean>
) {
  // Listen for logout events (including session expiration)
  session.events.on("logout", async () => {
    console.log("Session logout event fired");

    // Update UI state
    setSession(getDefaultSession());
    setSessionVersion(v => v + 1);

    // Only switch to default database if this was an explicit logout
    // If session just timed out, keep using the user-specific database
    if (isExplicitLogoutRef.current) {
      console.log("Explicit logout - switching to default database");
      await databaseManager.switchToDefaultDatabase();
      isExplicitLogoutRef.current = false; // Reset the flag
    } else {
      console.log("Session timeout - keeping user-specific database");
    }

    // Notify user that session has expired
    showToast(
      "Your Solid session has expired. Your data is saved locally - log in again to sync with your Pod.",
      "error"
    );
  });

  // Listen for login events
  session.events.on("login", async () => {
    console.log("Session login event fired");
    const updatedSession = getDefaultSession();

    // Switch to user-specific database and sync from pod
    if (updatedSession.info.webId) {
      console.log("Switching to user-specific database for", updatedSession.info.webId);
      await databaseManager.switchToUserDatabase(updatedSession.info.webId, updatedSession);
    }

    setSession(updatedSession);
    setSessionVersion(v => v + 1);
  });

  // Listen for session restore events
  session.events.on("sessionRestore", async () => {
    console.log("Session restore event fired");
    const updatedSession = getDefaultSession();

    // Switch to user-specific database and sync from pod if restoring a logged-in session
    if (updatedSession.info.webId) {
      console.log("Session restored - switching to user-specific database for", updatedSession.info.webId);
      await databaseManager.switchToUserDatabase(updatedSession.info.webId, updatedSession);
    }

    setSession(updatedSession);
    setSessionVersion(v => v + 1);
  });
}

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setSessionVersion] = useState(0);
  const { showToast } = useToast();
  const isExplicitLogoutRef = useRef(false);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log("Initializing Solid session...");
        await handleIncomingRedirect({ restorePreviousSession: true });
        const currentSession = getDefaultSession();
        console.log("Session initialized:", {
          isLoggedIn: currentSession.info.isLoggedIn,
          webId: currentSession.info.webId,
          sessionId: currentSession.info.sessionId
        });

        // If session is already logged in (restored from previous session),
        // switch to user-specific database and sync from pod
        if (currentSession.info.isLoggedIn && currentSession.info.webId) {
          console.log("Restoring user session - switching to user-specific database");
          await databaseManager.switchToUserDatabase(currentSession.info.webId, currentSession);
        }

        setSession(currentSession);
        setSessionVersion(v => v + 1);

        // Set up session event listeners
        setupSessionEventListeners(currentSession, showToast, setSession, setSessionVersion, isExplicitLogoutRef);
      } catch (error) {
        console.error("Error initializing session:", error);
        console.log("Session restoration failed, clearing any corrupted session data...");

        // Clear any corrupted session data by logging out
        // This handles cases where an invalid client_id or expired session data
        // is stored in the browser, causing authentication failures
        try {
          await solidLogout();
          const clearedSession = getDefaultSession();
          setSession(clearedSession);
          setSessionVersion(v => v + 1);
          console.log("Session data cleared successfully");
        } catch (logoutError) {
          console.error("Error clearing session data:", logoutError);
          // Even if logout fails, try to set a fresh session
          const currentSession = getDefaultSession();
          setSession(currentSession);
          setSessionVersion(v => v + 1);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
  }, [showToast]);

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
          const updatedSession = getDefaultSession();
          setSession(updatedSession);
          setSessionVersion(v => v + 1);
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
    // Mark this as an explicit logout so the event listener knows to switch to default database
    isExplicitLogoutRef.current = true;

    await solidLogout();
    const updatedSession = getDefaultSession();
    setSession(updatedSession);
    setSessionVersion(v => v + 1);
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
