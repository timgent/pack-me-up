import { describe, it, expect } from 'vitest'
import { mergePackingLists } from './mergePackingLists'
import { PackingList, PackingListItem } from '../create-packing-list/types'

const makeItem = (overrides: Partial<PackingListItem> = {}): PackingListItem => ({
  id: 'item-1',
  itemText: 'Toothbrush',
  personId: 'person-1',
  personName: 'Alice',
  questionId: 'q-1',
  optionId: 'opt-1',
  packed: false,
  ...overrides,
})

const makeList = (overrides: Partial<PackingList> = {}): PackingList => ({
  id: 'list-1',
  name: 'Trip',
  createdAt: '2024-01-01T00:00:00.000Z',
  lastModified: '2024-01-01T10:00:00.000Z',
  items: [],
  ...overrides,
})

describe('mergePackingLists', () => {
  describe('concurrent adds', () => {
    it('preserves items added by both users', () => {
      const itemP = makeItem({ id: 'item-P', itemText: 'Passport' })
      const itemQ = makeItem({ id: 'item-Q', itemText: 'Sunscreen' })

      const local = makeList({
        items: [itemP],
        lastModified: '2024-01-01T10:00:00.000Z',
      })
      const pod = makeList({
        items: [itemQ],
        lastModified: '2024-01-01T10:00:01.000Z',
      })

      const result = mergePackingLists(local, pod)

      expect(result.items).toHaveLength(2)
      expect(result.items.map(i => i.id)).toEqual(expect.arrayContaining(['item-P', 'item-Q']))
    })

    it('preserves all pre-existing shared items alongside newly added ones', () => {
      const shared = makeItem({ id: 'item-X', itemText: 'Shoes' })
      const itemP = makeItem({ id: 'item-P', itemText: 'Passport' })
      const itemQ = makeItem({ id: 'item-Q', itemText: 'Sunscreen' })

      const local = makeList({
        items: [shared, itemP],
        lastModified: '2024-01-01T10:00:00.000Z',
      })
      const pod = makeList({
        items: [shared, itemQ],
        lastModified: '2024-01-01T10:00:01.000Z',
      })

      const result = mergePackingLists(local, pod)

      expect(result.items).toHaveLength(3)
      expect(result.items.map(i => i.id)).toEqual(expect.arrayContaining(['item-X', 'item-P', 'item-Q']))
    })
  })

  describe('metadata', () => {
    it('uses newer list metadata for list-level fields', () => {
      const local = makeList({
        name: 'Old name',
        lastModified: '2024-01-01T10:00:00.000Z',
      })
      const pod = makeList({
        name: 'New name',
        lastModified: '2024-01-01T10:00:01.000Z',
      })

      const result = mergePackingLists(local, pod)

      expect(result.name).toBe('New name')
      expect(result.lastModified).toBe('2024-01-01T10:00:01.000Z')
    })

    it('uses local metadata when local is newer', () => {
      const local = makeList({
        name: 'Local name',
        lastModified: '2024-01-01T10:00:02.000Z',
      })
      const pod = makeList({
        name: 'Pod name',
        lastModified: '2024-01-01T10:00:00.000Z',
      })

      const result = mergePackingLists(local, pod)

      expect(result.name).toBe('Local name')
    })
  })

  describe('same item field conflicts', () => {
    it('uses newer list version of an item when both sides have same item ID', () => {
      const itemInPod = makeItem({ id: 'item-1', packed: true })
      const itemInLocal = makeItem({ id: 'item-1', packed: false })

      const local = makeList({
        items: [itemInLocal],
        lastModified: '2024-01-01T10:00:00.000Z',
      })
      const pod = makeList({
        items: [itemInPod],
        lastModified: '2024-01-01T10:00:01.000Z',
      })

      const result = mergePackingLists(local, pod)

      expect(result.items).toHaveLength(1)
      expect(result.items[0].packed).toBe(true)
    })
  })

  describe('deletions', () => {
    it('excludes items that appear in either deletedItems list (delete-wins)', () => {
      const itemA = makeItem({ id: 'item-A', itemText: 'A' })
      const itemB = makeItem({ id: 'item-B', itemText: 'B' })

      const local = makeList({
        items: [itemA, itemB],
        lastModified: '2024-01-01T10:00:00.000Z',
      })
      const pod = makeList({
        items: [itemA],
        deletedItems: [itemB],
        lastModified: '2024-01-01T10:00:01.000Z',
      })

      const result = mergePackingLists(local, pod)

      expect(result.items.map(i => i.id)).not.toContain('item-B')
      expect(result.deletedItems?.map(i => i.id)).toContain('item-B')
    })

    it('unions deletedItems from both sides', () => {
      const itemA = makeItem({ id: 'item-A', itemText: 'A' })
      const itemB = makeItem({ id: 'item-B', itemText: 'B' })
      const itemC = makeItem({ id: 'item-C', itemText: 'C' })

      const local = makeList({
        items: [itemC],
        deletedItems: [itemA],
        lastModified: '2024-01-01T10:00:00.000Z',
      })
      const pod = makeList({
        items: [itemC],
        deletedItems: [itemB],
        lastModified: '2024-01-01T10:00:01.000Z',
      })

      const result = mergePackingLists(local, pod)

      expect(result.deletedItems?.map(i => i.id)).toEqual(expect.arrayContaining(['item-A', 'item-B']))
    })

    it('add-vs-delete conflict: delete wins', () => {
      const itemA = makeItem({ id: 'item-A', itemText: 'A' })

      // Local still has the item; pod has deleted it
      const local = makeList({
        items: [itemA],
        lastModified: '2024-01-01T10:00:00.000Z',
      })
      const pod = makeList({
        items: [],
        deletedItems: [itemA],
        lastModified: '2024-01-01T10:00:01.000Z',
      })

      const result = mergePackingLists(local, pod)

      expect(result.items).toHaveLength(0)
      expect(result.deletedItems?.map(i => i.id)).toContain('item-A')
    })
  })

  describe('edge cases', () => {
    it('handles local with no items', () => {
      const itemQ = makeItem({ id: 'item-Q', itemText: 'Sunscreen' })

      const local = makeList({ items: [], lastModified: '2024-01-01T10:00:00.000Z' })
      const pod = makeList({ items: [itemQ], lastModified: '2024-01-01T10:00:01.000Z' })

      const result = mergePackingLists(local, pod)

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe('item-Q')
    })

    it('handles pod with no items', () => {
      const itemP = makeItem({ id: 'item-P', itemText: 'Passport' })

      const local = makeList({ items: [itemP], lastModified: '2024-01-01T10:00:01.000Z' })
      const pod = makeList({ items: [], lastModified: '2024-01-01T10:00:00.000Z' })

      const result = mergePackingLists(local, pod)

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe('item-P')
    })

    it('returns stable result when both sides are identical', () => {
      const item = makeItem({ id: 'item-1' })
      const local = makeList({ items: [item], lastModified: '2024-01-01T10:00:00.000Z' })
      const pod = makeList({ items: [item], lastModified: '2024-01-01T10:00:00.000Z' })

      const result = mergePackingLists(local, pod)

      expect(result.items).toHaveLength(1)
    })

    it('handles missing lastModified on one side', () => {
      const itemP = makeItem({ id: 'item-P' })
      const itemQ = makeItem({ id: 'item-Q' })

      const local: PackingList = { ...makeList({ items: [itemP] }), lastModified: undefined }
      const pod = makeList({ items: [itemQ], lastModified: '2024-01-01T10:00:01.000Z' })

      const result = mergePackingLists(local, pod)

      expect(result.items.map(i => i.id)).toEqual(expect.arrayContaining(['item-P', 'item-Q']))
    })
  })
})
