import { useState, useEffect } from 'react'
import { useSync } from './SyncContext'
import { ConflictResolutionModal } from './ConflictResolutionModal'
import { ConflictInfo, ConflictStrategy } from '../services/sync/types'
import { useToast } from './ToastContext'

/**
 * Component that monitors for sync conflicts and shows resolution modal
 */
export const SyncConflictHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { syncState, resolveConflict } = useSync()
    const { showToast } = useToast()
    const [currentConflict, setCurrentConflict] = useState<ConflictInfo | null>(null)

    // Monitor for conflicts
    useEffect(() => {
        if (!syncState) return

        // Check for unresolved conflicts
        const unresolvedConflicts = syncState.packingLists.conflicts.filter(c => !c.resolved)

        if (unresolvedConflicts.length > 0 && !currentConflict) {
            // Show the first unresolved conflict
            setCurrentConflict(unresolvedConflicts[0])
        } else if (unresolvedConflicts.length === 0 && currentConflict) {
            // All conflicts resolved
            setCurrentConflict(null)
        }
    }, [syncState, currentConflict])

    const handleResolve = async (strategy: ConflictStrategy) => {
        if (!currentConflict) return

        try {
            await resolveConflict(currentConflict.documentId, strategy)
            showToast('Conflict resolved successfully', 'success')
            setCurrentConflict(null)
        } catch (err: any) {
            console.error('Error resolving conflict:', err)
            showToast('Failed to resolve conflict: ' + err.message, 'error')
        }
    }

    const handleClose = () => {
        // User chose to cancel - keep the conflict for later
        setCurrentConflict(null)
        showToast('Conflict resolution postponed. You can resolve it later.', 'info')
    }

    return (
        <>
            {children}
            <ConflictResolutionModal
                conflict={currentConflict}
                onResolve={handleResolve}
                onClose={handleClose}
            />
        </>
    )
}
