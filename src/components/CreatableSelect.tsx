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
    const [menuIsOpen, setMenuIsOpen] = useState(false);

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

    const handleBlur = () => {
        if (inputValue.trim()) {
            onChange(inputValue.trim());
        }
    };

    return (
        <CreatableSelect
            isClearable
            isSearchable
            value={value ? { label: value, value } : null}
            onChange={handleChange}
            onInputChange={handleInputChange}
            onBlur={handleBlur}
            options={selectOptions}
            placeholder={placeholder}
            className="react-select-container"
            classNamePrefix="react-select"
            menuIsOpen={menuIsOpen}
            onMenuOpen={() => setMenuIsOpen(true)}
            onMenuClose={() => setMenuIsOpen(false)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !menuIsOpen) {
                    setMenuIsOpen(true);
                }
            }}
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
                    backgroundColor: state.isSelected ? '#e5e7eb' : state.isFocused ? '#f3f4f6' : 'white',
                    color: state.isSelected ? '#111827' : '#374151',
                    '&:hover': {
                        backgroundColor: '#f3f4f6'
                    }
                }),
                menu: (base) => ({
                    ...base,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    borderRadius: '0.375rem',
                    marginTop: '0.25rem'
                }),
                menuList: (base) => ({
                    ...base,
                    padding: '0.25rem'
                })
            }}
        />
    );
} 