import { useState, useEffect, useCallback, useRef } from 'react';
import { useSolidPod } from '../components/SolidPodContext';
import { getPrimaryPodUrl, loadFileFromPod, saveFileToPod, POD_CONTAINERS } from '../services/solidPod';
import { PackingListQuestionSet } from '../edit-questions/types';

export interface QuestionSetSyncOptions {
  pollInterval?: number; // in milliseconds, null to disable polling
  onSyncSuccess?: (data: PackingListQuestionSet) => void;
  onSyncError?: (error: string) => void;
  onSaveSuccess?: () => void;
  onSaveError?: (error: string) => void;
  enabled?: boolean; // whether sync is enabled
}

export interface QuestionSetSyncState {
  lastSync: Date | null;
  isSyncing: boolean;
  error: string | null;
  saveToPod: (data: PackingListQuestionSet) => Promise<boolean>;
  syncFromPod: () => Promise<void>;
}

/**
 * Hook for automatic synchronization of question sets with Solid Pod
 * Polls the pod at regular intervals and provides manual sync functions
 */
export function useQuestionSetSync(options: QuestionSetSyncOptions = {}): QuestionSetSyncState {
  const {
    pollInterval = 10000, // Default: poll every 10 seconds
    onSyncSuccess,
    onSyncError,
    onSaveSuccess,
    onSaveError,
    enabled = true,
  } = options;

  const { session, isLoggedIn } = useSolidPod();
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to prevent concurrent syncs
  const isSyncingRef = useRef(false);

  /**
   * Load data from the Pod
   */
  const syncFromPod = useCallback(async () => {
    if (!enabled || !isLoggedIn || isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setError(null);

    try {
      const podUrl = await getPrimaryPodUrl(session);

      if (!podUrl) {
        throw new Error('No pod URL found');
      }

      const fileUrl = `${podUrl}${POD_CONTAINERS.QUESTIONS}`;

      const data = await loadFileFromPod<PackingListQuestionSet>({
        session: session!,
        fileUrl,
      });

      setLastSync(new Date());

      if (onSyncSuccess) {
        onSyncSuccess(data);
      }
    } catch (err: any) {
      // 404 errors are expected when file doesn't exist yet - not a real error
      if (err.statusCode !== 404) {
        const errorMessage = err.message || 'Failed to sync from Pod';
        setError(errorMessage);

        if (onSyncError) {
          onSyncError(errorMessage);
        }
      }
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [enabled, isLoggedIn, session, onSyncSuccess, onSyncError]);

  /**
   * Save data to the Pod
   */
  const saveToPod = useCallback(async (data: PackingListQuestionSet): Promise<boolean> => {
    if (!enabled || !isLoggedIn) {
      return false;
    }

    setError(null);

    try {
      const podUrl = await getPrimaryPodUrl(session);

      if (!podUrl) {
        throw new Error('No pod URL found');
      }

      const containerUrl = `${podUrl}${POD_CONTAINERS.ROOT}`;

      await saveFileToPod({
        session: session!,
        containerPath: containerUrl,
        filename: 'packing-list-questions.json',
        data,
      });

      setLastSync(new Date());

      if (onSaveSuccess) {
        onSaveSuccess();
      }

      return true;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to save to Pod';
      setError(errorMessage);

      if (onSaveError) {
        onSaveError(errorMessage);
      }

      return false;
    }
  }, [enabled, isLoggedIn, session, onSaveSuccess, onSaveError]);

  /**
   * Set up polling interval
   */
  useEffect(() => {
    if (!enabled || !isLoggedIn || !pollInterval) {
      return;
    }

    // Do an initial sync when the hook mounts or login state changes
    syncFromPod();

    // Set up the polling interval
    const interval = setInterval(() => {
      syncFromPod();
    }, pollInterval);

    return () => {
      clearInterval(interval);
    };
  }, [enabled, isLoggedIn, pollInterval, syncFromPod]);

  return {
    lastSync,
    isSyncing,
    error,
    saveToPod,
    syncFromPod,
  };
}
