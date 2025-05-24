import { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error';

interface ToastProps {
    message: string;
    type: ToastType;
    onClose: () => void;
    duration?: number;
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';

    return (
        <div className={`fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[200px]`}>
            <span className="flex-1">{message}</span>
            <button
                onClick={onClose}
                className="hover:opacity-80 transition-opacity"
            >
                <XMarkIcon className="h-5 w-5" />
            </button>
        </div>
    );
} 