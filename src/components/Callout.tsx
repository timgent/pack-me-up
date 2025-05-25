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
        <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
            <div className="flex">
                <div className="flex-1">
                    <h3 className="text-sm font-medium text-blue-800">{title}</h3>
                    <div className="mt-2 text-sm text-blue-700">
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