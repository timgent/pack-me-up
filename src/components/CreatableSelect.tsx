import { useState } from 'react';
import CreatableSelect from 'react-select/creatable';
import { ActionMeta, OnChangeValue } from 'react-select';

interface Option {
    label: string;
    value: string;
}

interface CreatableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
}

export function CustomCreatableSelect({ value, onChange, options, placeholder = 'Enter item' }: CreatableSelectProps) {
    const [inputValue, setInputValue] = useState('');

    const selectOptions = options.map(option => ({
        label: option,
        value: option
    }));

    const handleChange = (
        newValue: OnChangeValue<Option, false>,
        actionMeta: ActionMeta<Option>
    ) => {
        onChange(newValue?.value || '');
    };

    const handleInputChange = (inputValue: string) => {
        setInputValue(inputValue);
    };

    return (
        <CreatableSelect
            isClearable
            isSearchable
            value={value ? { label: value, value } : null}
            onChange={handleChange}
            onInputChange={handleInputChange}
            options={selectOptions}
            placeholder={placeholder}
            className="react-select-container"
            classNamePrefix="react-select"
            styles={{
                control: (base) => ({
                    ...base,
                    minHeight: '42px',
                    borderColor: '#e5e7eb',
                    '&:hover': {
                        borderColor: '#9ca3af'
                    }
                }),
                option: (base, state) => ({
                    ...base,
                    backgroundColor: state.isSelected ? '#f3f4f6' : 'white',
                    color: state.isSelected ? '#111827' : '#374151',
                    '&:hover': {
                        backgroundColor: '#f3f4f6'
                    }
                })
            }}
        />
    );
} 