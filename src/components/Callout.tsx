import { Button } from './Button'

interface CalloutProps {
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export function Callout({ title, description, action }: CalloutProps) {
    return (
        <div className="rounded-2xl bg-gradient-to-br from-primary-50 dark:from-primary-950/40 to-accent-50 dark:to-accent-950/40 p-6 border-2 border-primary-200 dark:border-primary-800 shadow-soft hover:shadow-glow-primary transition-all duration-300">
            <div className="flex">
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-primary-900 dark:text-primary-200">{title}</h3>
                    <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        <p>{description}</p>
                    </div>
                    {action && (
                        <div className="mt-4">
                            <Button
                                type="button"
                                onClick={action.onClick}
                                variant="secondary"
                            >
                                {action.label}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
} 