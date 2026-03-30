import { useState, useEffect } from 'react'
import { useDatabase } from '../components/DatabaseContext'

export const useHasQuestions = () => {
    const { db } = useDatabase()
    const [hasQuestions, setHasQuestions] = useState(false)

    useEffect(() => {
        db.getQuestionSet()
            .then((doc) => setHasQuestions(doc.questions.length > 0))
            .catch((err: unknown) => {
                const hasName = typeof err === 'object' && err !== null && 'name' in err
                if (!hasName || (err as { name: string }).name !== 'not_found') console.error(err)
                setHasQuestions(false)
            })
    }, [db])

    return hasQuestions
}
