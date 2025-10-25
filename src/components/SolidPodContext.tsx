import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  Session,
  handleIncomingRedirect,
  getDefaultSession,
  login as solidLogin,
  logout as solidLogout
} from "@inrupt/solid-client-authn-browser";

interface SolidPodContextValue {
  session: Session | null;
  isLoggedIn: boolean;
  webId: string | undefined;
  isLoading: boolean;
  login: (oidcIssuer: string, returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  clearStorage: () => void;
}

const SolidPodContext = createContext<SolidPodContextValue | undefined>(undefined);

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setSessionVersion] = useState(0);

  const clearAllSolidStorage = () => {
    // Clear all localStorage keys related to Solid authentication
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('solidClientAuthenticationUser') ||
        key.includes('clientId') ||
        key.includes('solid') ||
        key.includes('inrupt')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      console.log(`Removing localStorage key: ${key}`);
      localStorage.removeItem(key);
    });

    // Clear all sessionStorage keys related to Solid
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (
        key.startsWith('solidClientAuthenticationUser') ||
        key.includes('clientId') ||
        key.includes('solid') ||
        key.includes('inrupt')
      )) {
        sessionKeysToRemove.push(key);
      }
    }
    sessionKeysToRemove.forEach(key => {
      console.log(`Removing sessionStorage key: ${key}`);
      sessionStorage.removeItem(key);
    });

    console.log(`Cleared ${keysToRemove.length} localStorage and ${sessionKeysToRemove.length} sessionStorage keys`);
  };

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
      } catch (error) {
        console.error("Error initializing session:", error);
        console.log("Session restoration failed, clearing any corrupted session data...");

        // Clear any corrupted session data by logging out
        // This handles cases where an invalid client_id or expired session data
        // is stored in the browser, causing authentication failures
        try {
          await solidLogout();

          // Additionally, manually clear all Solid-related browser storage
          // This ensures that any orphaned client_id or session data is removed
          clearAllSolidStorage();

          const clearedSession = getDefaultSession();
          setSession(clearedSession);
          setSessionVersion(v => v + 1);
          console.log("Session data cleared successfully");
        } catch (logoutError) {
          console.error("Error clearing session data:", logoutError);

          // Even if logout fails, manually clear storage and try to set a fresh session
          clearAllSolidStorage();
          const currentSession = getDefaultSession();
          setSession(currentSession);
          setSessionVersion(v => v + 1);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    clearAllSolidStorage();
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
    clearStorage: clearAllSolidStorage,
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
