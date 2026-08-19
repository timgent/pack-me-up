import { createContext, ReactNode, useContext, useState, useEffect, useRef } from "react";
import { SessionCore, type SessionStateChangeDetail } from "@uvdsl/solid-oidc-client-browser/core";
import { SessionIDB } from "@uvdsl/solid-oidc-client-browser";
import { isAuthenticationError, resetPodSessionCaches } from "../services/solidPod";
import { AUTH_RETURN_TO_KEY } from "../pages/solid-pod-handle-redirect-page";
import { AppSession } from "../types/AppSession";

interface SolidPodContextValue {
  session: AppSession | null;
  isLoggedIn: boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  webId: string | undefined;
  isLoading: boolean;
  login: (oidcIssuer: string, returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SolidPodContext = createContext<SolidPodContextValue | undefined>(undefined);

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [webId, setWebId] = useState<string | undefined>(undefined);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const intentionalLogoutRef = useRef(false);

  const uvdslSessionRef = useRef<SessionCore>(null!);
  if (!uvdslSessionRef.current) {
    const origin = window.location.origin || "http://localhost";
    // On production, VITE_CLIENT_ID_URL is set so the provider fetches the hosted Client ID
    // Document (static registration). On preview deploys and localhost it is unset, so we fall
    // back to dynamic client registration using the current origin's redirect URI.
    const clientIdUrl = import.meta.env.VITE_CLIENT_ID_URL as string | undefined;
    uvdslSessionRef.current = new SessionCore(
      clientIdUrl
        ? { client_id: clientIdUrl }
        : {
            // Use SPA root so the redirect_uri in the token exchange matches what's registered.
            // If we go through pod-auth-callback.html, the library strips params from that URL
            // and sends the wrong redirect_uri to the token endpoint.
            redirect_uris: [origin + "/"],
            client_name: "Pack Me Up",
          },
      {
        database: new SessionIDB(),
        onSessionStateChange: (e) => {
          const { isActive, webId: newWebId } = (e as CustomEvent<SessionStateChangeDetail>).detail;
          setIsLoggedIn(isActive);
          setWebId(isActive ? newWebId : undefined);
          if (isActive) setSessionExpired(false);
        },
        onSessionExpiration: () => {
          if (!intentionalLogoutRef.current) setSessionExpired(true);
          setIsLoggedIn(false);
          setWebId(undefined);
          intentionalLogoutRef.current = false;
        },
      }
    );
  }

  const uvdslSession = uvdslSessionRef.current;

  const appSession: AppSession | null = isLoggedIn
    ? { fetch: uvdslSession.authFetch.bind(uvdslSession), info: { isLoggedIn, webId } }
    : null;

  useEffect(() => {
    const initializeSession = async () => {
      try {
        console.log("Initializing Solid session...");

        const searchParams = new URLSearchParams(window.location.search);
        const isOAuthCallback = searchParams.has("code") || searchParams.has("state");

        if (!isOAuthCallback) {
          sessionStorage.setItem(AUTH_RETURN_TO_KEY, window.location.hash.substring(1) || "/");
        }

        await uvdslSession.handleRedirectFromLogin();

        if (isOAuthCallback && uvdslSession.isActive) {
          // Redirect completed — navigate to the stored return route.
          // We handle this here instead of via pod-auth-callback.html so the
          // redirect_uri registered with the IdP can be the plain SPA root ("/").
          const returnTo = sessionStorage.getItem(AUTH_RETURN_TO_KEY) || "/solid-pod-handle-redirect";
          window.location.replace("/#" + returnTo);
          return;
        }

        if (!uvdslSession.isActive) {
          try {
            await uvdslSession.restore();
          } catch {
            // No saved session — user starts logged out
          }
        }

        console.log("Session initialized:", { isActive: uvdslSession.isActive, webId: uvdslSession.webId });
      } catch (error) {
        console.error("Error initializing session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Validate session when user returns to the tab
  useEffect(() => {
    if (!isLoggedIn || !webId) return;

    const handleSessionExpired = async () => {
      console.log("Session validation failed - session has expired");
      await uvdslSession.logout();
      setIsLoggedIn(false);
      setWebId(undefined);
      setSessionExpired(true);
    };

    const validateSession = async () => {
      try {
        const response = await uvdslSession.authFetch(webId, { method: "HEAD" });
        if (response.status === 401 || response.status === 403) {
          await handleSessionExpired();
        }
      } catch (error: unknown) {
        if (isAuthenticationError(error)) {
          await handleSessionExpired();
        } else {
          console.error("Session validation failed with non-auth error:", error);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("Tab became visible - validating session");
        validateSession();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isLoggedIn, webId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactively refresh the access token so it doesn't silently expire between user actions.
  // (SessionCore has no background worker, so we poll manually.)
  useEffect(() => {
    if (!isLoggedIn || !webId) return;
    const intervalId = setInterval(async () => {
      try {
        await uvdslSession.authFetch(webId, { method: "HEAD" });
      } catch {
        // Best-effort; event listeners handle real auth failures
      }
    }, 10 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [isLoggedIn, webId]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (oidcIssuer: string, returnTo?: string) => {
    const currentLocation = returnTo || window.location.hash.substring(1) || "/";
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, currentLocation);
    const redirectUri = (window.location.origin || "http://localhost") + "/";
    await uvdslSession.login(oidcIssuer, redirectUri);
  };

  const logout = async () => {
    intentionalLogoutRef.current = true;
    await uvdslSession.logout();
    // Which pod a WebID lives in, and which of its containers exist, are facts
    // about the identity that just went away.
    resetPodSessionCaches();
    setIsLoggedIn(false);
    setWebId(undefined);
  };

  const clearSessionExpired = () => setSessionExpired(false);

  const value: SolidPodContextValue = {
    session: appSession,
    isLoggedIn,
    sessionExpired,
    clearSessionExpired,
    webId,
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
    throw new Error("useSolidPod must be used within a SolidPodProvider");
  }

  return context;
}
