import { PackingList, PackingListItem } from '../create-packing-list/types'

function resolveItem(
  localItem: PackingListItem,
  podItem: PackingListItem,
  listLevelNewerIsLocal: boolean,
): PackingListItem {
  const localItemMs = localItem.lastModified ? new Date(localItem.lastModified).getTime() : null
  const podItemMs = podItem.lastModified ? new Date(podItem.lastModified).getTime() : null

  if (localItemMs !== null && podItemMs !== null) {
    return podItemMs >= localItemMs ? podItem : localItem
  }
  return listLevelNewerIsLocal ? localItem : podItem
}

export function mergePackingLists(local: PackingList, pod: PackingList): PackingList {
  const localMs = local.lastModified ? new Date(local.lastModified).getTime() : 0
  const podMs = pod.lastModified ? new Date(pod.lastModified).getTime() : 0
  const [newer] = podMs >= localMs ? [pod, local] : [local, pod]
  const listLevelNewerIsLocal = localMs > podMs

  const localItemMap = new Map(local.items.map(i => [i.id, i]))
  const podItemMap = new Map(pod.items.map(i => [i.id, i]))
  const allIds = new Set([...localItemMap.keys(), ...podItemMap.keys()])

  const itemMap = new Map<string, PackingListItem>()
  for (const id of allIds) {
    const localItem = localItemMap.get(id)
    const podItem = podItemMap.get(id)
    if (localItem && podItem) {
      itemMap.set(id, resolveItem(localItem, podItem, listLevelNewerIsLocal))
    } else {
      itemMap.set(id, (localItem ?? podItem)!)
    }
  }

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
