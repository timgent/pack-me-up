import { useState, useMemo, useRef } from 'react';
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
    menuPortalTarget?: HTMLElement | null;
}

const selectStyles = {
    control: (base: object) => ({
        ...base,
        minHeight: '42px',
        borderColor: '#e5e7eb',
        '&:hover': { borderColor: '#9ca3af' }
    }),
    option: (base: object, state: { isSelected: boolean; isFocused: boolean }) => ({
        ...base,
        backgroundColor: state.isSelected ? '#e5e7eb' : state.isFocused ? '#f3f4f6' : 'white',
        color: state.isSelected ? '#111827' : '#374151',
        '&:hover': { backgroundColor: '#f3f4f6' }
    }),
    menu: (base: object) => ({
        ...base,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        borderRadius: '0.375rem',
        marginTop: '0.25rem'
    }),
    menuList: (base: object) => ({ ...base, padding: '0.25rem' })
};

// The full react-select — only mounts when the user actually interacts with this item.
export function ActiveSelect({ value, onChange, options, placeholder, menuPortalTarget }: CreatableSelectProps) {
    // Seed the search box with the existing text so the user can edit in place
    // (place the cursor and insert/delete characters) instead of it opening blank.
    const [inputValue, setInputValue] = useState(value);
    const [menuIsOpen, setMenuIsOpen] = useState(false);
    const justSelectedRef = useRef(false);

    const selectOptions = useMemo(() => options.map(option => ({
        label: option,
        value: option
    })), [options]);

    const handleChange = (newValue: OnChangeValue<Option, false>, _: ActionMeta<Option>) => {
        justSelectedRef.current = true;
        onChange(newValue?.value || '');
    };

    const handleBlur = () => {
        if (justSelectedRef.current) { justSelectedRef.current = false; return; }
        if (inputValue.trim()) onChange(inputValue.trim());
    };

    return (
        <CreatableSelect
            autoFocus
            isClearable
            isSearchable
            value={value ? { label: value, value } : null}
            inputValue={inputValue}
            onChange={handleChange}
            onInputChange={setInputValue}
            onBlur={handleBlur}
            options={selectOptions}
            placeholder={placeholder}
            className="react-select-container"
            classNamePrefix="react-select"
            menuIsOpen={menuIsOpen}
            onMenuOpen={() => setMenuIsOpen(true)}
            onMenuClose={() => setMenuIsOpen(false)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !menuIsOpen) setMenuIsOpen(true);
            }}
            menuPortalTarget={menuPortalTarget}
            menuPosition={menuPortalTarget ? 'fixed' : undefined}
            styles={{
                ...selectStyles,
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
            }}
        />
    );
}

// Lightweight placeholder rendered for every item on section expand.
// Activates the full react-select only when the user clicks or focuses this item.
export function CustomCreatableSelect({ value, onChange, options, placeholder = 'Enter item', menuPortalTarget }: CreatableSelectProps) {
    const [isActive, setIsActive] = useState(false);

    if (!isActive) {
        return (
            <div
                tabIndex={0}
                onClick={() => setIsActive(true)}
                onFocus={() => setIsActive(true)}
                className="flex items-center min-h-[42px] border border-gray-200 hover:border-gray-400 rounded px-3 cursor-text"
            >
                <span className={`flex-1 text-sm ${value ? 'text-gray-700' : 'text-gray-400'}`}>
                    {value || placeholder}
                </span>
                {value && (
                    <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); onChange(''); }}
                        className="text-gray-300 hover:text-gray-500 text-lg leading-none ml-1"
                        aria-label="Clear"
                    >
                        ×
                    </button>
                )}
                <svg className="w-4 h-4 text-gray-300 ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        );
    }

    return <ActiveSelect value={value} onChange={onChange} options={options} placeholder={placeholder} menuPortalTarget={menuPortalTarget} />;
}
