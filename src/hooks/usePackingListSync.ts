import { useState, useEffect, useCallback, useRef } from 'react';
import { useSolidPod } from '../components/SolidPodContext';
import { getPrimaryPodUrl, loadFileFromPod, saveFileToPod, POD_CONTAINERS } from '../services/solidPod';
import { PackingList } from '../create-packing-list/types';

export interface PackingListSyncOptions {
  packingListId: string | null; // The ID of the packing list to sync
  pollInterval?: number; // in milliseconds, null to disable polling
  onSyncSuccess?: (data: PackingList) => void;
  onSyncError?: (error: string) => void;
  onSaveSuccess?: () => void;
  onSaveError?: (error: string) => void;
  enabled?: boolean; // whether sync is enabled
}

export interface PackingListSyncState {
  lastSync: Date | null;
  isSyncing: boolean;
  error: string | null;
  saveToPod: (data: PackingList) => Promise<boolean>;
  syncFromPod: () => Promise<void>;
}

/**
 * Hook for automatic synchronization of packing lists with Solid Pod
 * Polls the pod at regular intervals and provides manual sync functions
 */
export function usePackingListSync(options: PackingListSyncOptions): PackingListSyncState {
  const {
    packingListId,
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
    if (!enabled || !isLoggedIn || !packingListId || isSyncingRef.current) {
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

      const fileUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}${packingListId}.json`;

      const data = await loadFileFromPod<PackingList>({
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
  }, [enabled, isLoggedIn, packingListId, session, onSyncSuccess, onSyncError]);

  /**
   * Save data to the Pod
   */
  const saveToPod = useCallback(async (data: PackingList): Promise<boolean> => {
    if (!enabled || !isLoggedIn || !packingListId) {
      return false;
    }

    setError(null);

    try {
      const podUrl = await getPrimaryPodUrl(session);

      if (!podUrl) {
        throw new Error('No pod URL found');
      }

      const containerUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`;

      await saveFileToPod({
        session: session!,
        containerPath: containerUrl,
        filename: `${packingListId}.json`,
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
  }, [enabled, isLoggedIn, packingListId, session, onSaveSuccess, onSaveError]);

  /**
   * Set up polling interval
   */
  useEffect(() => {
    if (!enabled || !isLoggedIn || !pollInterval || !packingListId) {
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
  }, [enabled, isLoggedIn, pollInterval, packingListId, syncFromPod]);

  return {
    lastSync,
    isSyncing,
    error,
    saveToPod,
    syncFromPod,
  };
}
