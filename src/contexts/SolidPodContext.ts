import { createContext } from "react";
import { Session } from "@inrupt/solid-client-authn-browser";

interface SolidPodContextValue {
  session: Session | null;
  isLoggedIn: boolean;
  webId: string | undefined;
  isLoading: boolean;
  login: (oidcIssuer: string, returnTo?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const SolidPodContext = createContext<SolidPodContextValue | undefined>(undefined);
