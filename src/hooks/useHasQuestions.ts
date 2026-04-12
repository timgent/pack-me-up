import { useState, useEffect } from 'react'
import { useDatabase } from '../components/DatabaseContext'

export const useHasQuestions = () => {
    const { loadQuestionSet } = useDatabase()
    const [hasQuestions, setHasQuestions] = useState(false)

    useEffect(() => {
        loadQuestionSet()
            .then((doc) => setHasQuestions(doc.questions.length > 0))
            .catch((err: unknown) => {
                const hasName = typeof err === 'object' && err !== null && 'name' in err
                if (!hasName || (err as { name: string }).name !== 'not_found') console.error(err)
                setHasQuestions(false)
            })
    }, [loadQuestionSet])

    return hasQuestions
}
