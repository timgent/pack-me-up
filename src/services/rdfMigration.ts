import type { Session } from '@inrupt/solid-client-authn-browser'
import { createSolidDataset } from '@inrupt/solid-client'
import {
    loadFileFromPod,
    loadMultipleFilesFromPod,
    saveRdfToPod,
    POD_CONTAINERS,
} from './solidPod'
import { packingListToDataset, questionSetToDataset } from './rdfSerialization'
import type { PackingListQuestionSet } from '../edit-questions/types'
import type { PackingList } from '../create-packing-list/types'

export interface MigrationResult {
    questionSetMigrated: boolean
    packingListsMigrated: number
    errors: string[]
}

function getStatusCode(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null) return undefined
    const code = (err as { statusCode?: unknown }).statusCode
    return typeof code === 'number' ? code : undefined
}

export async function detectPodDataFormat(
    session: Session,
    podUrl: string
): Promise<'rdf' | 'json' | 'empty'> {
    // Fast path: migration marker exists
    try {
        await loadFileFromPod({ session, fileUrl: `${podUrl}${POD_CONTAINERS.MIGRATION_MARKER}` })
        return 'rdf'
    } catch (err) {
        if (getStatusCode(err) !== 404) throw err
    }

    // Check for RDF questions file
    try {
        await loadFileFromPod({ session, fileUrl: `${podUrl}${POD_CONTAINERS.QUESTIONS}` })
        return 'rdf'
    } catch (err) {
        if (getStatusCode(err) !== 404) throw err
    }

    // Check for legacy JSON questions file
    try {
        await loadFileFromPod({ session, fileUrl: `${podUrl}${POD_CONTAINERS.QUESTIONS_LEGACY_JSON}` })
        return 'json'
    } catch (err) {
        if (getStatusCode(err) !== 404) throw err
    }

    return 'empty'
}

export async function migrateJsonToRdf(
    session: Session,
    podUrl: string
): Promise<MigrationResult> {
    const errors: string[] = []
    let questionSetMigrated = false
    let packingListsMigrated = 0

    // 1. Migrate question set
    try {
        const qs = await loadFileFromPod<PackingListQuestionSet>({
            session,
            fileUrl: `${podUrl}${POD_CONTAINERS.QUESTIONS_LEGACY_JSON}`,
        })
        const qsUrl = `${podUrl}${POD_CONTAINERS.QUESTIONS}`
        await saveRdfToPod({
            session,
            fileUrl: qsUrl,
            data: qs,
            serializer: (data, url) => questionSetToDataset(data, url),
        })
        questionSetMigrated = true
    } catch (err) {
        if (getStatusCode(err) !== 404) {
            const msg = err instanceof Error ? err.message : String(err)
            errors.push(`question set: ${msg}`)
            console.error('rdfMigration: failed to migrate question set', err)
        }
        // 404 = no question set to migrate, that's fine
    }

    // 2. Migrate packing lists
    try {
        const { data: lists } = await loadMultipleFilesFromPod<PackingList>({
            session,
            containerPath: `${podUrl}${POD_CONTAINERS.PACKING_LISTS}`,
        })

        for (const list of lists) {
            try {
                const listUrl = `${podUrl}${POD_CONTAINERS.PACKING_LISTS}${list.id}.ttl`
                await saveRdfToPod({
                    session,
                    fileUrl: listUrl,
                    data: list,
                    serializer: (data, url) => packingListToDataset(data, url),
                })
                packingListsMigrated++
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                errors.push(`list ${list.id}: ${msg}`)
                console.error(`rdfMigration: failed to migrate list ${list.id}`, err)
            }
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`packing lists container: ${msg}`)
        console.error('rdfMigration: failed to load packing lists', err)
    }

    // 3. Write migration marker (always, even on partial failure)
    try {
        await saveRdfToPod({
            session,
            fileUrl: `${podUrl}${POD_CONTAINERS.MIGRATION_MARKER}`,
            data: null,
            serializer: () => createSolidDataset(),
        })
    } catch (err) {
        console.error('rdfMigration: failed to write migration marker', err)
    }

    return { questionSetMigrated, packingListsMigrated, errors }
}
