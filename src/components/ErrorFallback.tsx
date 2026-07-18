import { Button } from './Button'

interface ErrorFallbackProps {
    resetError: () => void
}

export function ErrorFallback({ resetError }: ErrorFallbackProps) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 px-4">
            <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-soft p-8">
                <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
                <p className="text-gray-600 mb-6">
                    We've been notified about this error. A report dialog should appear where you can add details
                    about what happened — that helps us fix it faster.
                </p>
                <Button onClick={resetError}>Try again</Button>
            </div>
        </div>
    )
}
