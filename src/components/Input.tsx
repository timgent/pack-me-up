import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}

export function Input({ label, ...props }: InputProps) {
    return (
        <div className="flex-1">
            {label && (
                <label className="block text-sm font-semibold text-primary-700 mb-2">
                    {label}
                </label>
            )}
            <input
                {...props}
                className={`
                    w-full
                    px-4
                    py-2.5
                    border-2
                    border-primary-200
                    rounded-xl
                    shadow-soft
                    text-gray-900
                    placeholder-gray-400
                    focus:outline-none
                    focus:ring-2
                    focus:ring-primary-500
                    focus:border-primary-500
                    hover:border-primary-300
                    transition-all
                    duration-200
                    ${props.className || ''}
                `}
            />
        </div>
    )
} 