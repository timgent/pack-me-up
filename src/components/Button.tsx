import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ variant = 'primary', ...props }: ButtonProps) {
    const baseStyles = 'px-4 py-2 rounded-xl font-semibold transition-all duration-200 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95'

    const variantStyles = {
        primary: 'bg-gradient-primary text-white shadow-soft hover:shadow-glow-primary focus:ring-primary-500',
        secondary: 'bg-gradient-secondary text-white shadow-soft hover:shadow-glow-secondary focus:ring-secondary-500',
        danger: 'bg-gradient-to-r from-danger-500 to-danger-600 text-white shadow-soft hover:shadow-lg focus:ring-danger-500',
        ghost: 'text-primary-700 hover:bg-primary-50 border-2 border-primary-200 hover:border-primary-400 focus:ring-primary-500'
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