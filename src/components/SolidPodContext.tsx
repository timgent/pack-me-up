import { createContext, ReactNode, useContext, useState, useEffect, useRef, useCallback } from "react";
import { type SessionStateChangeDetail } from "@uvdsl/solid-oidc-client-browser/core";
import { SessionIDB } from "@uvdsl/solid-oidc-client-browser";
import { ResilientSession, SessionEndedError } from "../services/ResilientSession";
import { logAuthEvent } from "../services/authLog";
import { resetPodSessionCaches } from "../services/solidPod";
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

/** Backoff schedule for retrying a session we believe is still restorable. */
const RECOVERY_DELAYS_MS = [1_000, 3_000, 8_000, 20_000, 45_000, 90_000];

/**
 * How long startup waits for a session to come back before rendering anyway.
 * The restore keeps going in the background; this only decides whether the user
 * stares at a spinner while it does.
 */
const STARTUP_RESTORE_BUDGET_MS = 4_000;

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [webId, setWebId] = useState<string | undefined>(undefined);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const intentionalLogoutRef = useRef(false);

  // A session we could not restore yet but have no reason to believe is dead.
  // While this is set, the app keeps quietly trying rather than showing the user
  // a login prompt for what is usually a few seconds of bad network.
  const recoveringRef = useRef(false);
  const recoveryAttemptRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const uvdslSessionRef = useRef<ResilientSession>(null!);
  if (!uvdslSessionRef.current) {
    const origin = window.location.origin || "http://localhost";
    // On production, VITE_CLIENT_ID_URL is set so the provider fetches the hosted Client ID
    // Document (static registration). On preview deploys and localhost it is unset, so we fall
    // back to dynamic client registration using the current origin's redirect URI.
    const clientIdUrl = import.meta.env.VITE_CLIENT_ID_URL as string | undefined;
    uvdslSessionRef.current = new ResilientSession(
      clientIdUrl
        ? { client_id: clientIdUrl }
        : {
            // Use SPA root so the redirect_uri in the token exchange matches what's registered.
            // If we go through pod-auth-callback.html, the library strips params from that URL
            // and sends the wrong redirect_uri to the token endpoint.
            redirect_uris: [origin + "/"],
            client_name: "Pack Me Up",
          },
      new SessionIDB(),
      {
        onSessionStateChange: (e) => {
          const { isActive, webId: newWebId } = (e as CustomEvent<SessionStateChangeDetail>).detail;
          setIsLoggedIn(isActive);
          setWebId(isActive ? newWebId : undefined);
          if (isActive) {
            setSessionExpired(false);
            recoveringRef.current = false;
            recoveryAttemptRef.current = 0;
          }
        },
        // ResilientSession fires this only when the provider has rejected the
        // grant — not for network trouble, which it retries on its own.
        onSessionExpiration: () => {
          if (!intentionalLogoutRef.current) setSessionExpired(true);
          recoveringRef.current = false;
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

  /**
   * Tries to restore, and keeps trying on a backoff while the failure looks
   * temporary. Only the provider rejecting the grant stops the attempts — a
   * refresh token that is merely unreachable is not a logged-out user.
   */
  const attemptRestore = useCallback(async (trigger: string): Promise<boolean> => {
    if (uvdslSession.isActive) return true;
    if (!(await uvdslSession.hasStoredSession())) {
      logAuthEvent("restore.no-stored-session", { trigger });
      recoveringRef.current = false;
      return false;
    }

    try {
      logAuthEvent("restore.attempt", { trigger, attempt: recoveryAttemptRef.current + 1 });
      await uvdslSession.restore();
      recoveringRef.current = false;
      recoveryAttemptRef.current = 0;
      logAuthEvent("restore.succeeded", { trigger });
      return true;
    } catch (error) {
      if (error instanceof SessionEndedError) {
        logAuthEvent("restore.session-ended", { trigger, reason: error.reason }, "error");
        recoveringRef.current = false;
        return false;
      }
      // Still recoverable. Schedule another go.
      recoveringRef.current = true;
      const attempt = recoveryAttemptRef.current;
      recoveryAttemptRef.current = attempt + 1;
      const delay = RECOVERY_DELAYS_MS[Math.min(attempt, RECOVERY_DELAYS_MS.length - 1)];
      logAuthEvent("restore.will-retry", { trigger, attempt: attempt + 1, delay }, "warn");

      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = setTimeout(() => { void attemptRestore("backoff"); }, delay);
      return false;
    }
  }, [uvdslSession]);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        logAuthEvent("init.start");

        const searchParams = new URLSearchParams(window.location.search);
        const isOAuthCallback = searchParams.has("code") || searchParams.has("state");

        if (!isOAuthCallback) {
          sessionStorage.setItem(AUTH_RETURN_TO_KEY, window.location.hash.substring(1) || "/");
        }

        try {
          await uvdslSession.handleRedirectFromLogin();
        } catch (error) {
          // A malformed or stale callback must not cost us the session already
          // stored on this device — fall through and restore it below.
          logAuthEvent("login.redirect-failed", { reason: String(error) }, "warn");
        }

        if (isOAuthCallback && uvdslSession.isActive) {
          // Redirect completed — navigate to the stored return route.
          // We handle this here instead of via pod-auth-callback.html so the
          // redirect_uri registered with the IdP can be the plain SPA root ("/").
          logAuthEvent("login.completed", { webId: uvdslSession.webId });
          uvdslSession.scheduleRenewal();
          const returnTo = sessionStorage.getItem(AUTH_RETURN_TO_KEY) || "/solid-pod-handle-redirect";
          window.location.replace("/#" + returnTo);
          return;
        }

        if (!uvdslSession.isActive) {
          // Don't hold the first paint hostage to a slow network — the retry
          // continues in the background and signs the user in when it lands.
          await Promise.race([
            attemptRestore("startup"),
            new Promise(resolve => setTimeout(resolve, STARTUP_RESTORE_BUDGET_MS)),
          ]);
        }
      } catch (error) {
        logAuthEvent("init.failed", { reason: String(error) }, "error");
      } finally {
        setIsLoading(false);
      }
    };

    void initializeSession();
    return () => clearTimeout(recoveryTimerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Take every chance to get a stalled session back: coming online, or the user
  // returning to the tab, are both good moments to retry ahead of the backoff.
  useEffect(() => {
    const retryIfRecovering = (trigger: string) => {
      if (!recoveringRef.current || uvdslSession.isActive) return;
      clearTimeout(recoveryTimerRef.current);
      void attemptRestore(trigger);
    };

    const onOnline = () => retryIfRecovering("online");
    const onVisible = () => {
      if (document.visibilityState === "visible") retryIfRecovering("visible");
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [attemptRestore, uvdslSession]);

  // Returning to the tab is when a token is most likely to have lapsed while the
  // device slept. Renew it before the user's first action needs it.
  useEffect(() => {
    if (!isLoggedIn) return;

    const renewIfNeeded = () => {
      if (document.visibilityState !== "visible") return;
      if (!uvdslSession.needsRenewal()) return;
      logAuthEvent("refresh.on-visible");
      void uvdslSession.restore().catch(() => { /* restore() reports and retries */ });
    };

    document.addEventListener("visibilitychange", renewIfNeeded);
    window.addEventListener("online", renewIfNeeded);
    return () => {
      document.removeEventListener("visibilitychange", renewIfNeeded);
      window.removeEventListener("online", renewIfNeeded);
    };
  }, [isLoggedIn, uvdslSession]);

  // Keep the renewal timer armed for the life of the session.
  useEffect(() => {
    if (!isLoggedIn) {
      uvdslSession.cancelRenewal();
      return;
    }
    uvdslSession.scheduleRenewal();
    return () => uvdslSession.cancelRenewal();
  }, [isLoggedIn, uvdslSession]);

  const login = async (oidcIssuer: string, returnTo?: string) => {
    const currentLocation = returnTo || window.location.hash.substring(1) || "/";
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, currentLocation);
    const redirectUri = (window.location.origin || "http://localhost") + "/";
    logAuthEvent("login.redirecting", { oidcIssuer });
    await uvdslSession.login(oidcIssuer, redirectUri);
  };

  const logout = async () => {
    intentionalLogoutRef.current = true;
    recoveringRef.current = false;
    clearTimeout(recoveryTimerRef.current);
    try {
      await uvdslSession.logout();
    } finally {
      // Leaving this set would swallow the banner for the next genuine expiry.
      intentionalLogoutRef.current = false;
    }
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
