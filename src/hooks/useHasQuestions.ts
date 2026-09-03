import { useState } from 'react'
import { useDatabase } from '../components/DatabaseContext'
import { useLocalFirstLoad } from './useLocalFirstLoad'

export interface HasQuestionsState {
    /** True once a question set with at least one question has been read. */
    hasQuestions: boolean
    /**
     * True while the answer could still change: the first read hasn't come
     * back, or it found nothing and the login sync that might supply it is
     * still running.
     *
     * A caller that picks between a "you have data" and a "you're new here"
     * treatment must render neither while this holds. Defaulting to the
     * new-here one flashed the wizard call to action at every returning user
     * (#333) and stuck there for anyone whose questions arrived with the pod.
     */
    isLoading: boolean
}

/**
 * Whether this identity has any packing questions yet.
 *
 * Read through `useLocalFirstLoad`, so the device's own copy answers
 * immediately and the read runs again if the background login sync brings a
 * question set this device had never seen — the case that made the home page
 * CTA stale until a full reload (#333).
 */
export const useHasQuestions = (): HasQuestionsState => {
    const { db } = useDatabase()
    const [hasQuestions, setHasQuestions] = useState(false)
    const [hasRead, setHasRead] = useState(false)

    const { isCheckingPod } = useLocalFirstLoad(async () => {
        try {
            const doc = await db.getQuestionSet()
            setHasQuestions(doc.questions.length > 0)
        } catch (err: unknown) {
            const hasName = typeof err === 'object' && err !== null && 'name' in err
            if (!hasName || (err as { name: string }).name !== 'not_found') console.error(err)
            setHasQuestions(false)
        } finally {
            setHasRead(true)
        }
    }, [db])

    // Questions already found can't be un-found by a pod that is still
    // answering, so only the empty result waits on the sync.
    return { hasQuestions, isLoading: !hasRead || (!hasQuestions && isCheckingPod) }
}
