# Pod Sync Strategy and Implementation Plan

## Current Problems

### 1. No Automatic Sync on First Login
- When users first login with a pod, nothing syncs automatically
- Users must manually click "Load from Pod" button
- This is unintuitive - users expect their pod data to appear automatically
- Creates confusion about whether login worked

### 2. Unclear Conflict Resolution
- Current strategy: `fallback-to-pod` - pod wins if local has no timestamp OR pod is newer
- User confusion: "If I start new local questions, then login 5 mins later, the pod data takes priority"
- The "Load from Pod" button **deletes all local data first** (packing-lists.tsx:94-98) - this is destructive and unexpected
- No visibility into what will happen when sync occurs
- No way to predict which data will win in a conflict

### 3. Confusing Packing List Sync
- Manual "Save to Pod" and "Load from Pod" buttons on overview page
- But individual packing list editing has automatic syncing (polling every 5 seconds)
- Mixed paradigms: manual sync for existence, automatic sync for content
- "Load from Pod" is destructive (deletes all local lists first)
- No indication of what exists in pod vs locally

### 4. Architecture Issues
- Different sync strategies in different places (fallback-to-pod vs strict-newer)
- Polling intervals vary (5s for lists, 10s for questions)
- No global sync status or coordination
- Sync prevention window (2s) is hardcoded and opaque

## Proposed Sync Strategy

### Core Principles

1. **Never Lose Data** - Always merge, never destructively replace
2. **Automatic and Transparent** - Users shouldn't think about syncing
3. **Predictable** - Clear rules for conflict resolution
4. **Last Write Wins** - Most recent timestamp always wins
5. **Local-First** - Work offline, sync when connected
6. **Visible Status** - Users always know sync state

### Sync Model: Three-Way Merge

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Local     │────▶│  Sync       │◀────│    Pod      │
│   Storage   │     │  Engine     │     │   Storage   │
│  (PouchDB)  │     │             │     │   (Solid)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                    │
       │                   ▼                    │
       │            ┌─────────────┐             │
       └───────────▶│   Merged    │◀────────────┘
                    │    State    │
                    └─────────────┘
```

### Conflict Resolution Rules

#### Rule 1: Timestamp-Based Resolution (Default)
- Compare `lastModified` timestamps
- **Newest wins** - most recent timestamp takes precedence
- Both pod and local data must have valid timestamps
- If timestamps are identical, keep current version (no-op)

#### Rule 2: Existence Rules
- **New local item, not in pod** → Add to pod
- **New pod item, not in local** → Add to local
- **Item in both** → Apply Rule 1 (timestamp comparison)

#### Rule 3: Deletion Rules
- Track deletions with tombstones: `{ id, deleted: true, deletedAt: timestamp }`
- If local item deleted after pod timestamp → Delete from pod
- If pod item deleted after local timestamp → Delete from local
- Tombstones expire after 30 days (configurable)

#### Rule 4: First Sync (No Prior Sync Data)
- On first login, treat all pod data as "new" and merge with local
- On first save to pod, treat all local data as "new" and merge with pod
- No data loss - everything merges

### Automatic Sync Behavior

#### On First Login
1. User completes OAuth flow and session is established
2. **Automatic initial sync triggered immediately**
3. Show clear notification: "Syncing your data from pod..."
4. Fetch all data from pod (questions + packing lists)
5. Merge with local data using conflict resolution rules
6. Show summary: "Synced 3 new packing lists, updated 1 existing list"
7. Continue with normal polling

#### During Active Session
1. **Automatic background sync** every 10 seconds (configurable)
2. Bi-directional: check both pod→local and local→pod
3. Silent sync unless conflicts or errors occur
4. Show sync indicator: "⟳ Syncing...", "✓ Synced 2s ago", "⚠ Sync error"

#### On Local Changes
1. User makes changes locally
2. Save to local DB immediately (guaranteed persistence)
3. Debounce (1s) to batch rapid changes
4. Save to pod automatically after debounce
5. On successful pod save, update last sync timestamp
6. On pod error, queue for retry (exponential backoff)

#### On Pod Changes (Detected by Polling)
1. Poll detects pod data is newer than local
2. Fetch updated pod data
3. Apply conflict resolution rules
4. Update local DB and UI
5. Preserve user focus/cursor position
6. Show notification if data changed: "Packing list updated from pod"

### Sync Status Visibility

#### Global Sync Status Indicator
```
┌─────────────────────────────────┐
│  🌐 Pod: Connected ✓            │
│  ⟳ Last synced: 5 seconds ago   │
│  📋 3 packing lists synced       │
└─────────────────────────────────┘
```

States:
- **Not logged in**: "🌐 Pod: Not connected"
- **Syncing**: "⟳ Syncing..."
- **Synced**: "✓ Synced Xs ago"
- **Error**: "⚠ Sync error - Retry"
- **Offline**: "📴 Offline - will sync when online"

#### Per-Item Sync Status
- Each packing list shows sync indicator: ✓ (synced), ⟳ (syncing), ⚠ (error)
- Show last sync time on hover
- Show "Not yet synced to pod" for new local items

#### Sync Activity Log (Advanced)
- Optional detailed log of sync operations
- Shows what changed, when, and why
- Useful for debugging and user understanding

## Implementation Plan

### Phase 1: Foundation and Infrastructure (Critical Path)

#### Task 1.1: Create Centralized Sync State Management
**Goal**: Single source of truth for sync state across the app

**Acceptance Criteria**:
- Create `src/contexts/SyncStateContext.tsx` with global sync state
- State includes: `{ status, lastSyncTime, error, itemsSynced, syncInProgress }`
- Status enum: `NOT_LOGGED_IN`, `SYNCING`, `SYNCED`, `ERROR`, `OFFLINE`
- Provides hooks: `useSyncState()`, `useSyncStatus()`
- Integrates with existing `SolidPodContext`

**Files to Modify**:
- Create: `src/contexts/SyncStateContext.tsx`
- Create: `src/types/sync.ts` (sync state types)

**Dependencies**: None

**Estimated Complexity**: Low

---

#### Task 1.2: Create Sync Status UI Components
**Goal**: Reusable UI components to show sync status

**Acceptance Criteria**:
- Create `<SyncStatusIndicator />` component showing current sync state
- Create `<SyncStatusBadge />` for per-item sync status
- Create `<LastSyncedTime />` component with human-readable time
- Support all sync states with appropriate icons and colors
- Responsive and accessible (ARIA labels)

**Files to Modify**:
- Create: `src/components/SyncStatusIndicator.tsx`
- Create: `src/components/SyncStatusBadge.tsx`
- Create: `src/components/LastSyncedTime.tsx`
- Update: `src/types/sync.ts` (add UI-specific types)

**Dependencies**: Task 1.1

**Estimated Complexity**: Low

---

#### Task 1.3: Add Comprehensive Sync Logging
**Goal**: Debug sync issues and track sync operations

**Acceptance Criteria**:
- Create `src/utils/syncLogger.ts` with structured logging
- Log levels: `DEBUG`, `INFO`, `WARN`, `ERROR`
- Log all sync operations with timestamps and metadata
- Include: source (pod/local), operation (merge/conflict/error), item IDs
- Optional: persist to localStorage for debugging (last 100 entries)
- Development mode: verbose logging; Production: errors only

**Files to Modify**:
- Create: `src/utils/syncLogger.ts`
- Update: `src/hooks/useSyncCoordinator.ts` (add logging)
- Update: `src/hooks/usePodSync.ts` (add logging)
- Update: `src/services/solidPod.ts` (add logging)

**Dependencies**: None

**Estimated Complexity**: Low

---

### Phase 2: Automatic Initial Sync (High Priority)

#### Task 2.1: Implement Automatic Sync on First Login
**Goal**: Automatically fetch and merge pod data when user logs in

**Acceptance Criteria**:
- Detect first login: check if `lastSyncTime` exists in localStorage
- Trigger automatic sync immediately after session established
- Show loading indicator: "Syncing your data from pod..."
- Fetch both questions and packing lists from pod
- Don't block UI - allow user to continue working
- Handle errors gracefully (show notification, allow manual retry)
- Store `lastSyncTime` after successful sync

**Files to Modify**:
- Update: `src/components/SolidPodContext.tsx` (add auto-sync trigger)
- Update: `src/hooks/usePodSync.ts` (add initial sync method)
- Create: `src/hooks/useInitialSync.ts` (orchestrate initial sync)

**Dependencies**: Task 1.1, Task 1.2

**Estimated Complexity**: Medium

---

#### Task 2.2: Create Three-Way Merge Logic for Questions
**Goal**: Merge pod questions with local questions without data loss

**Acceptance Criteria**:
- Create `src/utils/mergeQuestions.ts` with merge logic
- Compare pod questions and local questions by ID (if available) or content hash
- Apply conflict resolution rules:
  - New questions in pod → add to local
  - New questions in local → add to pod
  - Conflicts → newest timestamp wins
- Preserve question order where possible
- Return merge result: `{ merged: Question[], added: number, updated: number, conflicts: number }`
- Handle edge cases: empty data, malformed data, missing timestamps

**Files to Modify**:
- Create: `src/utils/mergeQuestions.ts`
- Create: `src/utils/mergeUtils.ts` (shared merge utilities)
- Update: `src/types/sync.ts` (add merge result types)
- Add unit tests: `src/utils/mergeQuestions.test.ts`

**Dependencies**: None

**Estimated Complexity**: Medium

---

#### Task 2.3: Create Three-Way Merge Logic for Packing Lists
**Goal**: Merge pod packing lists with local packing lists without data loss

**Acceptance Criteria**:
- Create `src/utils/mergePackingLists.ts` with merge logic
- Compare pod lists and local lists by `id`
- Apply conflict resolution rules:
  - New lists in pod → add to local
  - New lists in local → keep for later pod sync
  - Same `id` but different content → newest `lastModified` wins
  - Handle nested items: merge item-level changes if possible
- Return merge result: `{ merged: PackingList[], added: number, updated: number, conflicts: number }`
- Handle edge cases: empty lists, missing IDs, missing timestamps

**Files to Modify**:
- Create: `src/utils/mergePackingLists.ts`
- Update: `src/utils/mergeUtils.ts` (shared utilities)
- Update: `src/types/sync.ts` (add merge result types)
- Add unit tests: `src/utils/mergePackingLists.test.ts`

**Dependencies**: Task 2.2 (shares merge utilities)

**Estimated Complexity**: Medium-High

---

#### Task 2.4: Add User Notification for Initial Sync Results
**Goal**: Show clear summary of what was synced

**Acceptance Criteria**:
- After initial sync completes, show notification toast
- Success message: "Synced from pod: 3 new packing lists, 1 updated list, 5 questions"
- Error message: "Failed to sync from pod: [error details] - Retry"
- If no pod data found: "No data found in pod. Your local data will be saved to pod when you make changes."
- Notification dismissible but persists for 10 seconds
- Provide "View Details" link to sync activity log (if implemented)

**Files to Modify**:
- Update: `src/hooks/useInitialSync.ts` (add notification logic)
- Update: `src/components/SolidPodContext.tsx` (integrate notifications)

**Dependencies**: Task 2.1, Task 2.2, Task 2.3

**Estimated Complexity**: Low

---

### Phase 3: Improved Conflict Resolution (High Priority)

#### Task 3.1: Implement Consistent "Newest Wins" Strategy
**Goal**: Replace confusing `fallback-to-pod` with clear timestamp-based resolution

**Acceptance Criteria**:
- Update `useSyncCoordinator.ts` to use "newest wins" by default
- Compare `lastModified` timestamps: `podTime > localTime` → pod wins
- If timestamps equal: no-op (already in sync)
- Remove `fallback-to-pod` strategy entirely
- Add `strict-newest` and `local-first` strategies as options
- Update all usages to use new strategy

**Files to Modify**:
- Update: `src/hooks/useSyncCoordinator.ts` (refactor conflict resolution)
- Update: `src/pages/view-packing-list.tsx` (use new strategy)
- Update: `src/pages/edit-questions-form.tsx` (use new strategy)
- Update: `src/types/sync.ts` (update strategy enum)

**Dependencies**: Task 1.3 (logging helps debug)

**Estimated Complexity**: Medium

---

#### Task 3.2: Add Tombstone-Based Deletion Tracking
**Goal**: Handle deleted items gracefully across devices

**Acceptance Criteria**:
- Add `deleted` and `deletedAt` fields to data types
- When item deleted locally:
  - Mark as `{ deleted: true, deletedAt: timestamp }` in local DB
  - Sync tombstone to pod
- When item deleted in pod:
  - Detect missing item during sync
  - If local item exists and is older → delete from local
  - If local item exists and is newer → keep local (was modified after pod deletion)
- Clean up tombstones older than 30 days (configurable)
- Add migration for existing data (no retroactive tombstones)

**Files to Modify**:
- Update: `src/types/packingList.ts` (add deleted fields)
- Update: `src/types/questions.ts` (add deleted fields)
- Update: `src/services/database.ts` (handle tombstones)
- Update: `src/utils/mergePackingLists.ts` (merge with tombstones)
- Update: `src/utils/mergeQuestions.ts` (merge with tombstones)
- Create: `src/utils/tombstoneCleanup.ts` (cleanup logic)

**Dependencies**: Task 3.1

**Estimated Complexity**: High

---

#### Task 3.3: Refactor useSyncCoordinator with New Resolution Logic
**Goal**: Integrate tombstones and new merge logic into sync coordinator

**Acceptance Criteria**:
- Update `useSyncCoordinator` to use new merge utilities
- Handle tombstones during sync from pod
- Apply "newest wins" strategy consistently
- Update sync prevention window to be configurable (default 2s)
- Improve loop prevention: track by item ID + timestamp hash
- Return sync result to caller: `{ merged: boolean, added: number, updated: number, deleted: number }`

**Files to Modify**:
- Update: `src/hooks/useSyncCoordinator.ts` (major refactor)
- Update documentation in file with clear examples

**Dependencies**: Task 3.1, Task 3.2

**Estimated Complexity**: High

---

### Phase 4: Packing List Sync Improvements (Medium Priority)

#### Task 4.1: Remove Destructive "Load from Pod" Button
**Goal**: Eliminate confusing and destructive manual sync button

**Acceptance Criteria**:
- Remove "Load from Pod" button from packing lists overview page
- Remove `handleLoadFromPod()` function
- Remove destructive delete-all-local logic (Lines 94-98)
- Keep "Save to Pod" button temporarily (will replace in Task 4.3)
- Add migration notice if users have unsaved local data

**Files to Modify**:
- Update: `src/pages/packing-lists.tsx` (remove button and handler)

**Dependencies**: Task 2.1 (automatic sync must work first)

**Estimated Complexity**: Low

---

#### Task 4.2: Implement Automatic Merge for Packing Lists Overview
**Goal**: Packing lists overview automatically shows merged pod + local data

**Acceptance Criteria**:
- On page load, automatically fetch pod packing lists
- Merge with local packing lists using merge logic
- Show combined view with sync status per list
- Each list shows indicator: ✓ (synced), 📱 (local only), ☁️ (pod only), ⚠ (conflict)
- On hover, show last modified time and source
- No loading spinner - show local data immediately, update when pod data arrives

**Files to Modify**:
- Update: `src/pages/packing-lists.tsx` (auto-merge on load)
- Update: `src/hooks/usePackingLists.ts` (add merge logic)
- Use: `src/utils/mergePackingLists.ts` (from Task 2.3)

**Dependencies**: Task 2.3, Task 4.1

**Estimated Complexity**: Medium

---

#### Task 4.3: Replace "Save to Pod" with "Sync Now" Button
**Goal**: Make manual sync non-destructive and bi-directional

**Acceptance Criteria**:
- Replace "Save to Pod" button with "Sync Now" button
- "Sync Now" performs bi-directional sync:
  - Fetch latest from pod
  - Merge with local using conflict resolution
  - Save merged result to both local and pod
- Show sync progress: "Syncing..." with spinner
- Show sync result: "Synced 2 lists to pod, loaded 1 new list"
- Handle errors: "Sync failed: [error] - Retry"
- Disable button while sync in progress

**Files to Modify**:
- Update: `src/pages/packing-lists.tsx` (replace button)
- Create: `src/hooks/useBidirectionalSync.ts` (sync logic)

**Dependencies**: Task 4.2

**Estimated Complexity**: Medium

---

#### Task 4.4: Handle Deleted Packing Lists with Tombstones
**Goal**: Sync packing list deletions across devices

**Acceptance Criteria**:
- When user deletes a packing list:
  - Create tombstone: `{ id, deleted: true, deletedAt: timestamp }`
  - Save tombstone to local DB
  - Sync tombstone to pod (delete the JSON file, save tombstone separately)
- During sync:
  - Detect deleted lists in pod → delete from local if local is older
  - Detect deleted lists locally → delete from pod if pod is older
- Clean up pod tombstones older than 30 days
- Handle case: user recreates list with same name after deletion

**Files to Modify**:
- Update: `src/services/database.ts` (save tombstones)
- Update: `src/services/solidPod.ts` (sync tombstones)
- Update: `src/utils/mergePackingLists.ts` (handle tombstones)
- Create: `src/utils/tombstoneManager.ts` (centralized tombstone logic)

**Dependencies**: Task 3.2

**Estimated Complexity**: High

---

### Phase 5: Enhanced User Visibility (Low Priority, High Value)

#### Task 5.1: Add Global Sync Status Indicator to Header
**Goal**: Users always know sync status at a glance

**Acceptance Criteria**:
- Add sync status indicator to app header (top-right)
- Shows icon + text: "✓ Synced 10s ago", "⟳ Syncing...", "⚠ Sync error"
- Clicking opens sync details popover:
  - Last sync time
  - Number of items synced
  - Any errors or conflicts
  - "Sync Now" button
- Auto-update every second while visible
- Collapse to icon only on mobile

**Files to Modify**:
- Update: `src/components/Header.tsx` (add indicator)
- Create: `src/components/SyncStatusPopover.tsx`
- Update: `src/contexts/SyncStateContext.tsx` (provide detailed state)

**Dependencies**: Task 1.1, Task 1.2

**Estimated Complexity**: Medium

---

#### Task 5.2: Add Per-Item Sync Status Badges
**Goal**: Show sync status for each packing list

**Acceptance Criteria**:
- Add sync status badge to each packing list card
- Badge types:
  - ✓ "Synced" (green) - synced to pod
  - 📱 "Local only" (blue) - not yet in pod
  - ☁️ "Pod only" (blue) - not yet in local (shouldn't happen after merge)
  - ⟳ "Syncing..." (gray) - currently syncing
  - ⚠ "Sync error" (red) - sync failed
- On hover, show tooltip: "Last synced: 2 minutes ago"
- Clicking badge shows sync details for that item
- Badge position: top-right of card

**Files to Modify**:
- Update: `src/pages/packing-lists.tsx` (add badges)
- Use: `src/components/SyncStatusBadge.tsx` (from Task 1.2)
- Update: `src/types/packingList.ts` (add sync metadata)

**Dependencies**: Task 1.2

**Estimated Complexity**: Low-Medium

---

#### Task 5.3: Show Human-Readable Last Sync Time
**Goal**: Users know how recent their data is

**Acceptance Criteria**:
- Display last sync time in human-readable format:
  - "Just now" (< 5s)
  - "5 seconds ago"
  - "2 minutes ago"
  - "1 hour ago"
  - "Yesterday at 2:30 PM"
  - "Mar 15 at 2:30 PM"
- Auto-update every 10 seconds
- Show in sync status indicator and per-item tooltips
- Handle "Never synced" case for local-only items

**Files to Modify**:
- Update: `src/components/LastSyncedTime.tsx` (from Task 1.2)
- Create: `src/utils/timeFormatting.ts` (time formatting utilities)
- Use library: `date-fns` for relative time formatting

**Dependencies**: Task 1.2

**Estimated Complexity**: Low

---

#### Task 5.4: Add "What Changed" Notification After Sync
**Goal**: Users know what changed when sync updates their data

**Acceptance Criteria**:
- After sync updates local data, show notification:
  - "Packing list 'Summer Vacation' updated from pod"
  - "3 new items added to 'Camping Trip'"
  - "Question 'Age range' updated from pod"
- Notification includes:
  - What changed (item name)
  - Type of change (updated, added, deleted)
  - Source (from pod)
  - Timestamp
- Dismissible, auto-dismiss after 5 seconds
- Don't show if user was actively editing (would be distracting)
- Batch multiple changes into single notification if within 1 second

**Files to Modify**:
- Update: `src/hooks/useSyncCoordinator.ts` (track changes)
- Update: `src/hooks/usePodSync.ts` (show notifications)
- Create: `src/components/SyncChangeNotification.tsx`

**Dependencies**: Task 2.1, Task 3.3

**Estimated Complexity**: Medium

---

#### Task 5.5: Create Optional Sync Activity Log
**Goal**: Advanced users can see detailed sync history

**Acceptance Criteria**:
- Add "Sync Activity" page/modal (accessible from sync status popover)
- Show chronological list of sync operations:
  - Timestamp
  - Operation type (sync, merge, conflict, error)
  - Item affected
  - Result (success, failure)
  - Details (what changed)
- Filter options: errors only, specific items, date range
- Export to JSON for support/debugging
- Limit to last 100 operations (configurable)
- Store in localStorage

**Files to Modify**:
- Create: `src/pages/sync-activity.tsx` (activity log page)
- Create: `src/components/SyncActivityLog.tsx` (log component)
- Update: `src/utils/syncLogger.ts` (persist to localStorage)
- Update: `src/components/SyncStatusPopover.tsx` (add link)

**Dependencies**: Task 1.3, Task 5.1

**Estimated Complexity**: Medium

---

### Phase 6: Testing, Error Handling, and Polish (Critical for Quality)

#### Task 6.1: Add Unit Tests for Merge Logic
**Goal**: Ensure merge logic handles all edge cases correctly

**Acceptance Criteria**:
- Test `mergeQuestions.ts`:
  - Empty pod, empty local → empty result
  - New questions in pod → added to result
  - New questions in local → added to result
  - Conflicting questions → newest wins
  - Identical questions → no duplicates
  - Missing timestamps → fallback behavior
  - Malformed data → error handling
- Test `mergePackingLists.ts`:
  - All scenarios above
  - Nested item merging
  - Tombstone handling
  - ID conflicts
- Achieve >90% code coverage for merge utilities

**Files to Modify**:
- Create: `src/utils/mergeQuestions.test.ts`
- Create: `src/utils/mergePackingLists.test.ts`
- Create: `src/utils/mergeUtils.test.ts`
- Update: Test scripts in `package.json`

**Dependencies**: Task 2.2, Task 2.3, Task 3.2

**Estimated Complexity**: High

---

#### Task 6.2: Add Integration Tests for Sync Flows
**Goal**: Test complete sync flows end-to-end

**Acceptance Criteria**:
- Test scenarios:
  1. First login with empty pod → no data
  2. First login with pod data → data merged
  3. First login with local data → local preserved
  4. Background sync detects pod changes → local updated
  5. Local changes saved → pod updated
  6. Conflict (both changed) → newest wins
  7. Item deleted locally → tombstone synced
  8. Item deleted in pod → local updated
  9. Network error during sync → retry succeeds
  10. Session expired during sync → error shown
- Mock pod service responses
- Use React Testing Library for UI interactions
- Achieve >80% code coverage for sync hooks

**Files to Modify**:
- Create: `src/hooks/usePodSync.test.ts`
- Create: `src/hooks/useSyncCoordinator.test.ts`
- Create: `src/hooks/useInitialSync.test.ts`
- Create: `src/__mocks__/solidPod.ts` (mock pod service)
- Update: Test setup in `src/setupTests.ts`

**Dependencies**: All Phase 2 and Phase 3 tasks

**Estimated Complexity**: Very High

---

#### Task 6.3: Implement Robust Error Recovery and Retry Logic
**Goal**: Handle network failures and transient errors gracefully

**Acceptance Criteria**:
- Implement exponential backoff for pod operations:
  - Initial retry: 2 seconds
  - Second retry: 4 seconds
  - Third retry: 8 seconds
  - Fourth retry: 16 seconds
  - Max 4 retries, then show error
- Detect error types:
  - Network errors (offline) → queue for later retry
  - Authentication errors (401/403) → stop retrying, prompt re-login
  - Server errors (500) → retry with backoff
  - Rate limiting (429) → respect Retry-After header
- Queue failed operations:
  - Store in localStorage
  - Retry when user comes back online
  - Retry when user re-logs in
- Show clear error messages to user

**Files to Modify**:
- Update: `src/services/solidPod.ts` (add retry logic)
- Create: `src/utils/retryQueue.ts` (operation queue)
- Update: `src/hooks/usePodSync.ts` (integrate queue)
- Update: `src/components/SolidPodContext.tsx` (handle auth errors)

**Dependencies**: None (can be done early)

**Estimated Complexity**: High

---

#### Task 6.4: Add Offline Detection and Handling
**Goal**: Gracefully handle offline scenarios

**Acceptance Criteria**:
- Detect when user goes offline:
  - Listen to `navigator.onLine`
  - Listen to network error patterns
- When offline:
  - Stop polling pod
  - Show "Offline" indicator in sync status
  - Queue all local changes
  - Allow full local operation
- When back online:
  - Show "Back online" notification
  - Resume polling
  - Flush queued operations
  - Perform full sync
- Handle partial connectivity (slow/flaky network):
  - Increase polling interval if repeated failures
  - Show "Poor connection" warning

**Files to Modify**:
- Create: `src/hooks/useOnlineStatus.ts` (online detection)
- Update: `src/hooks/usePodSync.ts` (pause when offline)
- Update: `src/contexts/SyncStateContext.tsx` (track online status)
- Update: `src/components/SyncStatusIndicator.tsx` (show offline state)

**Dependencies**: Task 6.3

**Estimated Complexity**: Medium

---

#### Task 6.5: Optimize Performance for Large Datasets
**Goal**: Ensure sync remains fast with many packing lists

**Acceptance Criteria**:
- Benchmark sync performance with:
  - 10 packing lists
  - 50 packing lists
  - 100 packing lists
- Target: sync completes in <2 seconds for 100 lists
- Optimizations:
  - Batch pod operations (save multiple files in parallel)
  - Use etags/conditional requests to skip unchanged files
  - Implement incremental sync (only changed items)
  - Debounce local saves more aggressively
  - Cache pod file listings
- Add performance monitoring:
  - Track sync duration
  - Track pod operation latency
  - Log slow operations (>500ms)

**Files to Modify**:
- Update: `src/services/solidPod.ts` (add etags, parallel operations)
- Update: `src/hooks/usePodSync.ts` (incremental sync)
- Create: `src/utils/performanceMonitor.ts` (monitoring)
- Update: `src/utils/syncLogger.ts` (log performance)

**Dependencies**: All Phase 2 and Phase 3 tasks

**Estimated Complexity**: High

---

#### Task 6.6: Create User Documentation for Sync Behavior
**Goal**: Users understand how syncing works

**Acceptance Criteria**:
- Create help documentation page:
  - "How Pod Syncing Works"
  - Conflict resolution rules
  - What happens on first login
  - What happens when offline
  - Troubleshooting common issues
- Add in-app help:
  - "?" icon next to sync status indicator
  - Opens sync help modal
  - Shows current sync state and what it means
- Add tooltips to UI elements:
  - Sync status indicator
  - Sync badges
  - "Sync Now" button
- Write developer documentation:
  - Architecture overview
  - How to modify sync behavior
  - Testing sync changes

**Files to Modify**:
- Create: `docs/SYNC_USER_GUIDE.md` (user documentation)
- Create: `docs/SYNC_DEVELOPER_GUIDE.md` (developer documentation)
- Create: `src/pages/help-sync.tsx` (in-app help page)
- Create: `src/components/SyncHelpModal.tsx` (help modal)
- Update: `src/components/SyncStatusIndicator.tsx` (add help icon)

**Dependencies**: All previous tasks (document the final behavior)

**Estimated Complexity**: Medium

---

## Implementation Priority

### Critical Path (Must be completed in order)
1. **Phase 1** (Foundation) → **Phase 2** (Auto Sync) → **Phase 3** (Conflict Resolution)

### Parallel Tracks (Can be done simultaneously)
- **Phase 4** (Packing Lists) - depends on Phase 2 & 3
- **Phase 5** (Visibility) - depends on Phase 1, some on Phase 2 & 3
- **Phase 6** (Testing) - ongoing throughout

### Suggested Sprint Plan

#### Sprint 1 (Weeks 1-2): Foundation
- Task 1.1, 1.2, 1.3
- Task 6.3 (Error handling - do early)
- Goal: Infrastructure in place

#### Sprint 2 (Weeks 3-4): Automatic Sync
- Task 2.1, 2.2, 2.3, 2.4
- Task 6.1 (Unit tests for merge logic)
- Goal: First login syncs automatically

#### Sprint 3 (Weeks 5-6): Conflict Resolution
- Task 3.1, 3.2, 3.3
- Task 6.4 (Offline handling)
- Goal: Clear, predictable conflict resolution

#### Sprint 4 (Weeks 7-8): Packing Lists & Visibility
- Task 4.1, 4.2, 4.3, 4.4
- Task 5.1, 5.2, 5.3
- Goal: Complete user experience

#### Sprint 5 (Weeks 9-10): Polish & Testing
- Task 5.4, 5.5
- Task 6.2 (Integration tests)
- Task 6.5 (Performance)
- Task 6.6 (Documentation)
- Goal: Production-ready

## Success Metrics

### User Experience Metrics
- **Sync Confusion**: User reports of sync confusion (target: <5% of users)
- **Data Loss**: Reports of lost data (target: 0)
- **Sync Success Rate**: Successful syncs vs failed syncs (target: >99%)
- **Time to First Sync**: Time from login to first successful sync (target: <5s)

### Technical Metrics
- **Sync Latency**: Average time for sync operation (target: <2s)
- **Error Rate**: Failed sync operations (target: <1%)
- **Retry Success Rate**: Failed operations that succeed on retry (target: >95%)
- **Test Coverage**: Code coverage for sync logic (target: >80%)

### User Satisfaction
- Survey question: "How well do you understand how Pod syncing works?" (target: >4/5)
- Survey question: "How confident are you that your data is synced?" (target: >4.5/5)

## Risk Mitigation

### Risk 1: Breaking Existing Users' Data
**Mitigation**:
- Implement feature flag for new sync behavior
- Gradual rollout: 10% → 50% → 100% of users
- Add data backup before migration
- Keep old sync code temporarily for rollback

### Risk 2: Pod Provider Compatibility Issues
**Mitigation**:
- Test with all three pod providers (Inrupt, solidcommunity.net, solidweb.org)
- Add provider-specific quirks handling
- Monitor error rates by provider

### Risk 3: Performance with Large Datasets
**Mitigation**:
- Performance testing with realistic data (100+ lists)
- Implement pagination for pod listings
- Add sync throttling if needed

### Risk 4: Complex Merge Conflicts
**Mitigation**:
- Extensive unit tests for edge cases
- Manual conflict resolution UI (fallback)
- Detailed logging for debugging

## Open Questions

1. **Tombstone Storage**: Should tombstones be stored in pod or only tracked locally?
   - **Recommendation**: Store in pod (in separate `.tombstones` file) for true cross-device sync

2. **Sync Frequency**: What's the optimal polling interval?
   - **Recommendation**: 30 seconds (balance between responsiveness and server load)
   - Make configurable for power users

3. **Conflict UI**: Should users ever see/resolve conflicts manually?
   - **Recommendation**: Phase 1 - automatic only. Phase 2 - add manual resolution UI

4. **Real-time Sync**: Should we implement WebSocket-based real-time sync?
   - **Recommendation**: Future enhancement. Polling is sufficient for MVP

5. **Data Migration**: How to handle migrating existing users to new sync behavior?
   - **Recommendation**: On first app load with new version, show "Syncing updated" notification
   - Automatically merge existing data using new logic
   - No user action required

## Conclusion

This strategy transforms pod syncing from a confusing, manual process into an automatic, transparent, and predictable experience. Key improvements:

1. **Automatic sync on first login** - Users immediately see their pod data
2. **Clear "newest wins" conflict resolution** - Predictable and understandable
3. **Never lose data** - Merge instead of replace
4. **Visible sync status** - Users always know what's happening
5. **Robust error handling** - Graceful degradation and recovery

The implementation plan breaks this large effort into 26 discrete tasks that can be completed independently by an AI agent. Each task has clear acceptance criteria, dependencies, and estimated complexity.

**Estimated Total Effort**: 10 weeks (2 developers) or 20 weeks (1 developer)
