import { describe, it, expect } from 'vitest'
import { mergeQuestionSets } from './mergeQuestionSets'
import type { PackingListQuestionSet, Question, Person, Item } from '../edit-questions/types'

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: 'Alice',
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    text: 'Do you need a car seat?',
    type: 'saved',
    order: 0,
    options: [],
    ...overrides,
  }
}

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: crypto.randomUUID(),
    text: 'Sunscreen',
    personSelections: [],
    ...overrides,
  }
}

function makeQS(overrides: Partial<PackingListQuestionSet> = {}): PackingListQuestionSet {
  return {
    _id: '1',
    people: [],
    questions: [],
    alwaysNeededItems: [],
    lastModified: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ── Concurrent adds ───────────────────────────────────────────────────────────

describe('concurrent question adds', () => {
  it('preserves both questions when each side added a unique one', () => {
    const q1 = makeQuestion({ id: 'q1', text: 'Question 1', lastModified: '2024-01-01T10:00:00.000Z' })
    const q2 = makeQuestion({ id: 'q2', text: 'Question 2', lastModified: '2024-01-01T11:00:00.000Z' })

    const local = makeQS({ questions: [q1], lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ questions: [q2], lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const ids = result.questions.filter(q => !q.deletedAt).map(q => q.id)
    expect(ids).toContain('q1')
    expect(ids).toContain('q2')
  })
})

describe('concurrent person adds', () => {
  it('preserves both people when each side added a unique one', () => {
    const p1 = makePerson({ id: 'p1', name: 'Alice', lastModified: '2024-01-01T10:00:00.000Z' })
    const p2 = makePerson({ id: 'p2', name: 'Bob',   lastModified: '2024-01-01T11:00:00.000Z' })

    const local = makeQS({ people: [p1], lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ people: [p2], lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const ids = result.people.filter(p => !p.deletedAt).map(p => p.id)
    expect(ids).toContain('p1')
    expect(ids).toContain('p2')
  })
})

// ── Delete-wins ───────────────────────────────────────────────────────────────

describe('delete-wins for questions', () => {
  it('pod deletedAt beats local active question', () => {
    const q = makeQuestion({ id: 'q1', lastModified: '2024-01-01T10:00:00.000Z' })
    const qDeleted = { ...q, deletedAt: '2024-01-01T11:00:00.000Z' }

    const local = makeQS({ questions: [q],        lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ questions: [qDeleted], lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const active = result.questions.filter(q => !q.deletedAt)
    expect(active.map(q => q.id)).not.toContain('q1')
  })

  it('local deletedAt beats pod active question', () => {
    const q = makeQuestion({ id: 'q1', lastModified: '2024-01-01T10:00:00.000Z' })
    const qDeleted = { ...q, deletedAt: '2024-01-01T09:00:00.000Z' }

    const local = makeQS({ questions: [qDeleted], lastModified: '2024-01-01T09:00:00.000Z' })
    const pod   = makeQS({ questions: [q],        lastModified: '2024-01-01T10:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const active = result.questions.filter(q => !q.deletedAt)
    expect(active.map(q => q.id)).not.toContain('q1')
  })

  it('deleted question is retained in the array so it propagates on next sync', () => {
    const q = makeQuestion({ id: 'q1' })
    const qDeleted = { ...q, deletedAt: '2024-01-01T11:00:00.000Z' }

    const local = makeQS({ questions: [q],        lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ questions: [qDeleted], lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    expect(result.questions.some(q => q.id === 'q1' && q.deletedAt)).toBe(true)
  })
})

describe('delete-wins for people', () => {
  it('pod deletedAt beats local active person', () => {
    const p = makePerson({ id: 'p1', lastModified: '2024-01-01T10:00:00.000Z' })
    const pDeleted = { ...p, deletedAt: '2024-01-01T11:00:00.000Z' }

    const local = makeQS({ people: [p],        lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ people: [pDeleted], lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const active = result.people.filter(p => !p.deletedAt)
    expect(active.map(p => p.id)).not.toContain('p1')
  })
})

// ── Per-entity LWW ────────────────────────────────────────────────────────────

describe('per-question LWW', () => {
  it('pod question wins when its lastModified is newer, even if doc-level is older', () => {
    const base = makeQuestion({ id: 'q1' })
    const localQ = { ...base, text: 'Local text', lastModified: '2024-01-01T09:00:00.000Z' }
    const podQ   = { ...base, text: 'Pod text',   lastModified: '2024-01-01T11:00:00.000Z' }

    // Local doc is newer at doc level, but pod question has newer per-question timestamp
    const local = makeQS({ questions: [localQ], lastModified: '2024-01-01T12:00:00.000Z' })
    const pod   = makeQS({ questions: [podQ],   lastModified: '2024-01-01T10:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const q = result.questions.find(q => q.id === 'q1')
    expect(q?.text).toBe('Pod text')
  })

  it('local question wins when its lastModified is newer', () => {
    const base = makeQuestion({ id: 'q1' })
    const localQ = { ...base, text: 'Local text', lastModified: '2024-01-01T12:00:00.000Z' }
    const podQ   = { ...base, text: 'Pod text',   lastModified: '2024-01-01T10:00:00.000Z' }

    const local = makeQS({ questions: [localQ], lastModified: '2024-01-01T09:00:00.000Z' })
    const pod   = makeQS({ questions: [podQ],   lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const q = result.questions.find(q => q.id === 'q1')
    expect(q?.text).toBe('Local text')
  })

  it('pod wins on timestamp tie', () => {
    const ts = '2024-01-01T10:00:00.000Z'
    const base = makeQuestion({ id: 'q1', lastModified: ts })
    const localQ = { ...base, text: 'Local text' }
    const podQ   = { ...base, text: 'Pod text' }

    const local = makeQS({ questions: [localQ], lastModified: ts })
    const pod   = makeQS({ questions: [podQ],   lastModified: ts })

    const result = mergeQuestionSets(local, pod)
    const q = result.questions.find(q => q.id === 'q1')
    expect(q?.text).toBe('Pod text')
  })
})

describe('per-person LWW', () => {
  it('pod person wins when its lastModified is newer', () => {
    const base = makePerson({ id: 'p1' })
    const localP = { ...base, name: 'Alice', lastModified: '2024-01-01T09:00:00.000Z' }
    const podP   = { ...base, name: 'Alicia', lastModified: '2024-01-01T11:00:00.000Z' }

    const local = makeQS({ people: [localP], lastModified: '2024-01-01T12:00:00.000Z' })
    const pod   = makeQS({ people: [podP],   lastModified: '2024-01-01T10:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const p = result.people.find(p => p.id === 'p1')
    expect(p?.name).toBe('Alicia')
  })
})

// ── Fallback to doc-level LWW ─────────────────────────────────────────────────

describe('fallback to doc-level LWW', () => {
  it('local question wins when local doc is newer and neither question has lastModified', () => {
    const localQ = makeQuestion({ id: 'q1', text: 'Local text' })
    const podQ   = makeQuestion({ id: 'q1', text: 'Pod text' })
    // No per-question lastModified on either

    const local = makeQS({ questions: [localQ], lastModified: '2024-01-01T12:00:00.000Z' })
    const pod   = makeQS({ questions: [podQ],   lastModified: '2024-01-01T10:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    expect(result.questions.find(q => q.id === 'q1')?.text).toBe('Local text')
  })

  it('pod question wins when pod doc is newer and neither question has lastModified', () => {
    const localQ = makeQuestion({ id: 'q1', text: 'Local text' })
    const podQ   = makeQuestion({ id: 'q1', text: 'Pod text' })

    const local = makeQS({ questions: [localQ], lastModified: '2024-01-01T09:00:00.000Z' })
    const pod   = makeQS({ questions: [podQ],   lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    expect(result.questions.find(q => q.id === 'q1')?.text).toBe('Pod text')
  })
})

// ── alwaysNeededItems ─────────────────────────────────────────────────────────

describe('alwaysNeededItems', () => {
  it('items with IDs are merged with add-wins', () => {
    const item1 = makeItem({ id: 'i1', text: 'Passport' })
    const item2 = makeItem({ id: 'i2', text: 'Sunscreen' })

    const local = makeQS({ alwaysNeededItems: [item1], lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ alwaysNeededItems: [item2], lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const active = result.alwaysNeededItems.filter(i => !i.deletedAt)
    const texts = active.map(i => i.text)
    expect(texts).toContain('Passport')
    expect(texts).toContain('Sunscreen')
  })

  it('item delete-wins: pod deletedAt removes item from active', () => {
    const item = makeItem({ id: 'i1', text: 'Passport' })
    const deletedItem = { ...item, deletedAt: '2024-01-01T11:00:00.000Z' }

    const local = makeQS({ alwaysNeededItems: [item],        lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ alwaysNeededItems: [deletedItem], lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const active = result.alwaysNeededItems.filter(i => !i.deletedAt)
    expect(active.map(i => i.id)).not.toContain('i1')
  })

  it('falls back to doc-level LWW when items have no IDs', () => {
    const localItem: Item = { text: 'Passport', personSelections: [] }
    const podItem: Item   = { text: 'Sunscreen', personSelections: [] }

    const local = makeQS({ alwaysNeededItems: [localItem], lastModified: '2024-01-01T12:00:00.000Z' })
    const pod   = makeQS({ alwaysNeededItems: [podItem],   lastModified: '2024-01-01T10:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    // Local is newer → local's items win
    expect(result.alwaysNeededItems.map(i => i.text)).toContain('Passport')
    expect(result.alwaysNeededItems.map(i => i.text)).not.toContain('Sunscreen')
  })
})

// ── deletedAt entities propagate ──────────────────────────────────────────────

describe('deleted entities survive in output for propagation', () => {
  it('question deletedAt from both sides are unioned', () => {
    const q1 = makeQuestion({ id: 'q1', deletedAt: '2024-01-01T10:00:00.000Z' })
    const q2 = makeQuestion({ id: 'q2', deletedAt: '2024-01-01T11:00:00.000Z' })

    const local = makeQS({ questions: [q1], lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ questions: [q2], lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    const deletedIds = result.questions.filter(q => q.deletedAt).map(q => q.id)
    expect(deletedIds).toContain('q1')
    expect(deletedIds).toContain('q2')
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty questions and people on both sides', () => {
    const local = makeQS({})
    const pod   = makeQS({ lastModified: '2024-01-01T11:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    expect(result.questions).toEqual([])
    expect(result.people).toEqual([])
  })

  it('returns stable result when both sides are identical', () => {
    const q = makeQuestion({ id: 'q1', lastModified: '2024-01-01T10:00:00.000Z' })
    const p = makePerson({ id: 'p1', lastModified: '2024-01-01T10:00:00.000Z' })
    const qs = makeQS({ questions: [q], people: [p] })

    const result = mergeQuestionSets(qs, qs)
    expect(result.questions.filter(q => !q.deletedAt)).toHaveLength(1)
    expect(result.people.filter(p => !p.deletedAt)).toHaveLength(1)
  })

  it('handles missing root lastModified on both sides', () => {
    const q1 = makeQuestion({ id: 'q1' })
    const q2 = makeQuestion({ id: 'q2' })
    const local: PackingListQuestionSet = { _id: '1', people: [], questions: [q1], alwaysNeededItems: [] }
    const pod:   PackingListQuestionSet = { _id: '1', people: [], questions: [q2], alwaysNeededItems: [] }

    const result = mergeQuestionSets(local, pod)
    const ids = result.questions.filter(q => !q.deletedAt).map(q => q.id)
    expect(ids).toContain('q1')
    expect(ids).toContain('q2')
  })
})

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('ordering flows through merge', () => {
  it('sorts merged questions by order so a reorder on one side wins', () => {
    const q1 = makeQuestion({ id: 'q1', text: 'Q1', order: 0, lastModified: '2024-01-01T10:00:00.000Z' })
    const q2 = makeQuestion({ id: 'q2', text: 'Q2', order: 1, lastModified: '2024-01-01T10:00:00.000Z' })
    // Pod reordered: q2 now first
    const podQ2 = { ...q2, order: 0, lastModified: '2024-01-01T12:00:00.000Z' }
    const podQ1 = { ...q1, order: 1, lastModified: '2024-01-01T12:00:00.000Z' }

    const local = makeQS({ questions: [q1, q2], lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ questions: [podQ2, podQ1], lastModified: '2024-01-01T12:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    expect(result.questions.map(q => q.id)).toEqual(['q2', 'q1'])
  })

  it('sorts merged alwaysNeededItems by order so a reorder on the pod side wins', () => {
    const a = makeItem({ id: 'a', text: 'Torch', order: 0, lastModified: '2024-01-01T10:00:00.000Z' })
    const b = makeItem({ id: 'b', text: 'Map', order: 1, lastModified: '2024-01-01T10:00:00.000Z' })
    // Pod reordered: b now first
    const podB = { ...b, order: 0, lastModified: '2024-01-01T12:00:00.000Z' }
    const podA = { ...a, order: 1, lastModified: '2024-01-01T12:00:00.000Z' }

    const local = makeQS({ alwaysNeededItems: [a, b], lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ alwaysNeededItems: [podB, podA], lastModified: '2024-01-01T12:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    expect(result.alwaysNeededItems.map(i => i.id)).toEqual(['b', 'a'])
  })

  it('keeps items without order after ordered ones, preserving legacy relative order', () => {
    const a = makeItem({ id: 'a', text: 'Torch', lastModified: '2024-01-01T10:00:00.000Z' })
    const b = makeItem({ id: 'b', text: 'Map', order: 0, lastModified: '2024-01-01T10:00:00.000Z' })
    const c = makeItem({ id: 'c', text: 'Compass', lastModified: '2024-01-01T10:00:00.000Z' })

    const local = makeQS({ alwaysNeededItems: [a, b, c], lastModified: '2024-01-01T10:00:00.000Z' })
    const pod   = makeQS({ alwaysNeededItems: [a, b, c], lastModified: '2024-01-01T10:00:00.000Z' })

    const result = mergeQuestionSets(local, pod)
    expect(result.alwaysNeededItems.map(i => i.id)).toEqual(['b', 'a', 'c'])
  })
})
