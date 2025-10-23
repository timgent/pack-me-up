# Solid Pod Sync Design

## Overview

This document proposes a comprehensive sync architecture for keeping Solid Pod storage and local browser storage (PouchDB) seamlessly synchronized across multiple devices.

## Current State

### Architecture
- **Local Storage**: PouchDB with offline-first approach
- **Cloud Storage**: Solid Pod with manual sync buttons
- **Data Types**:
  - Question Set (single document)
  - Packing Lists (multiple documents)
- **Current Sync**: Manual, last-write-wins, no conflict resolution

### Key Files
- `src/services/database.ts` - PouchDB operations
- `src/services/solidPod.ts` - Solid Pod operations
- `src/components/SolidPodContext.tsx` - Authentication

---

## Design Goals

1. **Seamless Sync**: Automatic bidirectional sync between devices
2. **Conflict Resolution**: Handle concurrent edits gracefully
3. **Offline-First**: Local operations work without connectivity
4. **Data Safety**: Prevent inadvertent data loss
5. **Performance**: Efficient sync with minimal bandwidth
6. **User Control**: Clear visibility and control over sync operations

---

## Sync Architecture

### Core Concepts

#### 1. Version Tracking

Add metadata to all documents:

```typescript
export interface SyncMetadata {
    // Vector clock for distributed versioning
    version: number;

    // Last sync timestamp
    lastSyncedAt: string;

    // Device identifier
    deviceId: string;

    // Checksum for quick change detection
    checksum: string;

    // Tombstone for deletions
    deleted?: boolean;
    deletedAt?: string;
}

export interface SyncableDocument extends BaseDocument {
    syncMetadata: SyncMetadata;
}
```

#### 2. Sync State Management

```typescript
export interface SyncState {
    // Current sync status per data type
    questionSet: {
        status: 'idle' | 'syncing' | 'conflict' | 'error';
        lastSyncedAt: string | null;
        pendingChanges: boolean;
    };
    packingLists: {
        status: 'idle' | 'syncing' | 'conflict' | 'error';
        lastSyncedAt: string | null;
        pendingChanges: boolean;
        conflicts: ConflictInfo[];
    };

    // Connection status
    online: boolean;
    podConnected: boolean;

    // Sync configuration
    autoSyncEnabled: boolean;
    syncInterval: number; // milliseconds
}

export interface ConflictInfo {
    documentId: string;
    localVersion: any;
    remoteVersion: any;
    detectedAt: string;
    resolved: boolean;
}
```

---

## Sync Strategies

### Strategy 1: Timestamp-Based Sync (Recommended Initial Implementation)

**Pros**: Simple, easy to understand, works well for single-user multi-device scenarios
**Cons**: Doesn't handle true concurrent edits, relies on clock synchronization

#### Algorithm

1. **On Document Save (Local)**:
   ```typescript
   async function saveLocal(doc: SyncableDocument) {
       doc.updatedAt = new Date().toISOString();
       doc.syncMetadata = {
           ...doc.syncMetadata,
           version: (doc.syncMetadata?.version || 0) + 1,
           deviceId: getDeviceId(),
           checksum: calculateChecksum(doc),
       };

       await db.save(doc);

       // Queue for sync if online
       if (isOnline && autoSyncEnabled) {
           queueSync(doc);
       }
   }
   ```

2. **On Login**:
   ```typescript
   async function syncOnLogin() {
       const podData = await loadAllFromPod();
       const localData = await loadAllFromLocal();

       for (const docId in podData) {
           const podDoc = podData[docId];
           const localDoc = localData[docId];

           if (!localDoc) {
               // New document from Pod
               await saveLocal(podDoc);
           } else if (new Date(podDoc.updatedAt) > new Date(localDoc.updatedAt)) {
               // Pod is newer
               await resolveConflict(localDoc, podDoc, 'pod-newer');
           } else if (new Date(localDoc.updatedAt) > new Date(podDoc.updatedAt)) {
               // Local is newer
               await saveToPod(localDoc);
           }
           // else: same timestamp, no action needed
       }

       // Handle local-only documents
       for (const docId in localData) {
           if (!podData[docId] && !localData[docId].syncMetadata?.deleted) {
               await saveToPod(localData[docId]);
           }
       }
   }
   ```

3. **Periodic Sync**:
   ```typescript
   async function periodicSync() {
       if (!isOnline || !podConnected || !autoSyncEnabled) return;

       // Check Pod for changes
       const podChanges = await fetchPodChangesSince(lastSyncedAt);

       for (const change of podChanges) {
           const localDoc = await db.get(change.id);

           if (!localDoc || new Date(change.updatedAt) > new Date(localDoc.updatedAt)) {
               // Pod has newer version
               if (localDoc && hasUnsynced LocalChanges(localDoc)) {
                   // Conflict detected
                   await handleConflict(localDoc, change);
               } else {
                   await saveLocal(change);
               }
           }
       }

       // Push local changes
       const localChanges = await getUnsyncedLocalChanges();
       for (const change of localChanges) {
           await saveToPod(change);
       }
   }
   ```

#### Conflict Detection

```typescript
function hasUnsyncedLocalChanges(doc: SyncableDocument): boolean {
    // Check if local document was modified since last sync
    return doc.syncMetadata?.lastSyncedAt
        ? new Date(doc.updatedAt) > new Date(doc.syncMetadata.lastSyncedAt)
        : true;
}
```

---

### Strategy 2: Vector Clock-Based Sync (Advanced)

**Pros**: True distributed conflict detection, handles concurrent edits properly
**Cons**: More complex, requires more storage

#### Data Structure

```typescript
export interface VectorClock {
    [deviceId: string]: number;
}

export interface VectorClockDocument extends BaseDocument {
    vectorClock: VectorClock;
    syncMetadata: SyncMetadata;
}
```

#### Algorithm

```typescript
function compareVectorClocks(a: VectorClock, b: VectorClock): 'before' | 'after' | 'concurrent' {
    let aBefore = false;
    let aAfter = false;

    const allDevices = new Set([...Object.keys(a), ...Object.keys(b)]);

    for (const device of allDevices) {
        const aVersion = a[device] || 0;
        const bVersion = b[device] || 0;

        if (aVersion < bVersion) aBefore = true;
        if (aVersion > bVersion) aAfter = true;
    }

    if (aBefore && !aAfter) return 'before';
    if (aAfter && !aBefore) return 'after';
    return 'concurrent';
}

async function syncWithVectorClock(localDoc: VectorClockDocument, podDoc: VectorClockDocument) {
    const comparison = compareVectorClocks(localDoc.vectorClock, podDoc.vectorClock);

    switch (comparison) {
        case 'before':
            // Pod is newer, apply it
            await saveLocal(podDoc);
            break;

        case 'after':
            // Local is newer, push it
            await saveToPod(localDoc);
            break;

        case 'concurrent':
            // True conflict, needs resolution
            await handleConflict(localDoc, podDoc);
            break;
    }
}
```

---

## Conflict Resolution

### User-Facing Conflict UI

When conflicts are detected, present a clear UI:

```typescript
export interface ConflictResolutionOption {
    type: 'keep-local' | 'keep-remote' | 'manual-merge' | 'keep-both';
    label: string;
    description: string;
}

export interface ConflictResolutionUI {
    documentType: 'question-set' | 'packing-list';
    documentId: string;
    documentName: string;

    localVersion: {
        updatedAt: string;
        deviceId: string;
        preview: any;
    };

    remoteVersion: {
        updatedAt: string;
        deviceId: string;
        preview: any;
    };

    options: ConflictResolutionOption[];
}
```

### Conflict Resolution Strategies

#### 1. Last-Write-Wins (Default)
```typescript
async function resolveLastWriteWins(local: SyncableDocument, remote: SyncableDocument) {
    const winner = new Date(local.updatedAt) > new Date(remote.updatedAt) ? local : remote;
    await saveLocal(winner);
    await saveToPod(winner);
}
```

#### 2. Field-Level Merge (For Question Sets)
```typescript
async function mergeQuestionSets(local: PackingListQuestionSet, remote: PackingListQuestionSet) {
    const merged: PackingListQuestionSet = {
        ...local,

        // Merge people by ID
        people: mergePeople(local.people, remote.people),

        // Merge always needed items
        alwaysNeededItems: mergeItems(local.alwaysNeededItems, remote.alwaysNeededItems),

        // Merge questions by ID
        questions: mergeQuestions(local.questions, remote.questions),
    };

    return merged;
}

function mergePeople(localPeople: Person[], remotePeople: Person[]): Person[] {
    const peopleMap = new Map<string, Person>();

    for (const person of [...localPeople, ...remotePeople]) {
        peopleMap.set(person.id, person); // Remote overwrites local if duplicate
    }

    return Array.from(peopleMap.values());
}
```

#### 3. List-Level Merge (For Packing Lists)
```typescript
async function mergePackingLists(local: PackingList, remote: PackingList) {
    const merged: PackingList = {
        ...local,
        name: remote.name, // Prefer remote name

        // Merge items by ID, combine packed status
        items: mergePackingListItems(local.items, remote.items),
    };

    return merged;
}

function mergePackingListItems(localItems: PackingListItem[], remoteItems: PackingListItem[]): PackingListItem[] {
    const itemsMap = new Map<string, PackingListItem>();

    for (const item of localItems) {
        itemsMap.set(item.id, item);
    }

    for (const item of remoteItems) {
        const existing = itemsMap.get(item.id);
        if (existing) {
            // If either version is packed, consider it packed
            itemsMap.set(item.id, {
                ...item,
                packed: existing.packed || item.packed,
            });
        } else {
            itemsMap.set(item.id, item);
        }
    }

    return Array.from(itemsMap.values());
}
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Goal**: Add sync infrastructure without changing user experience

1. **Add Sync Metadata**
   - Extend document interfaces with `SyncMetadata`
   - Create migration to add metadata to existing documents
   - Generate device IDs

2. **Create Sync Service**
   ```typescript
   // src/services/sync.ts
   export class SyncService {
       private db: PackingAppDatabase;
       private syncState: SyncState;
       private syncQueue: SyncQueue;

       async initialize();
       async syncOnLogin();
       async syncPeriodic();
       async syncDocument(docId: string);
       async resolveConflict(conflict: ConflictInfo);
   }
   ```

3. **Add Sync State Context**
   ```typescript
   // src/components/SyncContext.tsx
   export const SyncProvider: React.FC<{ children: React.ReactNode }>;
   export const useSyncState: () => SyncState;
   export const useSyncActions: () => SyncActions;
   ```

4. **Testing**
   - Unit tests for sync algorithms
   - Mock Pod service for testing
   - Test conflict detection

### Phase 2: Login Sync (Week 3)

**Goal**: Automatically sync when user logs in

1. **Implement Login Sync**
   - Add sync trigger to `SolidPodContext` on login
   - Show sync progress indicator
   - Handle conflicts with user prompts

2. **UI Components**
   - Sync status indicator in navigation
   - Simple conflict resolution modal
   - Toast notifications for sync events

3. **Testing**
   - Test with stale local data
   - Test with stale Pod data
   - Test with conflicts

### Phase 3: Automatic Sync (Week 4-5)

**Goal**: Enable background periodic sync

1. **Implement Periodic Sync**
   - Add configurable sync interval (default: 5 minutes)
   - Implement efficient change detection
   - Queue local changes for upload

2. **Auto-Sync on Save**
   - Debounced sync after local saves
   - Optimistic UI updates
   - Background upload queue

3. **Offline Support**
   - Detect online/offline status
   - Queue changes when offline
   - Sync when connection restored

4. **Settings UI**
   - Enable/disable auto-sync
   - Configure sync interval
   - Manual sync trigger

### Phase 4: Advanced Conflict Resolution (Week 6)

**Goal**: Smart conflict resolution for better UX

1. **Field-Level Merge**
   - Implement merge strategies for Question Sets
   - Implement merge strategies for Packing Lists
   - Add "keep both" option for lists

2. **Conflict UI**
   - Visual diff viewer
   - Side-by-side comparison
   - Preview merged result

3. **Conflict History**
   - Log resolved conflicts
   - Allow reviewing past conflicts
   - Undo conflict resolution

---

## Data Safety Measures

### 1. Backup Before Sync
```typescript
async function backupBeforeSync() {
    const backup = await db.exportAll();
    localStorage.setItem(`sync-backup-${Date.now()}`, JSON.stringify(backup));

    // Keep only last 5 backups
    cleanOldBackups();
}
```

### 2. Validation
```typescript
async function validateBeforeSave(doc: any): Promise<boolean> {
    // Validate document structure
    if (!doc.id || !doc.createdAt || !doc.updatedAt) return false;

    // Validate data integrity
    if (doc.docType === 'packing-list') {
        return validatePackingList(doc);
    }

    return true;
}
```

### 3. Rollback Support
```typescript
async function rollbackSync(backupId: string) {
    const backup = localStorage.getItem(`sync-backup-${backupId}`);
    if (backup) {
        await db.importAll(JSON.parse(backup));
    }
}
```

### 4. Sync Confirmation
For destructive operations, ask for user confirmation:
```typescript
interface SyncConfirmation {
    action: 'overwrite-local' | 'overwrite-remote' | 'merge';
    documentsAffected: number;
    canUndo: boolean;
}
```

---

## User Experience

### Sync Status Indicators

```typescript
export type SyncStatus =
    | { type: 'idle' }
    | { type: 'syncing', progress: number }
    | { type: 'synced', at: string }
    | { type: 'conflict', count: number }
    | { type: 'error', message: string }
    | { type: 'offline' };
```

### Visual Feedback

1. **Navigation Bar**
   - Sync icon with status indicator
   - Green: synced
   - Blue: syncing
   - Yellow: conflicts
   - Red: error
   - Gray: offline/disabled

2. **Document-Level Indicators**
   - "Saved locally" badge
   - "Synced to Pod" badge with timestamp
   - "Pending sync" badge
   - "Conflict" badge

3. **Toast Notifications**
   - "Synced successfully"
   - "Conflict detected - review needed"
   - "Sync failed - will retry"
   - "Offline - changes will sync later"

---

## API Design

### SyncService Public Interface

```typescript
export interface SyncService {
    // Initialization
    initialize(options: SyncOptions): Promise<void>;

    // Manual sync
    syncAll(): Promise<SyncResult>;
    syncQuestionSet(): Promise<SyncResult>;
    syncPackingList(id: string): Promise<SyncResult>;
    syncAllPackingLists(): Promise<SyncResult>;

    // Conflict management
    getConflicts(): ConflictInfo[];
    resolveConflict(conflictId: string, resolution: ResolutionStrategy): Promise<void>;

    // Configuration
    setAutoSync(enabled: boolean): void;
    setSyncInterval(ms: number): void;

    // State
    getSyncState(): SyncState;
    onSyncStateChange(callback: (state: SyncState) => void): () => void;

    // Utilities
    getDeviceId(): string;
    getLastSyncTime(docId?: string): string | null;
}

export interface SyncOptions {
    autoSyncEnabled: boolean;
    syncInterval: number;
    conflictStrategy: 'prompt' | 'last-write-wins' | 'keep-local' | 'keep-remote';
    enableBackups: boolean;
}

export interface SyncResult {
    success: boolean;
    synced: number;
    conflicts: number;
    errors: string[];
}
```

---

## Performance Optimization

### 1. Efficient Change Detection
```typescript
function calculateChecksum(doc: any): string {
    // Use fast hash for change detection
    const str = JSON.stringify(doc, Object.keys(doc).sort());
    return simpleHash(str);
}

async function hasChangedSince(docId: string, timestamp: string): Promise<boolean> {
    const localDoc = await db.get(docId);
    return new Date(localDoc.updatedAt) > new Date(timestamp);
}
```

### 2. Incremental Sync
Only fetch and compare documents that have changed:
```typescript
async function fetchChangedDocuments(since: string): Promise<SyncableDocument[]> {
    // For Pod, maintain a change log or use timestamps
    const allDocs = await loadAllFromPod();
    return allDocs.filter(doc => new Date(doc.updatedAt) > new Date(since));
}
```

### 3. Batch Operations
```typescript
async function batchSync(documents: SyncableDocument[]): Promise<SyncResult> {
    const BATCH_SIZE = 10;
    const results: SyncResult[] = [];

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        const result = await syncBatch(batch);
        results.push(result);
    }

    return mergeResults(results);
}
```

### 4. Debouncing
```typescript
const debouncedSync = debounce(async (docId: string) => {
    await syncService.syncDocument(docId);
}, 3000);
```

---

## Error Handling

### Retry Strategy
```typescript
async function syncWithRetry(fn: () => Promise<void>, maxRetries = 3): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await fn();
            return;
        } catch (error) {
            if (i === maxRetries - 1) throw error;

            // Exponential backoff
            await sleep(Math.pow(2, i) * 1000);
        }
    }
}
```

### Error Recovery
```typescript
async function handleSyncError(error: Error, doc: SyncableDocument) {
    // Log error
    console.error('Sync error:', error, doc);

    // Categorize error
    if (isNetworkError(error)) {
        // Queue for retry
        syncQueue.add(doc);
    } else if (isConflictError(error)) {
        // Add to conflicts
        addConflict(doc);
    } else if (isAuthError(error)) {
        // Prompt re-login
        showLoginPrompt();
    } else {
        // Unknown error, notify user
        showErrorNotification(error.message);
    }
}
```

---

## Testing Strategy

### Unit Tests
- Sync algorithms (timestamp comparison, vector clocks)
- Conflict detection
- Merge strategies
- Checksum calculation

### Integration Tests
- Login sync flow
- Periodic sync
- Conflict resolution
- Offline/online transitions

### E2E Tests
- Multi-device scenarios (simulated)
- Concurrent edits
- Network failures
- Large datasets

---

## Migration Path

### Existing Users
1. Add metadata to existing documents on first load
2. Preserve existing manual sync buttons during transition
3. Opt-in auto-sync (default: disabled initially)
4. Clear messaging about new features

### Data Migration
```typescript
async function migrateToSyncableDocuments() {
    const allDocs = await db.getAllDocuments();

    for (const doc of allDocs) {
        if (!doc.syncMetadata) {
            doc.syncMetadata = {
                version: 1,
                lastSyncedAt: doc.updatedAt,
                deviceId: getDeviceId(),
                checksum: calculateChecksum(doc),
            };

            await db.save(doc);
        }
    }
}
```

---

## Recommended Initial Implementation

### Start with Question Set Only

**Rationale**:
- Single document (simpler than multiple packing lists)
- Less frequent updates
- Clear conflict scenarios
- Users can test sync with less risk

### Phase 1 Features:
1. Add sync metadata to question set
2. Implement login sync
3. Simple last-write-wins conflict resolution
4. Basic UI indicators

### Success Criteria:
- Question set syncs on login
- Conflicts are detected and user is prompted
- Clear feedback on sync status
- No data loss scenarios

### Expand to Packing Lists:
Once question set sync is stable:
1. Apply same pattern to packing lists
2. Add batch sync operations
3. Implement periodic background sync
4. Add advanced merge strategies

---

## Configuration

### User Settings
```typescript
export interface SyncSettings {
    // Auto-sync
    autoSyncEnabled: boolean;
    syncInterval: number; // minutes

    // Conflict resolution
    defaultConflictResolution: ConflictStrategy;
    alwaysPromptOnConflict: boolean;

    // Performance
    enableBackgroundSync: boolean;
    maxRetries: number;

    // Notifications
    showSyncNotifications: boolean;
    notifyOnConflicts: boolean;
}
```

### Settings UI Location
Add to existing app settings or create new "Sync Settings" section

---

## Security Considerations

1. **Authentication**: Use existing Solid authentication
2. **Data Validation**: Validate all data from Pod before applying locally
3. **Encryption**: Rely on Solid Pod's security (HTTPS + OAuth)
4. **Device Trust**: Each device has unique ID but shares same WebID
5. **Audit Log**: Track sync operations for debugging

---

## Future Enhancements

### Phase 5+
1. **Real-time Sync**: WebSocket-based instant sync
2. **Selective Sync**: Choose which lists to sync
3. **Sync History**: View and rollback past syncs
4. **Multi-User Sharing**: Share lists with other users
5. **Advanced Merge UI**: Visual diff editor
6. **Conflict Analytics**: Track common conflict patterns
7. **Compression**: Compress data for faster sync
8. **Delta Sync**: Only sync changes, not full documents

---

## Questions for Consideration

1. **Sync Interval**: What's the right balance between freshness and performance? (Recommendation: 5 minutes)

2. **Conflict Strategy**: Should we default to last-write-wins or always prompt? (Recommendation: Prompt for first version, add "remember my choice" option)

3. **Offline Queue**: How long to keep unsynced changes? (Recommendation: Indefinitely, until successful sync)

4. **Storage Limits**: How to handle Pod storage limits? (Recommendation: Show storage usage, warn before limits)

5. **Question Set vs Packing Lists**: Start with which one? (Recommendation: Question Set - simpler, single document)

---

## Summary

This design provides:
- **Automatic sync** on login and periodically
- **Conflict detection** using timestamps and checksums
- **Safe conflict resolution** with user control
- **Offline-first** architecture that syncs when online
- **Clear UX** with status indicators and notifications
- **Incremental implementation** starting with Question Set
- **Data safety** with backups and validation

The phased approach allows testing and refinement at each stage, ensuring a robust and user-friendly sync experience.
