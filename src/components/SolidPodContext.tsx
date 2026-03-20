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
 * Sets up event listeners for session lifecycle events
 * Monitors login, logout, and session restoration events
 */
function setupSessionEventListeners(
  session: Session,
  setSession: (session: Session) => void,
  setSessionVersion: (updater: (v: number) => number) => void,
  setIsLoggedIn: (v: boolean) => void,
  setSessionExpired: (v: boolean) => void,
  intentionalLogoutRef: React.MutableRefObject<boolean>
) {
  // Listen for logout events — fires for both intentional logout and session expiry.
  // Use intentionalLogoutRef to distinguish between the two.
  session.events.on("logout", () => {
    console.log("Session logout event fired");
    setSession(getDefaultSession());
    setSessionVersion(v => v + 1);
    setIsLoggedIn(false);

    if (!intentionalLogoutRef.current) {
      setSessionExpired(true);
    }
    intentionalLogoutRef.current = false;
  });

  // Listen for login events
  session.events.on("login", () => {
    console.log("Session login event fired");
    const updatedSession = getDefaultSession();
    setSession(updatedSession);
    setSessionVersion(v => v + 1);
    setIsLoggedIn(true);
    setSessionExpired(false);
  });

  // Listen for session restore events
  session.events.on("sessionRestore", () => {
    console.log("Session restore event fired");
    const updatedSession = getDefaultSession();
    setSession(updatedSession);
    setSessionVersion(v => v + 1);
    setIsLoggedIn(true);
  });
}

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [, setSessionVersion] = useState(0);
  const { showToast } = useToast();
  const intentionalLogoutRef = useRef(false);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log("Initializing Solid session...");
        await handleIncomingRedirect({ restorePreviousSession: false });
        const currentSession = getDefaultSession();
        console.log("Session initialized:", {
          isLoggedIn: currentSession.info.isLoggedIn,
          webId: currentSession.info.webId,
          sessionId: currentSession.info.sessionId
        });
        setSession(currentSession);
        setSessionVersion(v => v + 1);
        setIsLoggedIn(currentSession.info.isLoggedIn);

        // Set up session event listeners
        setupSessionEventListeners(currentSession, setSession, setSessionVersion, setIsLoggedIn, setSessionExpired, intentionalLogoutRef);
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
      } catch (error: unknown) {
        // If authentication error, the session has expired
        if (isAuthenticationError(error)) {
          console.log("Session validation failed - session has expired");
          await solidLogout();
          const updatedSession = getDefaultSession();
          setSession(updatedSession);
          setSessionVersion(v => v + 1);
          setIsLoggedIn(false);
          setSessionExpired(true);
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
