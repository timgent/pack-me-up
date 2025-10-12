import { createContext, ReactNode, useContext, useState } from "react";

const SolidPodContext = createContext("moo");

export function SolidPodProvider({ children }: { children: ReactNode }) {
  const [solidPod, _setSolidPod] = useState("moo")

  return (
    < SolidPodContext.Provider value={solidPod}>
      {children}
    </SolidPodContext.Provider >
  )

}

export function useSolidPod() {
  const context = useContext(SolidPodContext);

  if (context === undefined) {
    throw new Error('useSolidPod must be used within a SolidPodProvider');
  }

  return context;
}
