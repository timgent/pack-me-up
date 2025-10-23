import { ConflictInfo, ConflictStrategy } from '../services/sync/types'

interface ConflictResolutionModalProps {
    conflict: ConflictInfo | null
    onResolve: (strategy: ConflictStrategy) => void
    onClose: () => void
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
    conflict,
    onResolve,
    onClose,
}) => {
    if (!conflict) return null

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString()
    }

    const getLocalUpdatedAt = () => {
        if (conflict.localVersion?.updatedAt) {
            return formatDate(conflict.localVersion.updatedAt)
        }
        if (conflict.localVersion?.createdAt) {
            return formatDate(conflict.localVersion.createdAt)
        }
        return 'Unknown'
    }

    const getRemoteUpdatedAt = () => {
        if (conflict.remoteVersion?.updatedAt) {
            return formatDate(conflict.remoteVersion.updatedAt)
        }
        if (conflict.remoteVersion?.createdAt) {
            return formatDate(conflict.remoteVersion.createdAt)
        }
        return 'Unknown'
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">⚠️</span>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Sync Conflict Detected</h2>
                                <p className="text-sm text-gray-600 mt-1">
                                    Your local data and Pod data have both been modified
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                            title="Close"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                    <div className="mb-6">
                        <h3 className="font-semibold text-gray-700 mb-2">Conflict Information</h3>
                        <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
                            <div>
                                <span className="font-medium">Document Type:</span>{' '}
                                <span className="capitalize">{conflict.documentType.replace('-', ' ')}</span>
                            </div>
                            <div>
                                <span className="font-medium">Detected:</span>{' '}
                                {formatDate(conflict.detectedAt)}
                            </div>
                        </div>
                    </div>

                    {/* Side by side comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {/* Local Version */}
                        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                            <h4 className="font-semibold text-blue-900 mb-3">Local Version (This Device)</h4>
                            <div className="space-y-2 text-sm">
                                <div>
                                    <span className="font-medium text-gray-700">Last Modified:</span>
                                    <div className="text-gray-600">{getLocalUpdatedAt()}</div>
                                </div>
                                {conflict.documentType === 'question-set' && conflict.localVersion && (
                                    <>
                                        <div>
                                            <span className="font-medium text-gray-700">People:</span>
                                            <div className="text-gray-600">
                                                {conflict.localVersion.people?.length || 0} person(s)
                                            </div>
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-700">Questions:</span>
                                            <div className="text-gray-600">
                                                {conflict.localVersion.questions?.length || 0} question(s)
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Remote Version */}
                        <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                            <h4 className="font-semibold text-green-900 mb-3">Pod Version (Remote)</h4>
                            <div className="space-y-2 text-sm">
                                <div>
                                    <span className="font-medium text-gray-700">Last Modified:</span>
                                    <div className="text-gray-600">{getRemoteUpdatedAt()}</div>
                                </div>
                                {conflict.documentType === 'question-set' && conflict.remoteVersion && (
                                    <>
                                        <div>
                                            <span className="font-medium text-gray-700">People:</span>
                                            <div className="text-gray-600">
                                                {conflict.remoteVersion.people?.length || 0} person(s)
                                            </div>
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-700">Questions:</span>
                                            <div className="text-gray-600">
                                                {conflict.remoteVersion.questions?.length || 0} question(s)
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Resolution Options */}
                    <div className="mb-4">
                        <h3 className="font-semibold text-gray-700 mb-3">How would you like to resolve this conflict?</h3>
                        <div className="space-y-3">
                            <button
                                onClick={() => onResolve('keep-local')}
                                className="w-full text-left p-4 border-2 border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                                <div className="font-semibold text-blue-900">Keep Local Version</div>
                                <div className="text-sm text-gray-600 mt-1">
                                    Use the data from this device and overwrite the Pod version
                                </div>
                            </button>

                            <button
                                onClick={() => onResolve('keep-remote')}
                                className="w-full text-left p-4 border-2 border-green-300 rounded-lg hover:bg-green-50 transition-colors"
                            >
                                <div className="font-semibold text-green-900">Keep Pod Version</div>
                                <div className="text-sm text-gray-600 mt-1">
                                    Use the data from your Pod and overwrite the local version
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                        <strong>Warning:</strong> Choosing either option will overwrite one version with the other.
                        Make sure to choose carefully as this action cannot be easily undone.
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded transition-colors"
                    >
                        Cancel (Keep Both for Now)
                    </button>
                </div>
            </div>
        </div>
    )
}
