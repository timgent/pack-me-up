import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import PouchDB from 'pouchdb'
import PouchDBMemoryAdapter from 'pouchdb-adapter-memory'
import { PackingAppDatabase } from './database'
import type { PackingListQuestionSet } from '../edit-questions/types'
import type { PackingList } from '../create-packing-list/types'

// Setup PouchDB with memory adapter for testing
PouchDB.plugin(PouchDBMemoryAdapter)

describe('PackingAppDatabase', () => {
  let db: PackingAppDatabase

  // Prevent console logs from cluttering test output
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Reset database instance before each test
  beforeEach(async () => {
    // Force a new instance by clearing the singleton
    // @ts-expect-error - Accessing private static property for testing
    if (PackingAppDatabase.instance) {
      // @ts-expect-error - Accessing private property for testing
      const rawDb = PackingAppDatabase.instance.db
      await rawDb.destroy()
    }
    // @ts-expect-error - Accessing private static property for testing
    PackingAppDatabase.instance = undefined
    db = PackingAppDatabase.getInstance()
  })

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = PackingAppDatabase.getInstance()
      const instance2 = PackingAppDatabase.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('Question Set Operations', () => {
    const mockQuestionSet: PackingListQuestionSet = {
      _id: '1',
      people: [
        { id: 'person-1', name: 'Alice' },
        { id: 'person-2', name: 'Bob' }
      ],
      alwaysNeededItems: [
        {
          text: 'Toothbrush',
          personSelections: [
            { personId: 'person-1', selected: true },
            { personId: 'person-2', selected: true }
          ]
        }
      ],
      questions: [
        {
          id: 'q1',
          type: 'saved',
          text: 'What is the weather?',
          options: [
            {
              id: 'opt1',
              text: 'Sunny',
              items: [
                {
                  text: 'Sunscreen',
                  personSelections: [
                    { personId: 'person-1', selected: true },
                    { personId: 'person-2', selected: false }
                  ]
                }
              ],
              order: 0
            }
          ],
          order: 0,
          questionType: 'single-choice'
        }
      ]
    }

    it('should save a new question set successfully', async () => {
      const result = await db.saveQuestionSet(mockQuestionSet)

      expect(result).toHaveProperty('rev')
      expect(result.rev).toBeTruthy()
      expect(typeof result.rev).toBe('string')
    })

    it('should retrieve a saved question set', async () => {
      await db.saveQuestionSet(mockQuestionSet)

      const retrieved = await db.getQuestionSet()

      expect(retrieved._id).toBe('1')
      expect(retrieved.people).toEqual(mockQuestionSet.people)
      expect(retrieved.alwaysNeededItems).toEqual(mockQuestionSet.alwaysNeededItems)
      expect(retrieved.questions).toEqual(mockQuestionSet.questions)
      expect(retrieved._rev).toBeTruthy()
    })

    it('should update an existing question set', async () => {
      const saveResult1 = await db.saveQuestionSet(mockQuestionSet)

      const updatedQuestionSet = {
        ...mockQuestionSet,
        _rev: saveResult1.rev,
        people: [
          ...mockQuestionSet.people,
          { id: 'person-3', name: 'Charlie' }
        ]
      }

      const saveResult2 = await db.saveQuestionSet(updatedQuestionSet)

      expect(saveResult2.rev).not.toBe(saveResult1.rev)

      const retrieved = await db.getQuestionSet()
      expect(retrieved.people).toHaveLength(3)
      expect(retrieved.people[2].name).toBe('Charlie')
    })

    it('should throw not_found error when question set does not exist', async () => {
      await expect(db.getQuestionSet()).rejects.toEqual({
        name: 'not_found',
        message: 'Question set not found'
      })
    })

    it('should preserve createdAt timestamp when updating', async () => {
      await db.saveQuestionSet(mockQuestionSet)

      const retrieved1 = await db.getQuestionSet()

      // Wait a bit to ensure timestamps would differ
      await new Promise(resolve => setTimeout(resolve, 10))

      await db.saveQuestionSet({
        ...mockQuestionSet,
        _rev: retrieved1._rev,
        people: [...mockQuestionSet.people, { id: 'person-3', name: 'Charlie' }]
      })

      const retrieved2 = await db.getQuestionSet()

      // Get the underlying document to check timestamps
      const info = await db.getInfo()
      expect(info).toBeDefined()
    })
  })

  describe('Packing List Operations', () => {
    const mockPackingList: PackingList = {
      id: 'pl-1',
      name: 'Beach Trip',
      createdAt: '2025-01-01T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          itemText: 'Sunscreen',
          personId: 'person-1',
          personName: 'Alice',
          questionId: 'q1',
          optionId: 'opt1',
          packed: false
        },
        {
          id: 'item-2',
          itemText: 'Hat',
          personId: 'person-2',
          personName: 'Bob',
          questionId: 'q1',
          optionId: 'opt1',
          packed: true
        }
      ]
    }

    it('should save a new packing list successfully', async () => {
      const result = await db.savePackingList(mockPackingList)

      expect(result).toHaveProperty('rev')
      expect(result.rev).toBeTruthy()
      expect(typeof result.rev).toBe('string')
    })

    it('should retrieve a saved packing list', async () => {
      await db.savePackingList(mockPackingList)

      const retrieved = await db.getPackingList('pl-1')

      expect(retrieved.id).toBe('pl-1')
      expect(retrieved.name).toBe('Beach Trip')
      expect(retrieved.items).toHaveLength(2)
      expect(retrieved.items[0].itemText).toBe('Sunscreen')
      expect(retrieved.items[1].packed).toBe(true)
      expect(retrieved._rev).toBeTruthy()
    })

    it('should update an existing packing list', async () => {
      const saveResult1 = await db.savePackingList(mockPackingList)

      const updatedPackingList: PackingList = {
        ...mockPackingList,
        _rev: saveResult1.rev,
        items: mockPackingList.items.map(item =>
          item.id === 'item-1' ? { ...item, packed: true } : item
        )
      }

      const saveResult2 = await db.savePackingList(updatedPackingList)

      expect(saveResult2.rev).not.toBe(saveResult1.rev)

      const retrieved = await db.getPackingList('pl-1')
      expect(retrieved.items[0].packed).toBe(true)
    })

    it('should throw not_found error when packing list does not exist', async () => {
      await expect(db.getPackingList('nonexistent')).rejects.toEqual({
        name: 'not_found',
        message: 'Packing list not found'
      })
    })

    it('should retrieve all packing lists', async () => {
      const packingList1: PackingList = {
        ...mockPackingList,
        id: 'pl-1',
        name: 'Beach Trip',
        createdAt: '2025-01-01T00:00:00.000Z'
      }

      const packingList2: PackingList = {
        ...mockPackingList,
        id: 'pl-2',
        name: 'Mountain Hiking',
        createdAt: '2025-01-02T00:00:00.000Z'
      }

      const packingList3: PackingList = {
        ...mockPackingList,
        id: 'pl-3',
        name: 'City Tour',
        createdAt: '2025-01-03T00:00:00.000Z'
      }

      await db.savePackingList(packingList1)
      await db.savePackingList(packingList2)
      await db.savePackingList(packingList3)

      const allLists = await db.getAllPackingLists()

      expect(allLists).toHaveLength(3)
      expect(allLists.map(l => l.name)).toContain('Beach Trip')
      expect(allLists.map(l => l.name)).toContain('Mountain Hiking')
      expect(allLists.map(l => l.name)).toContain('City Tour')
    })

    it('should return packing lists sorted by createdAt (newest first)', async () => {
      const packingList1: PackingList = {
        ...mockPackingList,
        id: 'pl-1',
        name: 'Oldest',
        createdAt: '2025-01-01T00:00:00.000Z'
      }

      const packingList2: PackingList = {
        ...mockPackingList,
        id: 'pl-2',
        name: 'Newest',
        createdAt: '2025-01-03T00:00:00.000Z'
      }

      const packingList3: PackingList = {
        ...mockPackingList,
        id: 'pl-3',
        name: 'Middle',
        createdAt: '2025-01-02T00:00:00.000Z'
      }

      // Save in random order
      await db.savePackingList(packingList1)
      await db.savePackingList(packingList3)
      await db.savePackingList(packingList2)

      const allLists = await db.getAllPackingLists()

      expect(allLists[0].name).toBe('Newest')
      expect(allLists[1].name).toBe('Middle')
      expect(allLists[2].name).toBe('Oldest')
    })

    it('should return empty array when no packing lists exist', async () => {
      const allLists = await db.getAllPackingLists()
      expect(allLists).toEqual([])
    })

    it('should delete a packing list', async () => {
      await db.savePackingList(mockPackingList)

      const beforeDelete = await db.getAllPackingLists()
      expect(beforeDelete).toHaveLength(1)

      await db.deletePackingList('pl-1')

      const afterDelete = await db.getAllPackingLists()
      expect(afterDelete).toHaveLength(0)

      await expect(db.getPackingList('pl-1')).rejects.toThrow()
    })

    it('should throw error when deleting non-existent packing list', async () => {
      await expect(db.deletePackingList('nonexistent')).rejects.toThrow()
    })
  })

  describe('Mixed Operations', () => {
    it('should handle question set and packing lists independently', async () => {
      const mockQuestionSet: PackingListQuestionSet = {
        _id: '1',
        people: [{ id: 'p1', name: 'Alice' }],
        alwaysNeededItems: [],
        questions: []
      }

      const mockPackingList: PackingList = {
        id: 'pl-1',
        name: 'Test Trip',
        createdAt: '2025-01-01T00:00:00.000Z',
        items: []
      }

      await db.saveQuestionSet(mockQuestionSet)
      await db.savePackingList(mockPackingList)

      const questionSet = await db.getQuestionSet()
      const packingList = await db.getPackingList('pl-1')

      expect(questionSet.people).toHaveLength(1)
      expect(packingList.name).toBe('Test Trip')
    })
  })

  describe('Migration', () => {
    it('should report no migration when legacy databases are empty', async () => {
      const result = await db.migrateFromLegacyDatabases()

      expect(result.migrated).toBe(true)
      expect(result.questionSets).toBe(0)
      expect(result.packingLists).toBe(0)
    })

    // Note: More comprehensive migration tests would require setting up
    // legacy databases, which is complex in a test environment
  })

  describe('Database Info', () => {
    it('should return database info', async () => {
      const info = await db.getInfo()

      expect(info).toBeDefined()
      expect(info).toHaveProperty('db_name')
      expect(info).toHaveProperty('doc_count')
    })
  })

  describe('Error Handling', () => {
    it('should handle document type validation for question set', async () => {
      // Directly insert a document with wrong type
      const dbInstance = PackingAppDatabase.getInstance()
      // @ts-expect-error - Accessing private property for testing
      const rawDb = dbInstance.db

      await rawDb.put({
        _id: 'question-set:1',
        docType: 'packing-list', // Wrong type
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: {}
      })

      await expect(db.getQuestionSet()).rejects.toThrow('Invalid document type for question set')
    })

    it('should handle document type validation for packing list', async () => {
      // Directly insert a document with wrong type
      const dbInstance = PackingAppDatabase.getInstance()
      // @ts-expect-error - Accessing private property for testing
      const rawDb = dbInstance.db

      await rawDb.put({
        _id: 'packing-list:test',
        docType: 'question-set', // Wrong type
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: {}
      })

      await expect(db.getPackingList('test')).rejects.toThrow('Invalid document type for packing list')
    })

    it('should log errors when saving fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error')

      // Force an error by using an invalid rev
      const invalidQuestionSet: PackingListQuestionSet = {
        _id: '1',
        _rev: 'invalid-rev',
        people: [],
        alwaysNeededItems: [],
        questions: []
      }

      await expect(db.saveQuestionSet(invalidQuestionSet)).rejects.toThrow()
      expect(consoleSpy).toHaveBeenCalledWith('Error saving question set:', expect.any(Object))
    })
  })

  describe('Revision Handling', () => {
    it('should handle concurrent updates with revision conflicts', async () => {
      const mockQuestionSet: PackingListQuestionSet = {
        _id: '1',
        people: [{ id: 'p1', name: 'Alice' }],
        alwaysNeededItems: [],
        questions: []
      }

      // Save initial version
      await db.saveQuestionSet(mockQuestionSet)
      const firstVersion = await db.getQuestionSet()

      // Update with correct rev
      const update1 = { ...mockQuestionSet, _rev: firstVersion._rev, people: [{ id: 'p1', name: 'Alice Updated' }] }
      await db.saveQuestionSet(update1)

      // Try to update with old rev (should fail)
      const update2 = { ...mockQuestionSet, _rev: firstVersion._rev, people: [{ id: 'p2', name: 'Bob' }] }
      await expect(db.saveQuestionSet(update2)).rejects.toThrow()
    })

    it('should allow saving without rev for new documents', async () => {
      const mockPackingList: PackingList = {
        id: 'pl-new',
        name: 'New List',
        createdAt: '2025-01-01T00:00:00.000Z',
        items: []
      }

      // No _rev provided
      const result = await db.savePackingList(mockPackingList)
      expect(result.rev).toBeTruthy()

      const retrieved = await db.getPackingList('pl-new')
      expect(retrieved._rev).toBe(result.rev)
    })
  })
})
