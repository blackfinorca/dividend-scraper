import React, { useState, useRef, useEffect } from 'react';
import Icon from '../AppIcon';

const Select = ({
  options = [],
  value,
  onChange,
  label,
  description,
  error,
  placeholder = "Select an option",
  disabled = false,
  required = false,
  loading = false,
  multiple = false,
  searchable = false,
  clearable = false,
  className = "",
  id,
  name
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const selectRef = useRef(null);
  const searchInputRef = useRef(null);

  const filteredOptions = searchable && searchTerm
    ? options?.filter(option => 
        option?.label?.toLowerCase()?.includes(searchTerm?.toLowerCase())
      )
    : options;

  const selectedOption = multiple 
    ? options?.filter(opt => value?.includes(opt?.value))
    : options?.find(opt => opt?.value === value);

  const displayValue = multiple
    ? (selectedOption?.length > 0 ? `${selectedOption?.length} selected` : placeholder)
    : (selectedOption?.label || placeholder);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef?.current && !selectRef?.current?.contains(event?.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchable && searchInputRef?.current) {
      searchInputRef?.current?.focus();
    }
  }, [isOpen, searchable]);

  const handleOptionClick = (optionValue) => {
    if (multiple) {
      const newValue = value?.includes(optionValue)
        ? value?.filter(v => v !== optionValue)
        : [...(value || []), optionValue];
      onChange(newValue);
    } else {
      onChange(optionValue);
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const handleClear = (e) => {
    e?.stopPropagation();
    onChange(multiple ? [] : '');
  };

  const handleKeyDown = (e) => {
    if (e?.key === 'Enter' || e?.key === ' ') {
      e?.preventDefault();
      setIsOpen(!isOpen);
    } else if (e?.key === 'Escape') {
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  return (
    <div className={`relative ${className}`} ref={selectRef}>
      {label && (
        <label 
          htmlFor={id}
          className="block text-sm font-medium text-foreground mb-1"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}
      <div
        className={`
          relative w-full min-h-[40px] px-3 py-2 
          bg-input border border-border rounded-md
          cursor-pointer transition-colors
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-ring'}
          ${error ? 'border-error' : ''}
          ${isOpen ? 'border-ring ring-1 ring-ring' : ''}
        `}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={label ? `${id}-label` : undefined}
      >
        <div className="flex items-center justify-between">
          <span className={`
            text-sm truncate flex-1
            ${!selectedOption || (multiple && (!value || value?.length === 0)) 
              ? 'text-muted-foreground' 
              : 'text-foreground'
            }
          `}>
            {loading ? 'Loading...' : displayValue}
          </span>
          
          <div className="flex items-center space-x-1">
            {clearable && (selectedOption || (multiple && value?.length > 0)) && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-muted rounded"
                tabIndex={-1}
              >
                <Icon name="X" size={14} />
              </button>
            )}
            
            {loading ? (
              <Icon name="Loader2" size={16} className="animate-spin" />
            ) : (
              <Icon 
                name="ChevronDown" 
                size={16} 
                className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            )}
          </div>
        </div>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-border">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search options..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e?.target?.value)}
                className="w-full px-2 py-1 text-sm bg-input border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
          
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions?.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {searchTerm ? 'No options found' : 'No options available'}
              </div>
            ) : (
              filteredOptions?.map((option) => {
                const isSelected = multiple 
                  ? value?.includes(option?.value)
                  : value === option?.value;
                
                return (
                  <div
                    key={option?.value}
                    className={`
                      px-3 py-2 text-sm cursor-pointer transition-colors
                      ${option?.disabled 
                        ? 'opacity-50 cursor-not-allowed' :'hover:bg-accent hover:text-accent-foreground'
                      }
                      ${isSelected ? 'bg-accent text-accent-foreground' : ''}
                    `}
                    onClick={() => !option?.disabled && handleOptionClick(option?.value)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{option?.label}</div>
                        {option?.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {option?.description}
                          </div>
                        )}
                      </div>
                      {multiple && isSelected && (
                        <Icon name="Check" size={16} className="ml-2" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {description && !error && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
      {error && (
        <p className="text-xs text-error mt-1 flex items-center">
          <Icon name="AlertCircle" size={12} className="mr-1" />
          {error}
        </p>
      )}
    </div>
  );
};

export default Select;