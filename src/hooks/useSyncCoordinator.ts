import { useState, useCallback, useRef } from 'react';

/**
 * Data with timestamp for conflict resolution
 */
export interface TimestampedData {
  lastModified?: string;
  _rev?: string;
}

/**
 * Conflict resolution strategy
 */
export type ConflictStrategy =
  | 'fallback-to-pod'  // Pod wins if local has no timestamp OR Pod is newer (handles fresh loads)
  | 'strict-newer';     // Pod wins only if explicitly newer

/**
 * Options for sync coordinator
 */
export interface SyncCoordinatorOptions<T extends TimestampedData> {
  /**
   * Current local data
   */
  currentData: T | null;

  /**
   * Function to save data to local database
   * Returns the new revision ID
   */
  saveToLocalDb: (data: T) => Promise<{ rev: string }>;

  /**
   * Function to update form state and local state with synced data
   */
  updateFormAndState: (data: T, rev: string) => void;

  /**
   * Conflict resolution strategy
   * - 'fallback-to-pod': Use for edit forms (handles fresh loads gracefully)
   * - 'strict-newer': Use for view pages (only apply if Pod is definitively newer)
   */
  conflictStrategy?: ConflictStrategy;

  /**
   * Duration to prevent sync after local changes (milliseconds)
   */
  syncPreventionWindow?: number;

  /**
   * Duration to show sync indicator (milliseconds)
   */
  syncIndicatorDuration?: number;
}

/**
 * State returned by sync coordinator
 */
export interface SyncCoordinatorState<T extends TimestampedData> {
  /**
   * Whether currently syncing from Pod (for UI indicator)
   */
  syncingFromPod: boolean;

  /**
   * Callback to handle successful sync from Pod
   */
  handleSyncSuccess: (data: T) => Promise<void>;

  /**
   * Callback to handle sync errors
   */
  handleSyncError: (error: string) => void;

  /**
   * Save data locally and to Pod with sync loop prevention
   * Returns the updated data with new revision
   */
  saveWithSyncPrevention: (
    data: T,
    saveToPod: (data: T) => Promise<boolean>
  ) => Promise<T | null>;
}

/**
 * Hook to coordinate bidirectional sync between local state, local DB, and Pod
 *
 * Handles:
 * - Conflict resolution using timestamps
 * - Sync loop prevention
 * - Focus preservation during updates
 * - UI feedback
 *
 * @example
 * const { syncingFromPod, handleSyncSuccess, saveWithSyncPrevention } = useSyncCoordinator({
 *   currentData: packingList,
 *   saveToLocalDb: async (data) => packingAppDb.savePackingList(data),
 *   updateFormAndState: (data, rev) => {
 *     setPackingList({ ...data, _rev: rev });
 *     reset(data);
 *   },
 *   conflictStrategy: 'fallback-to-pod'
 * });
 */
export function useSyncCoordinator<T extends TimestampedData>(
  options: SyncCoordinatorOptions<T>
): SyncCoordinatorState<T> {
  const {
    currentData,
    saveToLocalDb,
    updateFormAndState,
    conflictStrategy = 'fallback-to-pod',
    syncPreventionWindow = 2000,
    syncIndicatorDuration = 2000,
  } = options;

  const [syncingFromPod, setSyncingFromPod] = useState(false);

  // Track if we're currently handling a local change to prevent sync loops
  const isLocalChangeRef = useRef(false);

  // Track the last synced data to detect actual changes
  const lastSyncedDataRef = useRef<string | null>(null);

  /**
   * Preserve focus and selection during updates
   */
  const preserveFocusAndSelection = useCallback((callback: () => void) => {
    // Save the currently focused element
    const activeElement = document.activeElement as HTMLElement;
    const activeElementId = activeElement?.id;
    const selectionStart = (activeElement as HTMLInputElement)?.selectionStart;
    const selectionEnd = (activeElement as HTMLInputElement)?.selectionEnd;

    // Execute the callback
    callback();

    // Restore focus after a brief delay to allow the DOM to update
    setTimeout(() => {
      if (activeElementId) {
        const elementToFocus = document.getElementById(activeElementId) as HTMLInputElement;
        if (elementToFocus) {
          elementToFocus.focus();
          if (selectionStart !== null && selectionEnd !== null) {
            elementToFocus.setSelectionRange(selectionStart, selectionEnd);
          }
        }
      }
    }, 0);
  }, []);

  /**
   * Determine if Pod data should be applied based on timestamps
   */
  const shouldApplyPodData = useCallback(
    (podData: T): boolean => {
      const podTime = podData.lastModified ? new Date(podData.lastModified).getTime() : 0;
      const localTime = currentData?.lastModified
        ? new Date(currentData.lastModified).getTime()
        : 0;

      if (conflictStrategy === 'fallback-to-pod') {
        // Pod wins if local has no timestamp OR Pod is newer
        return !currentData?.lastModified || podTime > localTime;
      } else {
        // Strict: Pod wins only if explicitly newer
        return podTime > localTime;
      }
    },
    [currentData, conflictStrategy]
  );

  /**
   * Handle successful sync from Pod
   */
  const handleSyncSuccess = useCallback(
    async (data: T) => {
      // Only update if this isn't a local change we just made
      if (isLocalChangeRef.current) {
        return;
      }

      // Compare the incoming data with what we last synced
      const incomingDataString = JSON.stringify(data);

      // Check if data actually changed
      if (lastSyncedDataRef.current === incomingDataString) {
        console.log('Synced data from Pod - no changes detected');
        return;
      }

      // Check if we should apply the synced data
      if (!shouldApplyPodData(data)) {
        console.log('Synced data from Pod - local version is newer or same, keeping local', {
          localTime: currentData?.lastModified,
          podTime: data.lastModified,
        });
        return;
      }

      console.log('Synced data from Pod - newer version found, updating form');
      setSyncingFromPod(true);

      try {
        // Remove _rev to avoid conflicts with local database version
        const dataWithoutRev = { ...data };
        delete dataWithoutRev._rev;

        // Save to local database to get the proper _rev
        const dbResult = await saveToLocalDb(dataWithoutRev as T);

        // Update form and state with synced data
        preserveFocusAndSelection(() => {
          updateFormAndState(dataWithoutRev as T, dbResult.rev);
        });

        lastSyncedDataRef.current = incomingDataString;

        // Show sync indicator briefly
        setTimeout(() => setSyncingFromPod(false), syncIndicatorDuration);
      } catch (err) {
        console.error('Error saving synced data to local database:', err);
        setSyncingFromPod(false);
      }
    },
    [
      currentData,
      saveToLocalDb,
      updateFormAndState,
      shouldApplyPodData,
      preserveFocusAndSelection,
      syncIndicatorDuration,
    ]
  );

  /**
   * Handle sync errors (silent by default to avoid noise)
   */
  const handleSyncError = useCallback((error: string) => {
    console.error('Sync error:', error);
    // Don't show toast for errors - too noisy for automatic sync
  }, []);

  /**
   * Save data locally and to Pod with sync loop prevention
   */
  const saveWithSyncPrevention = useCallback(
    async (data: T, saveToPod: (data: T) => Promise<boolean>): Promise<T | null> => {
      try {
        // Add timestamp for conflict resolution
        const dataWithTimestamp = {
          ...data,
          lastModified: new Date().toISOString(),
        } as T;

        // Save to local database first (guaranteed)
        const dbResult = await saveToLocalDb(dataWithTimestamp);

        // Update with new revision
        const savedData = {
          ...dataWithTimestamp,
          _rev: dbResult.rev,
        } as T;

        // Save to Pod (best effort)
        isLocalChangeRef.current = true;
        await saveToPod(savedData);

        // Update the last synced data ref
        lastSyncedDataRef.current = JSON.stringify(savedData);

        // Reset the flag after the sync prevention window
        setTimeout(() => {
          isLocalChangeRef.current = false;
        }, syncPreventionWindow);

        return savedData;
      } catch (err) {
        console.error('Error in saveWithSyncPrevention:', err);
        return null;
      }
    },
    [saveToLocalDb, syncPreventionWindow]
  );

  return {
    syncingFromPod,
    handleSyncSuccess,
    handleSyncError,
    saveWithSyncPrevention,
  };
}
