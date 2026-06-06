import { PackingList, PackingListItem } from '../create-packing-list/types'

export function mergePackingLists(local: PackingList, pod: PackingList): PackingList {
  const localMs = local.lastModified ? new Date(local.lastModified).getTime() : 0
  const podMs = pod.lastModified ? new Date(pod.lastModified).getTime() : 0
  const [newer, older] = podMs >= localMs ? [pod, local] : [local, pod]

  // Build item map: older items first, then overlay newer (LWW per item by list timestamp)
  const itemMap = new Map<string, PackingListItem>()
  for (const item of [...older.items, ...newer.items]) itemMap.set(item.id, item)

  // Union of deleted IDs from both versions (delete-wins)
  const deletedIds = new Set([
    ...(local.deletedItems ?? []).map(i => i.id),
    ...(pod.deletedItems ?? []).map(i => i.id),
  ])

  // Union of deleted item objects, deduplicated by ID
  const deletedMap = new Map<string, PackingListItem>()
  for (const item of [...(local.deletedItems ?? []), ...(pod.deletedItems ?? [])]) {
    deletedMap.set(item.id, item)
  }

  return {
    ...newer,
    items: [...itemMap.values()].filter(i => !deletedIds.has(i.id)),
    deletedItems: [...deletedMap.values()],
  }
}
