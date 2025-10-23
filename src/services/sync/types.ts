/**
 * Sync metadata for distributed version tracking
 */
export interface SyncMetadata {
    /** Version number incremented on each change */
    version: number;

    /** Last sync timestamp */
    lastSyncedAt: string | null;

    /** Device identifier */
    deviceId: string;

    /** Checksum for quick change detection */
    checksum: string;

    /** Tombstone for deletions */
    deleted?: boolean;
    deletedAt?: string;
}

/**
 * Document with sync capabilities
 */
export interface SyncableDocument {
    _id: string;
    _rev?: string;
    createdAt: string;
    updatedAt: string;
    syncMetadata: SyncMetadata;
}

/**
 * Sync status for a data type
 */
export interface DataTypeSyncStatus {
    status: 'idle' | 'syncing' | 'conflict' | 'error';
    lastSyncedAt: string | null;
    pendingChanges: boolean;
}

/**
 * Conflict information
 */
export interface ConflictInfo {
    documentId: string;
    documentType: 'question-set' | 'packing-list';
    localVersion: any;
    remoteVersion: any;
    detectedAt: string;
    resolved: boolean;
}

/**
 * Overall sync state
 */
export interface SyncState {
    questionSet: DataTypeSyncStatus;
    packingLists: DataTypeSyncStatus & {
        conflicts: ConflictInfo[];
    };

    /** Network connectivity */
    online: boolean;

    /** Pod connection status */
    podConnected: boolean;

    /** Sync configuration */
    autoSyncEnabled: boolean;
    syncInterval: number; // milliseconds
}

/**
 * Sync result
 */
export interface SyncResult {
    success: boolean;
    synced: number;
    conflicts: number;
    errors: string[];
}

/**
 * Conflict resolution strategies
 */
export type ConflictStrategy =
    | 'prompt'
    | 'last-write-wins'
    | 'keep-local'
    | 'keep-remote'
    | 'merge';

/**
 * Sync options
 */
export interface SyncOptions {
    autoSyncEnabled: boolean;
    syncInterval: number;
    conflictStrategy: ConflictStrategy;
    enableBackups: boolean;
}

/**
 * Sync settings stored in localStorage
 */
export interface SyncSettings {
    autoSyncEnabled: boolean;
    syncInterval: number; // minutes
    defaultConflictResolution: ConflictStrategy;
    alwaysPromptOnConflict: boolean;
    enableBackgroundSync: boolean;
    maxRetries: number;
    showSyncNotifications: boolean;
    notifyOnConflicts: boolean;
}

/**
 * Default sync settings
 */
export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
    autoSyncEnabled: false, // Opt-in for initial release
    syncInterval: 5, // minutes
    defaultConflictResolution: 'prompt',
    alwaysPromptOnConflict: true,
    enableBackgroundSync: true,
    maxRetries: 3,
    showSyncNotifications: true,
    notifyOnConflicts: true,
};
