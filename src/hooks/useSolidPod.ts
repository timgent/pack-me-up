import { useContext } from 'react';
import { SolidPodContext } from '../contexts/SolidPodContext';

export function useSolidPod() {
  const context = useContext(SolidPodContext);

  if (context === undefined) {
    throw new Error('useSolidPod must be used within a SolidPodProvider');
  }

  return context;
}
