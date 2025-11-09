import { useCallback } from 'react';
import { useToast } from './useToast';
import { AuthenticationError } from '../services/solidPod';

/**
 * Custom hook for handling Pod operation errors in a consistent way
 * Automatically detects authentication errors and shows appropriate messages
 *
 * @example
 * const handlePodError = usePodErrorHandler();
 *
 * try {
 *   await saveMultipleFilesToPod(...);
 * } catch (error) {
 *   handlePodError(error, 'Failed to save to Pod');
 * }
 */
export function usePodErrorHandler() {
  const { showToast } = useToast();

  return useCallback((error: unknown, fallbackMessage: string) => {
    console.error('Pod operation error:', error);

    if (error instanceof AuthenticationError) {
      // Use the specific authentication error message
      showToast(error.message, 'error');
    } else {
      // Use the fallback message for other errors
      showToast(fallbackMessage, 'error');
    }
  }, [showToast]);
}
