import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSolidPod } from '../components/SolidPodContext';
import { getPrimaryPodUrl, loadFileFromPod, saveFileToPod, AuthenticationError } from '../services/solidPod';

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
   * Polling interval in milliseconds (null to disable polling)
   */
  pollInterval?: number;

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

  // Create a stable key for pathConfig to use in useEffect dependencies
  // This prevents the interval from restarting when pathConfig object reference changes
  const pathConfigKey = useMemo(() => {
    const { container, filename, resourceId } = pathConfig;
    const filenameKey = typeof filename === 'function' ? 'function' : filename;
    return `${container}:${filenameKey}:${resourceId || ''}`;
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

      const data = await loadFileFromPod<T>({
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
        // Authentication errors use their own message
        const errorMessage = err instanceof AuthenticationError
          ? err.message
          : (err.message || 'Failed to sync from Pod');
        setError(errorMessage);

        if (onSyncError) {
          onSyncError(errorMessage);
        }
      }
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [enabled, isLoggedIn, session, getFileUrl, onSyncSuccess, onSyncError]);

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

      const { container, filename, resourceId } = pathConfig;
      const containerUrl = `${podUrl}${container}`;

      // Resolve the filename
      const resolvedFilename = typeof filename === 'function'
        ? (resourceId ? filename(resourceId) : null)
        : (filename.includes('/') ? filename.split('/').pop() : filename);

      if (!resolvedFilename) {
        throw new Error('Cannot save: missing resource ID');
      }

      await saveFileToPod({
        session: session!,
        containerPath: containerUrl,
        filename: resolvedFilename,
        data,
      });

      setLastSync(new Date());

      if (onSaveSuccess) {
        onSaveSuccess();
      }

      return true;
    } catch (err: any) {
      // Authentication errors use their own message
      const errorMessage = err instanceof AuthenticationError
        ? err.message
        : (err.message || 'Failed to save to Pod');
      setError(errorMessage);

      if (onSaveError) {
        onSaveError(errorMessage);
      }

      return false;
    }
  }, [enabled, isLoggedIn, session, pathConfig, onSaveSuccess, onSaveError]);

  /**
   * Set up polling interval
   */
  useEffect(() => {
    if (!enabled || !isLoggedIn || !pollInterval) {
      return;
    }

    // Check if we have required config for syncing
    const { filename, resourceId } = pathConfig;
    if (typeof filename === 'function' && !resourceId) {
      // Can't sync without resourceId
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
    // Note: syncFromPod is intentionally omitted from deps to prevent interval churn
    // pathConfigKey is a stable string representation of pathConfig to avoid object reference issues
    // The interval only needs to restart when the actual config values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isLoggedIn, pollInterval, pathConfigKey]);

  return {
    lastSync,
    isSyncing,
    error,
    saveToPod,
    syncFromPod,
  };
}
