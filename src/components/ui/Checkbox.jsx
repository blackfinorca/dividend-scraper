import React from 'react';
import Icon from '../AppIcon';

const Checkbox = ({
  checked = false,
  onChange,
  label,
  description,
  error,
  disabled = false,
  required = false,
  indeterminate = false,
  size = 'default',
  className = "",
  id,
  name,
  value,
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    default: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const iconSizes = {
    sm: 12,
    default: 14,
    lg: 16
  };

  return (
    <div className={`flex items-start space-x-3 ${className}`}>
      <div className="relative flex items-center">
        <input
          type="checkbox"
          id={id}
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          required={required}
          className="sr-only"
          {...props}
        />
        <div
          className={`
            ${sizeClasses?.[size]}
            border-2 rounded-sm cursor-pointer transition-all duration-200
            flex items-center justify-center
            ${disabled 
              ? 'opacity-50 cursor-not-allowed border-muted bg-muted' 
              : checked || indeterminate
                ? 'border-primary bg-primary text-primary-foreground'
                : error
                  ? 'border-error hover:border-error/80' :'border-border hover:border-ring'
            }
            ${!disabled && 'hover:shadow-sm'}
          `}
          onClick={() => !disabled && onChange && onChange({ target: { checked: !checked } })}
          role="checkbox"
          aria-checked={indeterminate ? 'mixed' : checked}
          aria-labelledby={label ? `${id}-label` : undefined}
          aria-describedby={description ? `${id}-description` : undefined}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if ((e?.key === 'Enter' || e?.key === ' ') && !disabled) {
              e?.preventDefault();
              onChange && onChange({ target: { checked: !checked } });
            }
          }}
        >
          {(checked || indeterminate) && (
            <Icon 
              name={indeterminate ? 'Minus' : 'Check'} 
              size={iconSizes?.[size]} 
              color="currentColor"
              strokeWidth={2.5}
            />
          )}
        </div>
      </div>
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <label
              id={`${id}-label`}
              htmlFor={id}
              className={`
                block text-sm font-medium cursor-pointer
                ${disabled ? 'text-muted-foreground' : 'text-foreground'}
                ${error ? 'text-error' : ''}
              `}
            >
              {label}
              {required && <span className="text-error ml-1">*</span>}
            </label>
          )}
          
          {description && (
            <p 
              id={`${id}-description`}
              className={`
                text-xs mt-1
                ${disabled ? 'text-muted-foreground' : 'text-muted-foreground'}
              `}
            >
              {description}
            </p>
          )}
          
          {error && (
            <p className="text-xs text-error mt-1 flex items-center">
              <Icon name="AlertCircle" size={12} className="mr-1" />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const CheckboxGroup = ({ 
  label, 
  description, 
  error, 
  required = false,
  className = "",
  children 
}) => {
  return (
    <fieldset className={`space-y-3 ${className}`}>
      {label && (
        <legend className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </legend>
      )}
      
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      
      <div className="space-y-2">
        {children}
      </div>
      
      {error && (
        <p className="text-xs text-error flex items-center">
          <Icon name="AlertCircle" size={12} className="mr-1" />
          {error}
        </p>
      )}
    </fieldset>
  );
};

export { Checkbox, CheckboxGroup };