import React, { useState, useRef, useEffect, useMemo } from 'react';
import Icon from '../../../components/AppIcon';

const MAX_SUGGESTIONS = 10;

const TickerAutocomplete = ({
  value,
  onChange,
  error,
  disabled = false,
  options = [],
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const normalisedOptions = useMemo(() => {
    const formatDisplay = (display, numeric) => {
      if (display) {
        return display;
      }
      if (!Number.isFinite(numeric)) {
        return '';
      }
      try {
        return new Intl.NumberFormat('en-SG', {
          style: 'currency',
          currency: 'SGD',
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(numeric);
      } catch (error) {
        return numeric.toLocaleString('en-SG');
      }
    };

    return (options || []).map((option) => {
      const ticker = option?.ticker ? option.ticker.toUpperCase() : '';
      const displayTicker = option?.displayTicker || ticker;
      const companyName = option?.companyName || '';
      const marketCap = Number.isFinite(option?.marketCap) ? option.marketCap : null;
      const marketCapDisplay = formatDisplay(option?.marketCapDisplay, marketCap);
      const variants = (option?.variants || [])
        .map((variant) => (variant ? variant.toUpperCase() : ''))
        .filter(Boolean);

      if (ticker && !variants.includes(ticker)) {
        variants.push(ticker);
      }
      if (displayTicker && !variants.includes(displayTicker.toUpperCase())) {
        variants.push(displayTicker.toUpperCase());
      }

      return {
        ...option,
        ticker,
        displayTicker,
        companyName,
        marketCap,
        marketCapDisplay,
        variants,
      };
    });
  }, [options]);

  const variantLookup = useMemo(() => {
    const map = new Map();
    normalisedOptions.forEach((option) => {
      option.variants.forEach((variant) => {
        if (variant) {
          map.set(variant.toUpperCase(), option);
        }
      });
    });
    return map;
  }, [normalisedOptions]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const nextValue = (value || '').trim().toUpperCase();
    if (!nextValue) {
      setSearchTerm('');
      return;
    }
    const matched = variantLookup.get(nextValue);
    if (matched) {
      setSearchTerm(matched.displayTicker || nextValue);
    } else {
      setSearchTerm(nextValue);
    }
  }, [value, variantLookup]);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) {
      return normalisedOptions.slice(0, MAX_SUGGESTIONS);
    }

    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return normalisedOptions.slice(0, MAX_SUGGESTIONS);
    }

    return normalisedOptions
      .filter((option) => {
        const tokens = [
          option.ticker,
          option.displayTicker,
          option.companyName,
          option.marketCapDisplay,
          ...(option.variants || []),
        ];
        return tokens.some((token) => token && token.toLowerCase().includes(query));
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [normalisedOptions, searchTerm]);

  const handleInputChange = (event) => {
    const newValue = event?.target?.value?.toUpperCase() ?? '';
    setSearchTerm(newValue);
    onChange?.(newValue);
    setIsOpen(true);
  };

  const handleOptionSelect = (option) => {
    const nextValue = option.displayTicker || option.ticker;
    setSearchTerm(nextValue);
    onChange?.(nextValue);
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (event?.key === 'Escape') {
      setIsOpen(false);
    } else if (event?.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    }
  };

  const showEmptyState = searchTerm && !filteredOptions.length && isOpen && !isLoading;
  const catalogueUnavailable = !isLoading && normalisedOptions.length === 0;

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-foreground mb-1">
        Stock Symbol
        <span className="text-error ml-1">*</span>
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder="Search SGX stocks: D05, D05.SI..."
          disabled={disabled}
          className={`
            w-full px-3 py-2 pr-10 text-sm font-data
            bg-input border rounded-md
            transition-colors duration-200
            ${
              disabled
                ? 'opacity-50 cursor-not-allowed border-muted'
                : 'hover:border-ring focus:border-ring focus:ring-1 focus:ring-ring'
            }
            ${error ? 'border-error' : 'border-border'}
            focus:outline-none
          `}
        />

        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <Icon
            name="Search"
            size={16}
            color="var(--color-muted-foreground)"
            strokeWidth={2}
          />
        </div>
      </div>

      {isOpen && filteredOptions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-80 overflow-y-auto">
          <div className="px-3 py-2 bg-muted border-b border-border">
            <div className="text-xs font-medium text-muted-foreground">
              Available SGX tickers
            </div>
          </div>
          {filteredOptions.map((option) => (
            <div
              key={option.ticker || option.displayTicker}
              className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors border-b border-border/50 last:border-b-0"
              onClick={() => handleOptionSelect(option)}
            >
              <div className="font-data text-sm font-semibold text-foreground">
                {option.displayTicker}
              </div>
              {option.companyName && (
                <div className="text-xs text-muted-foreground truncate">
                  {option.companyName}
                </div>
              )}
              {option.marketCapDisplay && (
                <div className="text-[11px] text-muted-foreground">
                  Market Cap: {option.marketCapDisplay}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-error mt-1 flex items-center">
          <Icon name="AlertCircle" size={12} className="mr-1" />
          {error}
        </p>
      )}

      {isLoading && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center">
          <Icon name="Loader2" size={12} className="mr-1 animate-spin" />
          Loading ticker catalogue...
        </p>
      )}

      {catalogueUnavailable && !error && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center">
          <Icon name="Info" size={12} className="mr-1" />
          Ticker catalogue currently unavailable.
        </p>
      )}

      {showEmptyState && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg p-3">
          <div className="text-center text-sm text-muted-foreground">
            No matching tickers found
          </div>
        </div>
      )}
    </div>
  );
};

export default TickerAutocomplete;
