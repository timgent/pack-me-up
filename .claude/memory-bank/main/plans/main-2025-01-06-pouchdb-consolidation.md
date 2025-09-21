# PouchDB Consolidation Technical Specification

## Metadata
- **Date**: 2025-01-06
- **Branch**: main
- **Status**: DRAFT
- **Feature**: Consolidate two PouchDB instances into single database
- **Estimated Complexity**: HIGH
- **Risk Level**: MEDIUM

## Executive Summary

The current React Packing App uses two separate PouchDB instances:
1. `packing-list-question-set` - stores single document with ID "1" containing questions, people, and always needed items
2. `packing-lists` - stores individual packing list documents with UUID IDs

This specification outlines the consolidation into a single PouchDB instance while maintaining all current functionality, preserving data integrity, and ensuring zero breaking changes.

## Current Architecture Analysis

### Database Structure
- **Question Set DB**: Single document pattern with fixed ID "1"
- **Packing Lists DB**: Multiple documents with UUID-based IDs
- **Revision Management**: Both use PouchDB's `_rev` for conflict prevention
- **Auto-save**: Debounced saves (5s delay) with status indicators

### Key Components
1. `EditQuestionsForm` - Manages question set CRUD with import/export
2. `CreatePackingList` - Reads question set, writes new packing lists
3. `ViewPackingList` - Reads/updates individual packing lists with auto-save
4. `PackingLists` - Lists all packing lists with delete functionality

### Data Flow Patterns
- Question set: Load → Edit → Save with conflict resolution
- Packing lists: Create from questions → Auto-save edits → Manual save/delete
- Import/Export: Only works for question sets (JSON format)

## Technical Specification

### 1. New Database Schema Design

#### Single Database Name
- **New DB**: `packing-app-data`
- **Migration from**: `packing-list-question-set` + `packing-lists`

#### Document Type Identification Strategy
```typescript
interface BaseDocument {
  _id: string
  _rev?: string
  docType: 'question-set' | 'packing-list'
  createdAt: string
  updatedAt: string
}

interface QuestionSetDocument extends BaseDocument {
  docType: 'question-set'
  _id: 'question-set-v1' // Fixed ID for singleton pattern
  people: Person[]
  alwaysNeededItems: Item[]
  questions: Question[]
}

interface PackingListDocument extends BaseDocument {
  docType: 'packing-list'
  _id: string // UUID format: 'packing-list-{uuid}'
  id: string // Original UUID for backwards compatibility
  name: string
  items: PackingListItem[]
}
```

#### ID Prefixing Strategy
- **Question Set**: `question-set-v1` (singleton, versioned for future migrations)
- **Packing Lists**: `packing-list-{uuid}` (maintains UUID uniqueness)

### 2. Migration Strategy

#### Phase 1: Data Export (Pre-Migration)
```typescript
interface MigrationData {
  questionSet: PackingListQuestionSet | null
  packingLists: PackingList[]
  timestamp: string
  version: string
}
```

#### Phase 2: Database Creation & Import
1. Create new consolidated database
2. Transform and import question set with new schema
3. Transform and import all packing lists with prefixed IDs
4. Validate data integrity

#### Phase 3: Backwards Compatibility
- Maintain original interfaces for components
- Use adapter pattern to translate between old/new schemas
- Preserve all existing revision tracking

### 3. Implementation Approach

#### 3.1 Database Service Layer
Create centralized database service to abstract PouchDB operations:

```typescript
class PackingAppDatabase {
  private db: PouchDB.Database

  // Question Set Operations
  async getQuestionSet(): Promise<PackingListQuestionSet>
  async saveQuestionSet(data: PackingListQuestionSet): Promise<void>

  // Packing List Operations
  async getPackingList(id: string): Promise<PackingList>
  async savePackingList(list: PackingList): Promise<void>
  async getAllPackingLists(): Promise<PackingList[]>
  async deletePackingList(id: string): Promise<void>

  // Migration Operations
  async migrateFromLegacyDatabases(): Promise<void>
  async exportLegacyData(): Promise<MigrationData>
}
```

#### 3.2 Component Refactoring Strategy
- **No Breaking Changes**: Components keep same interfaces
- **Progressive Enhancement**: Introduce service layer gradually
- **Fallback Support**: Handle both old and new database structures during transition

#### 3.3 Query Optimization
```typescript
// Efficient document type queries
async getDocumentsByType(docType: string) {
  return this.db.allDocs({
    include_docs: true,
    startkey: `${docType}-`,
    endkey: `${docType}-\ufff0`
  })
}
```

### 4. Testing Strategy

#### 4.1 Data Integrity Tests
- [ ] Verify all question set data migrates correctly
- [ ] Verify all packing list data migrates correctly
- [ ] Verify revision numbers are preserved
- [ ] Verify no data loss during migration

#### 4.2 Functional Tests
- [ ] Question set CRUD operations work identically
- [ ] Packing list CRUD operations work identically
- [ ] Auto-save functionality preserved
- [ ] Import/export functionality preserved
- [ ] Revision conflict resolution works

#### 4.3 Performance Tests
- [ ] Query performance comparable or better
- [ ] Memory usage acceptable
- [ ] Database size optimized

#### 4.4 Edge Case Tests
- [ ] Migration with corrupted data
- [ ] Migration with missing databases
- [ ] Concurrent access during migration
- [ ] Browser storage limits

### 5. Rollback Plan

#### 5.1 Data Backup Strategy
```typescript
interface BackupData {
  questionSetBackup: any
  packingListsBackup: any[]
  timestamp: string
  version: string
}
```

#### 5.2 Rollback Triggers
- Migration fails with data corruption
- Performance degradation > 50%
- Critical functionality broken
- User data loss detected

#### 5.3 Rollback Process
1. Stop all database operations
2. Restore from backup data
3. Recreate separate databases
4. Verify data integrity
5. Resume normal operations

## Implementation Steps

### Step 1: Create Database Service Foundation
**Estimated Time**: 2-3 hours
**Risk**: LOW

1.1. Create `src/services/database/` directory structure
1.2. Implement `PackingAppDatabase` class with TypeScript interfaces
1.3. Add database service provider/context for React components
1.4. Create unit tests for database service methods
1.5. Add error handling and logging infrastructure

**Success Criteria**:
- [ ] Database service compiles without errors
- [ ] All methods have proper TypeScript signatures
- [ ] Unit tests pass with 100% coverage
- [ ] Error handling covers all failure modes

### Step 2: Implement Migration Logic
**Estimated Time**: 4-5 hours
**Risk**: HIGH

2.1. Create migration utilities to export existing data
2.2. Implement data transformation functions (old → new schema)
2.3. Create consolidated database with new schema
2.4. Implement import functions with validation
2.5. Add migration progress tracking and error recovery

**Success Criteria**:
- [ ] Migration completes without data loss
- [ ] All document IDs follow new prefixing strategy
- [ ] Revision tracking preserved
- [ ] Migration can be safely repeated

### Step 3: Update Question Set Operations
**Estimated Time**: 3-4 hours
**Risk**: MEDIUM

3.1. Update `EditQuestionsForm` to use database service
3.2. Ensure import/export functionality works with new schema
3.3. Maintain exact same component behavior and user experience
3.4. Add integration tests for question set operations
3.5. Verify auto-save and conflict resolution

**Success Criteria**:
- [ ] Question editing works identically to before
- [ ] Import/export preserves all data
- [ ] No UI changes or breaking changes
- [ ] Revision conflicts handled correctly

### Step 4: Update Packing List Operations
**Estimated Time**: 4-5 hours
**Risk**: MEDIUM

4.1. Update `CreatePackingList` to use database service
4.2. Update `ViewPackingList` to use database service with auto-save
4.3. Update `PackingLists` to use database service for listing/deletion
4.4. Ensure UUID-based routing still works correctly
4.5. Add integration tests for all packing list operations

**Success Criteria**:
- [ ] Packing list creation works identically
- [ ] Auto-save preserves 5-second debouncing
- [ ] List view and deletion work correctly
- [ ] All existing URLs continue to work

### Step 5: Migration Execution & Testing
**Estimated Time**: 2-3 hours
**Risk**: HIGH

5.1. Create migration script with user consent dialog
5.2. Implement comprehensive data validation
5.3. Test migration with various data scenarios
5.4. Add migration status reporting to users
5.5. Implement rollback triggers and procedures

**Success Criteria**:
- [ ] Migration works on fresh installations
- [ ] Migration works with existing data
- [ ] Users informed throughout migration process
- [ ] Rollback works if migration fails

### Step 6: Performance Optimization & Cleanup
**Estimated Time**: 2-3 hours
**Risk**: LOW

6.1. Optimize database queries using document type prefixes
6.2. Remove old database references and cleanup code
6.3. Add database size monitoring and optimization
6.4. Performance test with large datasets
6.5. Update documentation and add operational guides

**Success Criteria**:
- [ ] Query performance equal or better than before
- [ ] No memory leaks or performance degradation
- [ ] Database size optimized
- [ ] Code cleaned of legacy references

## Risk Assessment & Mitigation

### HIGH RISKS

#### Risk: Data Loss During Migration
**Likelihood**: LOW | **Impact**: CRITICAL
**Mitigation**:
- Comprehensive backup before migration
- Multi-step validation during migration
- Atomic migration operations with rollback
- Extensive testing with production-like data

#### Risk: Revision Conflict Resolution Breaks
**Likelihood**: MEDIUM | **Impact**: HIGH
**Mitigation**:
- Preserve exact revision tracking behavior
- Test concurrent access scenarios extensively
- Implement fallback conflict resolution
- Monitor revision behavior post-migration

### MEDIUM RISKS

#### Risk: Performance Degradation
**Likelihood**: MEDIUM | **Impact**: MEDIUM
**Mitigation**:
- Benchmark current performance
- Optimize query patterns for single database
- Implement lazy loading where appropriate
- Monitor performance metrics post-deployment

#### Risk: Import/Export Compatibility Issues
**Likelihood**: LOW | **Impact**: MEDIUM
**Mitigation**:
- Maintain backward compatibility for exports
- Test import/export with various data formats
- Provide migration tools for old export files
- Document any format changes clearly

### LOW RISKS

#### Risk: Browser Storage Limits
**Likelihood**: LOW | **Impact**: LOW
**Mitigation**:
- Monitor database size growth
- Implement data archiving if needed
- Provide storage usage indicators
- Add cleanup utilities for old data

## Success Criteria

### Functional Requirements
- [ ] All existing functionality works identically
- [ ] No breaking changes to component interfaces
- [ ] Import/export works with same file formats
- [ ] Auto-save behavior preserved exactly
- [ ] Revision conflict resolution unchanged

### Performance Requirements
- [ ] Database operations ≤ 10% slower than current
- [ ] Memory usage ≤ 20% higher than current
- [ ] Application startup time unchanged
- [ ] Large dataset handling improved or equal

### Data Integrity Requirements
- [ ] Zero data loss during migration
- [ ] All revisions preserved correctly
- [ ] Document relationships maintained
- [ ] UUID consistency preserved

### User Experience Requirements
- [ ] No UI changes or workflow disruptions
- [ ] Migration process is transparent to users
- [ ] Error states handled gracefully
- [ ] Performance feels identical or better

## Post-Implementation Monitoring

### Metrics to Track
- Database operation latency
- Memory usage patterns
- Error rates and types
- User-reported issues
- Data integrity checks

### Success Indicators (30 days post-deployment)
- Zero data loss incidents
- Error rate < 0.1%
- Performance within acceptable bounds
- No user complaints about functionality changes
- Successful completion of all automated tests

## Dependencies & Prerequisites

### Technical Dependencies
- PouchDB version compatibility maintained
- React/TypeScript version compatibility
- Browser storage API support
- UUID generation library consistency

### Data Prerequisites
- Current databases accessible and uncorrupted
- No concurrent modifications during migration
- Sufficient browser storage space available
- Network connectivity for any remote syncing

## Conclusion

This consolidation will improve the application's architecture by:
1. Simplifying database management to a single instance
2. Enabling better query optimization and performance
3. Reducing complexity in data operations
4. Maintaining full backward compatibility
5. Preserving all existing functionality

The implementation follows a conservative approach prioritizing data safety and user experience over aggressive optimization, ensuring a smooth transition with comprehensive testing and rollback capabilities.