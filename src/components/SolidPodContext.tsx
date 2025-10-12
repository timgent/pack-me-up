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
  login: (returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SolidPodContext = createContext<SolidPodContextValue | undefined>(undefined);

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        // Create a new object to ensure React detects the change
        setSession({ ...currentSession });
      } catch (error) {
        console.error("Error initializing session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
  }, []);

  const login = async (returnTo?: string) => {
    const currentLocation = returnTo || window.location.hash.substring(1) || "/";
    const redirectUrl = new URL("/pod-auth-callback.html", window.location.href);
    redirectUrl.searchParams.set("returnTo", currentLocation);

    return solidLogin({
      oidcIssuer: "https://login.inrupt.com",
      redirectUrl: redirectUrl.toString(),
      clientName: "Pack Me Up",
    });
  };

  const logout = async () => {
    await solidLogout();
    const updatedSession = getDefaultSession();
    setSession({ ...updatedSession });
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
