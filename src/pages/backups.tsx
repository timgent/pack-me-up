import { useEffect, useState, useCallback } from 'react'
import { useSolidPod } from '../components/SolidPodContext'
import { useDatabase } from '../components/DatabaseContext'
import { useToast } from '../components/ToastContext'
import { usePodErrorHandler } from '../hooks/usePodErrorHandler'
import { Button } from '../components/Button'
import { getPrimaryPodUrl } from '../services/solidPod'
import {
    createBackup,
    listBackups,
    deleteBackup,
    restoreBackup,
    BackupMetadata,
} from '../services/solidPodBackup'

export function BackupsPage() {
    const { isLoggedIn, session } = useSolidPod()
    const { db } = useDatabase()
    const { showToast } = useToast()
    const handlePodError = usePodErrorHandler()

    const [backups, setBackups] = useState<BackupMetadata[]>([])
    const [isLoadingBackups, setIsLoadingBackups] = useState(false)
    const [isCreating, setIsCreating] = useState(false)

    const fetchBackups = useCallback(async () => {
        if (!session || !isLoggedIn) return
        const podUrl = await getPrimaryPodUrl(session)
        if (!podUrl) return

        setIsLoadingBackups(true)
        try {
            const list = await listBackups(session, podUrl)
            setBackups(list)
        } catch (error) {
            handlePodError(error, 'Failed to load backups.')
        } finally {
            setIsLoadingBackups(false)
        }
    }, [session, isLoggedIn, handlePodError])

    useEffect(() => {
        if (isLoggedIn) {
            fetchBackups()
        }
    }, [isLoggedIn, fetchBackups])

    const handleCreateBackup = async () => {
        if (!session) return
        const podUrl = await getPrimaryPodUrl(session)
        if (!podUrl) {
            showToast('No pod found for your account', 'error')
            return
        }

        setIsCreating(true)
        try {
            await createBackup(session, podUrl, db)
            showToast('Backup created successfully!', 'success')
            await fetchBackups()
        } catch (error) {
            handlePodError(error, 'Failed to create backup.')
        } finally {
            setIsCreating(false)
        }
    }

    const handleRestore = async (backup: BackupMetadata) => {
        const confirmed = window.confirm(
            'This will replace all your current data. Are you sure?'
        )
        if (!confirmed) return

        if (!session) return
        const podUrl = await getPrimaryPodUrl(session)
        if (!podUrl) {
            showToast('No pod found for your account', 'error')
            return
        }

        try {
            await restoreBackup(session, podUrl, db, backup.url)
            showToast('Backup restored successfully!', 'success')
        } catch (error) {
            handlePodError(error, 'Failed to restore backup.')
        }
    }

    const handleDelete = async (backup: BackupMetadata) => {
        if (!session) return

        try {
            await deleteBackup(session, backup.url)
            setBackups(prev => prev.filter(b => b.url !== backup.url))
            showToast('Backup deleted.', 'success')
        } catch (error) {
            handlePodError(error, 'Failed to delete backup.')
        }
    }

    if (!isLoggedIn) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <h1 className="text-4xl font-bold text-primary-900 mb-4">Backups</h1>
                <p className="text-lg text-gray-700 font-medium">
                    Backups require a Solid Pod login. Please log in to manage your backups.
                </p>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-4xl font-bold text-primary-900">Backups</h1>
                    <p className="mt-2 text-lg text-gray-700 font-medium">
                        Create and restore backups of your packing data.
                    </p>
                </div>
                <Button
                    type="button"
                    variant="primary"
                    onClick={handleCreateBackup}
                    disabled={isCreating}
                >
                    {isCreating ? 'Creating...' : 'Create Backup'}
                </Button>
            </div>

            {isLoadingBackups ? (
                <div className="text-center py-12 text-gray-700 font-semibold">
                    Loading backups...
                </div>
            ) : backups.length === 0 ? (
                <div className="text-center py-12 bg-gradient-to-br from-primary-50 to-accent-50 rounded-2xl border-2 border-primary-200 shadow-soft">
                    <p className="text-lg text-gray-800 font-semibold">No backups yet</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {backups.map(backup => (
                        <div
                            key={backup.url}
                            className="bg-white rounded-2xl border-2 border-primary-200 shadow-soft p-5"
                        >
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="font-semibold text-gray-900">
                                        {new Date(backup.createdAt).toLocaleString()}
                                    </p>
                                    <p className="text-sm text-gray-600 mt-1">
                                        {backup.packingListCount} packing list{backup.packingListCount !== 1 ? 's' : ''}
                                        {backup.hasQuestionSet ? ' · question set included' : ''}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => handleRestore(backup)}
                                    >
                                        Restore
                                    </Button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(backup)}
                                        className="px-4 py-2 rounded-xl font-semibold text-sm text-danger-600 hover:bg-danger-50 border-2 border-danger-200 hover:border-danger-400 transition-all duration-200"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
