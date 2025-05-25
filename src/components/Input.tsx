import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}

export function Input({ label, ...props }: InputProps) {
    return (
        <div className="flex-1">
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                </label>
            )}
            <input
                {...props}
                className={`
                    w-full
                    px-3 
                    py-2 
                    border 
                    border-gray-300 
                    rounded-md 
                    shadow-sm
                    text-gray-900
                    placeholder-gray-400
                    focus:outline-none 
                    focus:ring-2 
                    focus:ring-blue-500 
                    focus:border-blue-500
                    transition-colors
                    duration-200
                    ${props.className || ''}
                `}
            />
        </div>
    )
} 