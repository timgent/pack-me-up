import type { PackingListQuestionSet, Question, Person, Item } from '../edit-questions/types'

function ms(ts: string | undefined): number {
  return ts ? new Date(ts).getTime() : 0
}

function resolveQuestion(
  local: Question,
  pod: Question,
  docLevelNewerIsLocal: boolean,
): Question {
  const localMs = local.lastModified ? ms(local.lastModified) : null
  const podMs   = pod.lastModified   ? ms(pod.lastModified)   : null

  if (localMs !== null && podMs !== null) {
    return podMs >= localMs ? pod : local
  }
  return docLevelNewerIsLocal ? local : pod
}

function resolvePerson(
  local: Person,
  pod: Person,
  docLevelNewerIsLocal: boolean,
): Person {
  const localMs = local.lastModified ? ms(local.lastModified) : null
  const podMs   = pod.lastModified   ? ms(pod.lastModified)   : null

  if (localMs !== null && podMs !== null) {
    return podMs >= localMs ? pod : local
  }
  return docLevelNewerIsLocal ? local : pod
}

function resolveItem(
  local: Item,
  pod: Item,
  docLevelNewerIsLocal: boolean,
): Item {
  const localMs = local.lastModified ? ms(local.lastModified) : null
  const podMs   = pod.lastModified   ? ms(pod.lastModified)   : null

  if (localMs !== null && podMs !== null) {
    return podMs >= localMs ? pod : local
  }
  return docLevelNewerIsLocal ? local : pod
}

function mergeItemsById(
  localItems: Item[],
  podItems: Item[],
  docLevelNewerIsLocal: boolean,
): Item[] {
  const localMap = new Map(localItems.map(i => [i.id!, i]))
  const podMap   = new Map(podItems.map(i => [i.id!, i]))
  const allIds   = new Set([...localMap.keys(), ...podMap.keys()])

  const result: Item[] = []
  for (const id of allIds) {
    const localItem = localMap.get(id)
    const podItem   = podMap.get(id)
    if (localItem && podItem) {
      const localDeleted = localItem.deletedAt
      const podDeleted   = podItem.deletedAt
      if (localDeleted || podDeleted) {
        // delete-wins: keep whichever has deletedAt (prefer later deletedAt on tie)
        if (localDeleted && podDeleted) {
          result.push(ms(podDeleted) >= ms(localDeleted) ? podItem : localItem)
        } else {
          result.push(localDeleted ? localItem : podItem)
        }
      } else {
        result.push(resolveItem(localItem, podItem, docLevelNewerIsLocal))
      }
    } else {
      result.push((localItem ?? podItem)!)
    }
  }
  // Ordered items first by their order; legacy items (no order) keep their
  // relative position at the end. Sort is stable so ties preserve insertion.
  return result.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
}

export function mergeQuestionSets(
  local: PackingListQuestionSet,
  pod: PackingListQuestionSet,
): PackingListQuestionSet {
  const localMs = ms(local.lastModified)
  const podMs   = ms(pod.lastModified)
  const newer = podMs >= localMs ? pod : local
  const docLevelNewerIsLocal = localMs > podMs

  // ── Questions ──────────────────────────────────────────────────────────────
  const localQMap = new Map(local.questions.map(q => [q.id, q]))
  const podQMap   = new Map(pod.questions.map(q => [q.id, q]))
  const allQIds   = new Set([...localQMap.keys(), ...podQMap.keys()])

  const questions: Question[] = []
  for (const id of allQIds) {
    const localQ = localQMap.get(id)
    const podQ   = podQMap.get(id)
    if (localQ && podQ) {
      const localDeleted = localQ.deletedAt
      const podDeleted   = podQ.deletedAt
      if (localDeleted || podDeleted) {
        if (localDeleted && podDeleted) {
          questions.push(ms(podDeleted) >= ms(localDeleted) ? podQ : localQ)
        } else {
          questions.push(localDeleted ? localQ : podQ)
        }
      } else {
        questions.push(resolveQuestion(localQ, podQ, docLevelNewerIsLocal))
      }
    } else {
      questions.push((localQ ?? podQ)!)
    }
  }
  // A reorder bumps the moved questions' order + lastModified, so per-question
  // LWW carries the new positions — sorting here makes them take effect.
  questions.sort((a, b) => a.order - b.order)

  // ── People ─────────────────────────────────────────────────────────────────
  const localPMap = new Map(local.people.map(p => [p.id, p]))
  const podPMap   = new Map(pod.people.map(p => [p.id, p]))
  const allPIds   = new Set([...localPMap.keys(), ...podPMap.keys()])

  const people: Person[] = []
  for (const id of allPIds) {
    const localP = localPMap.get(id)
    const podP   = podPMap.get(id)
    if (localP && podP) {
      const localDeleted = localP.deletedAt
      const podDeleted   = podP.deletedAt
      if (localDeleted || podDeleted) {
        if (localDeleted && podDeleted) {
          people.push(ms(podDeleted) >= ms(localDeleted) ? podP : localP)
        } else {
          people.push(localDeleted ? localP : podP)
        }
      } else {
        people.push(resolvePerson(localP, podP, docLevelNewerIsLocal))
      }
    } else {
      people.push((localP ?? podP)!)
    }
  }

  // ── alwaysNeededItems ──────────────────────────────────────────────────────
  // If all items on both sides have IDs, merge per-item; otherwise doc-level LWW.
  const localItems = local.alwaysNeededItems ?? []
  const podItems   = pod.alwaysNeededItems ?? []
  const allHaveIds =
    localItems.every(i => i.id) && podItems.every(i => i.id)

  const alwaysNeededItems = allHaveIds && (localItems.length > 0 || podItems.length > 0)
    ? mergeItemsById(localItems, podItems, docLevelNewerIsLocal)
    : newer.alwaysNeededItems ?? []

  return {
    ...newer,
    questions,
    people,
    alwaysNeededItems,
  }
}
