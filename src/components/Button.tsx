import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
}

export function Button({ variant = 'primary', ...props }: ButtonProps) {
    const baseStyles = 'px-4 py-2 rounded-md font-medium transition-all duration-200 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50'

    const variantStyles = {
        primary: 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500',
        secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700 focus:ring-gray-500',
        danger: 'text-red-600 hover:bg-red-50 border border-red-200 focus:ring-red-500',
        ghost: 'text-gray-600 hover:bg-gray-50 focus:ring-gray-500',
        outline: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 focus:ring-gray-500'
    }[variant]

    return (
        <button
            {...props}
            className={`${baseStyles} ${variantStyles} ${props.className || ''}`}
        >
            {props.children}
        </button>
    )
} 