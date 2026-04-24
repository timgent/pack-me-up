import { createContext, ReactNode, useContext, useState, useEffect, useRef } from "react";
import {
  Session,
  handleIncomingRedirect,
  getDefaultSession,
  login as solidLogin,
  logout as solidLogout
} from "@inrupt/solid-client-authn-browser";
import { isAuthenticationError } from "../services/solidPod";
import { AUTH_RETURN_TO_KEY } from "../pages/solid-pod-handle-redirect-page";

interface SolidPodContextValue {
  session: Session | null;
  isLoggedIn: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  webId: string | undefined;
  isLoading: boolean;
  login: (oidcIssuer: string, returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SolidPodContext = createContext<SolidPodContextValue | undefined>(undefined);

/**
 * Sets up event listeners for session lifecycle events.
 * Monitors login, logout, and session restoration events.
 * Returns a cleanup function that removes all registered listeners.
 */
function setupSessionEventListeners(
  session: Session,
  setSession: (session: Session) => void,
  setSessionVersion: (updater: (v: number) => number) => void,
  setIsLoggedIn: (v: boolean) => void,
  setSessionExpired: (v: boolean) => void,
  intentionalLogoutRef: React.MutableRefObject<boolean>
): () => void {
  // Listen for logout events — fires for both intentional logout and session expiry.
  // Use intentionalLogoutRef to distinguish between the two.
  const onLogout = () => {
    console.log("Session logout event fired");
    setSession(getDefaultSession());
    setSessionVersion(v => v + 1);
    setIsLoggedIn(false);

    if (!intentionalLogoutRef.current) {
      setSessionExpired(true);
    }
    intentionalLogoutRef.current = false;
  };

  // Listen for login events
  const onLogin = () => {
    console.log("Session login event fired");
    const updatedSession = getDefaultSession();
    setSession(updatedSession);
    setSessionVersion(v => v + 1);
    setIsLoggedIn(true);
    setSessionExpired(false);
  };

  // Listen for session restore events
  const onSessionRestore = () => {
    console.log("Session restore event fired");
    const updatedSession = getDefaultSession();
    setSession(updatedSession);
    setSessionVersion(v => v + 1);
    setIsLoggedIn(true);
  };

  session.events.on("logout", onLogout);
  session.events.on("login", onLogin);
  session.events.on("sessionRestore", onSessionRestore);

  return () => {
    session.events.off("logout", onLogout);
    session.events.off("login", onLogin);
    session.events.off("sessionRestore", onSessionRestore);
  };
}

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [, setSessionVersion] = useState(0);
  const intentionalLogoutRef = useRef(false);

  useEffect(() => {
    // Register listeners synchronously on the singleton session so the cleanup
    // function is available immediately (before the async init work completes).
    // This prevents React StrictMode's synchronous cleanup–remount cycle from
    // leaving duplicate listeners when the async callback hasn't resolved yet.
    const initialSession = getDefaultSession();
    const cleanupListeners = setupSessionEventListeners(
      initialSession, setSession, setSessionVersion, setIsLoggedIn, setSessionExpired, intentionalLogoutRef
    );

    const initializeSession = async () => {
      try {
        console.log("Initializing Solid session...");

        // Save the current route before session restore may redirect away.
        // sessionStorage persists through redirect cycles in the same tab, so
        // SolidPodHandleRedirectPage can use this to return the user to the
        // correct page instead of the stale returnTo stored at login time.
        const isOAuthCallback = new URLSearchParams(window.location.search).has("code") ||
          new URLSearchParams(window.location.search).has("state");
        if (!isOAuthCallback) {
          sessionStorage.setItem(AUTH_RETURN_TO_KEY, window.location.hash.substring(1) || "/");
        }

        await handleIncomingRedirect({ restorePreviousSession: true });
        const currentSession = getDefaultSession();
        console.log("Session initialized:", {
          isLoggedIn: currentSession.info.isLoggedIn,
          webId: currentSession.info.webId,
          sessionId: currentSession.info.sessionId
        });
        setSession(currentSession);
        setSessionVersion(v => v + 1);
        setIsLoggedIn(currentSession.info.isLoggedIn);
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

    return cleanupListeners;
  }, []);

  // Validate session when user returns to the tab
  useEffect(() => {
    if (!session?.info.isLoggedIn || !session?.info.webId) {
      return;
    }

    const handleSessionExpired = async () => {
      console.log("Session validation failed - session has expired");
      await solidLogout();
      const updatedSession = getDefaultSession();
      setSession(updatedSession);
      setSessionVersion(v => v + 1);
      setIsLoggedIn(false);
      setSessionExpired(true);
    };

    const validateSession = async () => {
      try {
        // Make a lightweight HEAD request to verify the session is still valid
        const response = await session.fetch(session.info.webId!, { method: 'HEAD' });
        // fetch() doesn't throw on 4xx; check status explicitly
        if (response.status === 401 || response.status === 403) {
          await handleSessionExpired();
        }
      } catch (error: unknown) {
        // If authentication error, the session has expired
        if (isAuthenticationError(error)) {
          await handleSessionExpired();
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
  }, [session, session?.info.isLoggedIn, session?.info.webId]);

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
    intentionalLogoutRef.current = true;
    await solidLogout();
    const updatedSession = getDefaultSession();
    setSession(updatedSession);
    setSessionVersion(v => v + 1);
    setIsLoggedIn(false);
  };

  const clearSessionExpired = () => setSessionExpired(false);

  const value: SolidPodContextValue = {
    session,
    isLoggedIn,
    sessionExpired,
    clearSessionExpired,
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

// eslint-disable-next-line react-refresh/only-export-components
export function useSolidPod() {
  const context = useContext(SolidPodContext);

  if (context === undefined) {
    throw new Error('useSolidPod must be used within a SolidPodProvider');
  }

  return context;
}
