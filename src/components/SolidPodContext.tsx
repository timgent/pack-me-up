import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  Session,
  handleIncomingRedirect,
  getDefaultSession,
  login as solidLogin,
  logout as solidLogout
} from "@inrupt/solid-client-authn-browser";
import { useToast } from "./ToastContext";

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
  setSessionVersion: (updater: (v: number) => number) => void
) {
  // Listen for logout events (including session expiration)
  session.events.on("logout", () => {
    console.log("Session logout event fired");
    // Update UI state
    setSession(getDefaultSession());
    setSessionVersion(v => v + 1);

    // Notify user that session has expired
    showToast(
      "Your Solid session has expired. Your data is saved locally - log in again to sync with your Pod.",
      "error"
    );
  });

  // Listen for login events
  session.events.on("login", () => {
    console.log("Session login event fired");
    const updatedSession = getDefaultSession();
    setSession(updatedSession);
    setSessionVersion(v => v + 1);
  });

  // Listen for session restore events
  session.events.on("sessionRestore", () => {
    console.log("Session restore event fired");
    const updatedSession = getDefaultSession();
    setSession(updatedSession);
    setSessionVersion(v => v + 1);
  });
}

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setSessionVersion] = useState(0);
  const { showToast } = useToast();

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
        setSession(currentSession);
        setSessionVersion(v => v + 1);

        // Set up session event listeners
        setupSessionEventListeners(currentSession, showToast, setSession, setSessionVersion);
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
