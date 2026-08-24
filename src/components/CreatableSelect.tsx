import { useState, useMemo, useRef } from 'react';
import CreatableSelect from 'react-select/creatable';
import { ActionMeta, OnChangeValue } from 'react-select';
import { useIsDarkMode } from './ThemeContext';

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

/*
 * react-select paints its control and menu with inline styles, so `dark:`
 * classes cannot reach them — the palette has to be handed over in JS. Values
 * match the Tailwind greys the rest of the app uses in each theme.
 */
const buildSelectStyles = (isDark: boolean) => ({
    control: (base: object) => ({
        ...base,
        minHeight: '42px',
        backgroundColor: isDark ? '#111827' : 'white',
        borderColor: isDark ? '#374151' : '#e5e7eb',
        '&:hover': { borderColor: isDark ? '#6b7280' : '#9ca3af' }
    }),
    input: (base: object) => ({ ...base, color: isDark ? '#f3f4f6' : '#111827' }),
    singleValue: (base: object) => ({ ...base, color: isDark ? '#f3f4f6' : '#111827' }),
    placeholder: (base: object) => ({ ...base, color: isDark ? '#6b7280' : '#9ca3af' }),
    option: (base: object, state: { isSelected: boolean; isFocused: boolean }) => ({
        ...base,
        backgroundColor: isDark
            ? (state.isSelected ? '#374151' : state.isFocused ? '#1f2937' : '#111827')
            : (state.isSelected ? '#e5e7eb' : state.isFocused ? '#f3f4f6' : 'white'),
        color: isDark
            ? (state.isSelected ? '#f9fafb' : '#e5e7eb')
            : (state.isSelected ? '#111827' : '#374151'),
        '&:hover': { backgroundColor: isDark ? '#1f2937' : '#f3f4f6' }
    }),
    menu: (base: object) => ({
        ...base,
        backgroundColor: isDark ? '#111827' : 'white',
        border: isDark ? '1px solid #374151' : undefined,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        borderRadius: '0.375rem',
        marginTop: '0.25rem'
    }),
    menuList: (base: object) => ({ ...base, padding: '0.25rem' })
});

// The full react-select — only mounts when the user actually interacts with this item.
export function ActiveSelect({ value, onChange, options, placeholder, menuPortalTarget }: CreatableSelectProps) {
    // Seed the search box with the existing text so the user can edit in place
    // (place the cursor and insert/delete characters) instead of it opening blank.
    const [inputValue, setInputValue] = useState(value);
    const [menuIsOpen, setMenuIsOpen] = useState(false);
    const justSelectedRef = useRef(false);
    const isDark = useIsDarkMode();
    const selectStyles = useMemo(() => buildSelectStyles(isDark), [isDark]);

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
                className="flex items-center min-h-[42px] border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 rounded px-3 cursor-text"
            >
                <span className={`flex-1 text-sm ${value ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                    {value || placeholder}
                </span>
                {value && (
                    <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); onChange(''); }}
                        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 text-lg leading-none ml-1"
                        aria-label="Clear"
                    >
                        ×
                    </button>
                )}
                <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 ml-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        );
    }

    return <ActiveSelect value={value} onChange={onChange} options={options} placeholder={placeholder} menuPortalTarget={menuPortalTarget} />;
}
