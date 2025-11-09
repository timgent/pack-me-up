import { useState, useCallback, useRef } from 'react';
import { backupService } from '../services/backup';

/**
 * Data with timestamp for conflict resolution
 */
export interface TimestampedData {
  lastModified?: string;
  _rev?: string;
}

/**
 * Conflict information passed to conflict callback
 */
export interface ConflictInfo<T> {
  localData: T | null;
  podData: T;
  localTimestamp?: string;
  podTimestamp?: string;
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

  /**
   * Callback when a conflict is detected
   * Should return a promise that resolves with the conflict resolution
   */
  onConflictDetected?: (conflictInfo: ConflictInfo<T>) => Promise<'keep-local' | 'use-pod'>;

  /**
   * Document type for backup purposes
   */
  docType?: 'question-set' | 'packing-list';

  /**
   * Document ID for backup purposes
   */
  docId?: string;

  /**
   * Whether this is the first sync after login (for conflict detection)
   */
  isFirstSync?: boolean;
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
    onConflictDetected,
    docType,
    docId,
    isFirstSync = false,
  } = options;

  const [syncingFromPod, setSyncingFromPod] = useState(false);

  // Track if we're currently handling a local change to prevent sync loops
  const isLocalChangeRef = useRef(false);

  // Track the last synced data to detect actual changes
  const lastSyncedDataRef = useRef<string | null>(null);

  // Track if we've already handled the first sync conflict
  const hasHandledFirstSyncConflictRef = useRef(false);

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
   * Detect if there's a conflict between local and pod data
   */
  const detectConflict = useCallback(
    (podData: T): boolean => {
      // No conflict if no local data exists
      if (!currentData || !currentData.lastModified) {
        return false;
      }

      // No conflict if pod data has no timestamp
      if (!podData.lastModified) {
        return false;
      }

      // Check if timestamps differ (indicating different versions)
      const podTime = new Date(podData.lastModified).getTime();
      const localTime = new Date(currentData.lastModified).getTime();

      // Conflict exists if timestamps differ
      return podTime !== localTime;
    },
    [currentData]
  );

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
        console.log('Synced data from Pod - skipping because local change is in progress');
        return;
      }

      // Detect conflicts on first sync after login
      if (isFirstSync && !hasHandledFirstSyncConflictRef.current && onConflictDetected) {
        const hasConflict = detectConflict(data);

        if (hasConflict) {
          console.log('Conflict detected on first sync - prompting user', {
            localTime: currentData?.lastModified,
            podTime: data.lastModified,
          });

          hasHandledFirstSyncConflictRef.current = true;

          try {
            const conflictInfo: ConflictInfo<T> = {
              localData: currentData,
              podData: data,
              localTimestamp: currentData?.lastModified,
              podTimestamp: data.lastModified,
            };

            const resolution = await onConflictDetected(conflictInfo);

            if (resolution === 'keep-local') {
              console.log('User chose to keep local data');
              // Don't apply pod data, local data wins
              return;
            } else {
              console.log('User chose to use pod data');
              // Continue with applying pod data below
            }
          } catch (err) {
            console.error('Error handling conflict:', err);
            return;
          }
        } else {
          hasHandledFirstSyncConflictRef.current = true;
        }
      }

      // Check if we should apply the synced data based on timestamps
      if (!shouldApplyPodData(data)) {
        console.log('Synced data from Pod - local version is newer or same, keeping local', {
          localTime: currentData?.lastModified,
          podTime: data.lastModified,
        });
        return;
      }

      // Compare the incoming data with what we last synced (to avoid unnecessary re-renders)
      const incomingDataString = JSON.stringify(data);
      if (lastSyncedDataRef.current === incomingDataString) {
        console.log('Synced data from Pod - timestamps indicate update, but data is identical (skipping re-render)');
        return;
      }

      console.log('Synced data from Pod - applying update', {
        hasTimestamp: !!data.lastModified,
        timestamp: data.lastModified,
      });
      setSyncingFromPod(true);

      try {
        // Create backup before overwriting if we have backup info
        if (currentData && docType && docId) {
          console.log('Creating backup before overwriting with pod data');
          await backupService.createBackup(
            docId,
            docType,
            currentData,
            'pod-sync-overwrite'
          );
        }

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
      isFirstSync,
      onConflictDetected,
      detectConflict,
      docType,
      docId,
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
