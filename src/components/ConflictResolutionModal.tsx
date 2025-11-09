import { Modal } from './Modal';
import { Button } from './Button';
import { formatDistanceToNow } from 'date-fns';

export type ConflictResolution = 'keep-local' | 'use-pod' | 'review';

export interface ConflictData {
  localTimestamp?: string;
  podTimestamp?: string;
  docType: 'question-set' | 'packing-list';
  documentName?: string;
}

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onResolve: (resolution: ConflictResolution) => void;
  conflictData: ConflictData;
}

export function ConflictResolutionModal({
  isOpen,
  onResolve,
  conflictData,
}: ConflictResolutionModalProps) {
  const { localTimestamp, podTimestamp, docType, documentName } = conflictData;

  const getRelativeTime = (timestamp?: string) => {
    if (!timestamp) return 'Unknown';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const getDocumentDescription = () => {
    if (docType === 'question-set') {
      return 'packing list questions';
    }
    return documentName ? `"${documentName}"` : 'this packing list';
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="Sync Conflict Detected">
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-sm text-yellow-800">
            You have local changes to {getDocumentDescription()} and your pod has different data.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
            <div>
              <p className="text-sm font-medium text-gray-700">Local Version</p>
              <p className="text-xs text-gray-500 mt-1">
                Last edited {getRelativeTime(localTimestamp)}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                On this device
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
            <div>
              <p className="text-sm font-medium text-gray-700">Pod Version</p>
              <p className="text-xs text-gray-500 mt-1">
                Last edited {getRelativeTime(podTimestamp)}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                In your pod
              </span>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <p className="text-sm text-gray-600 mb-3">What would you like to do?</p>
          <div className="space-y-2">
            <Button
              variant="primary"
              onClick={() => onResolve('keep-local')}
              className="w-full justify-start"
            >
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Keep Local & Update Pod
              </span>
            </Button>

            <Button
              variant="secondary"
              onClick={() => onResolve('use-pod')}
              className="w-full justify-start"
            >
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Use Pod Data
              </span>
            </Button>

            {/* Review Differences button - for future implementation */}
            {/* <Button
              variant="ghost"
              onClick={() => onResolve('review')}
              className="w-full justify-start"
            >
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Review Differences
              </span>
            </Button> */}
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-700">
            <strong>Tip:</strong> Your local version will be automatically backed up before any changes are applied.
          </p>
        </div>
      </div>
    </Modal>
  );
}
