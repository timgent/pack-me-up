import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { }

export function Input(props: InputProps) {
    return (
        <input {...props} className={`border-gray-400 mx-2 p-2 border-solid border-2 ${props.className || ''}`} />
    )
} 