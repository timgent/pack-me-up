import { useState, useEffect } from 'react'
import { useDatabase } from '../components/DatabaseContext'

export const useHasQuestions = () => {
    const { db } = useDatabase()
    const [hasQuestions, setHasQuestions] = useState(false)

    useEffect(() => {
        db.getQuestionSet()
            .then(() => setHasQuestions(true))
            .catch((err: any) => {
                if (err.name !== 'not_found') console.error(err)
                setHasQuestions(false)
            })
    }, [db])

    return hasQuestions
}
