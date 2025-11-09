import { createContext } from 'react';
import { ToastType } from '../components/Toast';

interface ToastContextType {
    showToast: (message: string, type: ToastType) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);
