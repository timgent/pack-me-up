import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { SolidDataset } from '@inrupt/solid-client';
import { useSolidPod } from '../components/SolidPodContext';
import { getPrimaryPodUrl, loadRdfFromPod, saveRdfToPod, AuthenticationError } from '../services/solidPod';

/**
 * Configuration for Pod file paths
 */
export interface PodPathConfig {
  /**
   * Container path within the Pod (e.g., 'pack-me-up/packing-lists/')
   */
  container: string;

  /**
   * Filename or function to generate filename
   * - string: static filename (e.g., 'packing-list-questions.json')
   * - function: dynamic filename based on resource ID (e.g., (id) => `${id}.json`)
   */
  filename: string | ((resourceId: string) => string);

  /**
   * Optional resource ID (required when filename is a function)
   */
  resourceId?: string | null;
}

export interface PodSyncOptions<T> {
  /**
   * Configuration for Pod file path
   */
  pathConfig: PodPathConfig;

  /**
   * RDF serialization/deserialization functions
   */
  rdf: {
    serialize: (data: T, datasetUrl: string) => SolidDataset;
    deserialize: (dataset: SolidDataset, url: string) => T;
  };

  /**
   * Polling interval in milliseconds (null/undefined to disable polling)
   */
  pollInterval?: number;

  /**
   * Sync once on mount even when pollInterval is not set.
   * Default: false (no breaking change for existing callers that rely on pollInterval).
   */
  syncOnMount?: boolean;

  /**
   * Callback when sync from Pod succeeds
   */
  onSyncSuccess?: (data: T) => void;

  /**
   * Callback when sync from Pod fails
   */
  onSyncError?: (error: string) => void;

  /**
   * Callback when save to Pod succeeds
   */
  onSaveSuccess?: () => void;

  /**
   * Callback when save to Pod fails
   */
  onSaveError?: (error: string) => void;

  /**
   * Whether sync is enabled
   */
  enabled?: boolean;
}

export interface PodSyncState<T> {
  lastSync: Date | null;
  isSyncing: boolean;
  error: string | null;
  saveToPod: (data: T) => Promise<boolean>;
  syncFromPod: () => Promise<void>;
}

/**
 * Generic hook for automatic synchronization with Solid Pod
 * Polls the pod at regular intervals and provides manual sync functions
 *
 * @example
 * // For questions (static path)
 * usePodSync<PackingListQuestionSet>({
 *   pathConfig: {
 *     container: POD_CONTAINERS.ROOT,
 *     filename: 'packing-list-questions.json'
 *   },
 *   onSyncSuccess: (data) => console.log(data)
 * })
 *
 * @example
 * // For packing lists (dynamic path based on ID)
 * usePodSync<PackingList>({
 *   pathConfig: {
 *     container: POD_CONTAINERS.PACKING_LISTS,
 *     filename: (id) => `${id}.json`,
 *     resourceId: packingListId
 *   },
 *   onSyncSuccess: (data) => console.log(data)
 * })
 */
export function usePodSync<T>(options: PodSyncOptions<T>): PodSyncState<T> {
  const {
    pathConfig,
    rdf,
    pollInterval,
    syncOnMount = false,
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

  // Refs for callbacks so syncFromPod/saveToPod always call the latest version,
  // even when captured by a stale closure in the polling useEffect.
  const onSyncSuccessRef = useRef(onSyncSuccess);
  onSyncSuccessRef.current = onSyncSuccess;
  const onSyncErrorRef = useRef(onSyncError);
  onSyncErrorRef.current = onSyncError;
  const onSaveSuccessRef = useRef(onSaveSuccess);
  onSaveSuccessRef.current = onSaveSuccess;
  const onSaveErrorRef = useRef(onSaveError);
  onSaveErrorRef.current = onSaveError;

  // Create a stable key for pathConfig to use in useEffect dependencies
  // This prevents the interval from restarting when pathConfig object reference changes
  const pathConfigKey = useMemo(() => {
    const { container, filename, resourceId } = pathConfig;
    const filenameKey = typeof filename === 'function' ? 'function' : filename;
    return `${container}:${filenameKey}:${resourceId || ''}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathConfig.container, pathConfig.filename, pathConfig.resourceId]);

  /**
   * Resolve the full file URL from the path configuration
   */
  const getFileUrl = useCallback((podUrl: string): string | null => {
    const { container, filename, resourceId } = pathConfig;

    // If filename is a function, we need a resourceId
    if (typeof filename === 'function') {
      if (!resourceId) {
        return null;
      }
      return `${podUrl}${container}${filename(resourceId)}`;
    }

    // Static filename - could be full path or just filename
    // Handle both cases: 'pack-me-up/file.json' or just 'file.json'
    if (filename.includes('/')) {
      // Full path provided
      return `${podUrl}${filename}`;
    } else {
      // Just filename, append to container
      return `${podUrl}${container}${filename}`;
    }
  }, [pathConfig]);

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

      const fileUrl = getFileUrl(podUrl);

      if (!fileUrl) {
        // Missing required resourceId - silently skip
        return;
      }

      const data = await loadRdfFromPod<T>(session!, fileUrl, rdf.deserialize);

      setLastSync(new Date());

      if (onSyncSuccessRef.current) {
        onSyncSuccessRef.current(data);
      }
    } catch (err: unknown) {
      // 404 errors are expected when file doesn't exist yet - not a real error
      const statusCode = typeof err === 'object' && err !== null ? (err as { statusCode?: number }).statusCode : undefined
      if (statusCode !== 404) {
        // Authentication errors use their own message
        const errorMessage = err instanceof AuthenticationError
          ? err.message
          : (err instanceof Error ? err.message : 'Failed to sync from Pod');
        setError(errorMessage);

        if (onSyncErrorRef.current) {
          onSyncErrorRef.current(errorMessage);
        }
      }
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [enabled, isLoggedIn, session, getFileUrl, rdf]);

  /**
   * Save data to the Pod
   */
  const saveToPod = useCallback(async (data: T): Promise<boolean> => {
    if (!enabled || !isLoggedIn) {
      return false;
    }

    setError(null);

    try {
      const podUrl = await getPrimaryPodUrl(session);

      if (!podUrl) {
        throw new Error('No pod URL found');
      }

      const fileUrl = getFileUrl(podUrl);

      if (!fileUrl) {
        throw new Error('Cannot save: missing resource ID');
      }

      await saveRdfToPod({
        session: session!,
        fileUrl,
        data,
        serializer: rdf.serialize,
      });

      setLastSync(new Date());

      if (onSaveSuccessRef.current) {
        onSaveSuccessRef.current();
      }

      return true;
    } catch (err: unknown) {
      // Authentication errors use their own message
      const errorMessage = err instanceof AuthenticationError
        ? err.message
        : (err instanceof Error ? err.message : 'Failed to save to Pod');
      setError(errorMessage);

      if (onSaveErrorRef.current) {
        onSaveErrorRef.current(errorMessage);
      }

      return false;
    }
  }, [enabled, isLoggedIn, session, getFileUrl, rdf]);

  /**
   * Sync on mount (and/or) set up polling interval.
   *
   * - syncOnMount: true  → performs one sync immediately on mount (no polling)
   * - pollInterval: N    → performs one sync immediately on mount AND polls every N ms
   * - both false/unset   → no automatic sync
   *
   * Existing callers that pass pollInterval retain their original behaviour.
   */
  useEffect(() => {
    if (!enabled || !isLoggedIn) {
      return;
    }

    // Check if we have required config for syncing
    const { filename, resourceId } = pathConfig;
    if (typeof filename === 'function' && !resourceId) {
      // Can't sync without resourceId
      return;
    }

    // Do an initial sync when syncOnMount is true OR polling is configured
    if (syncOnMount || pollInterval) {
      syncFromPod();
    }

    if (!pollInterval) {
      return;
    }

    // Set up the polling interval
    const interval = setInterval(() => {
      syncFromPod();
    }, pollInterval);

    return () => {
      clearInterval(interval);
    };
    // Note: syncFromPod is intentionally omitted from deps to prevent interval churn
    // pathConfigKey is a stable string representation of pathConfig to avoid object reference issues
    // The interval only needs to restart when the actual config values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isLoggedIn, syncOnMount, pollInterval, pathConfigKey]);

  return {
    lastSync,
    isSyncing,
    error,
    saveToPod,
    syncFromPod,
  };
}
