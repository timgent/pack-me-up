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

    const styles = type === 'success'
        ? 'bg-gradient-to-r from-success-500 to-success-600 shadow-glow-primary'
        : 'bg-gradient-to-r from-danger-500 to-danger-600 shadow-lg';

    return (
        <div className={`fixed top-4 right-4 ${styles} text-white px-6 py-4 rounded-2xl flex items-center gap-3 min-w-[250px] animate-slide-down backdrop-blur-sm`}>
            <span className="flex-1 font-semibold">{message}</span>
            <button
                onClick={onClose}
                className="hover:scale-110 transition-transform duration-200"
            >
                <XMarkIcon className="h-5 w-5" />
            </button>
        </div>
    );
} 