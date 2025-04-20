import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { }

export function Button(props: ButtonProps) {
    return (
        <button {...props} className={`text-white hover:cursor-pointer bg-blue-500 rounded p-2 ${props.className || ''}`}>
            {props.children}
        </button>
    )
} 