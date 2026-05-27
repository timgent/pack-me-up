import { createContext, useContext } from 'react'

export interface ForeignPodContextValue {
    foreignPodUrl: string
}

export const ForeignPodContext = createContext<ForeignPodContextValue | null>(null)

export function useForeignPod(): ForeignPodContextValue | null {
    return useContext(ForeignPodContext)
}
