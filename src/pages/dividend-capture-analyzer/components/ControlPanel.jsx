import React, { useEffect, useState } from 'react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Icon from '../../../components/AppIcon';
import TickerAutocomplete from './TickerAutocomplete';
import { cn } from '../../../utils/cn';

const DEFAULT_START_DATE = '2020-01-01';
const getTodayIso = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ControlPanel = ({ 
  onFetchData, 
  onReset, 
  loading = false,
  className = "",
  tickerOptions = [],
  tickerOptionsLoading = false,
  tickerOptionsError = '',
  initialTicker = '',
  highlightFetchButton = false,
}) => {
  const todayIso = getTodayIso();
  const [formData, setFormData] = useState({
    ticker: '',
    marginAmount: '50000',
    startDate: DEFAULT_START_DATE,
    endDate: todayIso
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setFormData((prev) => {
      if (prev.endDate === todayIso) {
        return prev;
      }
      return {
        ...prev,
        endDate: todayIso
      };
    });
  }, [todayIso]);

  useEffect(() => {
    const normalized = (initialTicker || '').trim().toUpperCase();
    if (!normalized) {
      return;
    }
    setFormData((prev) => {
      if (prev.ticker === normalized) {
        return prev;
      }
      return {
        ...prev,
        ticker: normalized,
      };
    });
    setErrors((prev) => ({
      ...prev,
      ticker: '',
    }));
  }, [initialTicker]);

  const validateForm = () => {
    const newErrors = {};
    
    const catalogue = Array.isArray(tickerOptions) ? tickerOptions : [];
    const tickerValue = (formData?.ticker || '').trim().toUpperCase();

    if (!tickerValue) {
      newErrors.ticker = catalogue.length
        ? 'Stock symbol is required'
        : 'Ticker catalogue not loaded yet';
    } else if (catalogue.length) {
      const matched = catalogue.some((option) => {
        const variants = option?.variants || [];
        return variants.some((variant) => variant?.toUpperCase() === tickerValue);
      });
      if (!matched) {
        newErrors.ticker = 'Select a valid ticker from the catalogue';
      }
    }
    
    if (!formData?.marginAmount || parseFloat(formData?.marginAmount) < 0) {
      newErrors.marginAmount = 'Margin amount must be ≥ 0';
    }
    
    if (!formData?.startDate) {
      newErrors.startDate = 'Start date is required';
    }
    
    if (!formData?.endDate) {
      newErrors.endDate = 'End date is required';
    }
    
    if (formData?.startDate && formData?.endDate && new Date(formData.startDate) > new Date(formData.endDate)) {
      newErrors.endDate = 'End date must be after start date';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors)?.length === 0;
  };

  const normalizeFieldValue = (field, value) => {
    if (field === 'ticker' && typeof value === 'string') {
      return value.trim().toUpperCase();
    }
    return value;
  };

  const handleInputChange = (field, value) => {
    if (field === 'startDate' || field === 'endDate') {
      return;
    }
    const normalizedValue = normalizeFieldValue(field, value);
    setFormData(prev => ({
      ...prev,
      [field]: normalizedValue
    }));
    
    // Clear error when user starts typing
    if (errors?.[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (validateForm() && onFetchData) {
      onFetchData({
        ...formData,
        ticker: (formData?.ticker || '').trim().toUpperCase(),
        startDate: DEFAULT_START_DATE,
        endDate: todayIso,
      });
    }
  };

  const handleReset = () => {
    setFormData({
      ticker: '',
      marginAmount: '50000',
      startDate: DEFAULT_START_DATE,
      endDate: getTodayIso()
    });
    setErrors({});
    if (onReset) {
      onReset();
    }
  };

  return (
    <div className={`bg-card border border-border rounded-lg shadow-minimal ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center space-x-2">
          <Icon 
            name="Settings" 
            size={18} 
            color="var(--color-primary)"
            strokeWidth={2}
          />
          <h2 className="text-sm font-semibold text-foreground">
            Analysis Parameters
          </h2>
        </div>
        <div className="text-xs text-muted-foreground">
          Last updated: {new Date()?.toLocaleTimeString()}
        </div>
      </div>
      {/* Form Content */}
      <form onSubmit={handleSubmit} className="p-4">
        {/* Primary Inputs Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <TickerAutocomplete
            value={formData?.ticker}
            onChange={(value) => handleInputChange('ticker', value)}
            error={errors?.ticker || tickerOptionsError}
            disabled={loading || tickerOptionsLoading}
            options={tickerOptions}
            isLoading={tickerOptionsLoading}
          />

          <Input
            label="Margin Amount (SGD)"
            type="number"
            placeholder="50000"
            value={formData?.marginAmount}
            onChange={(e) => handleInputChange('marginAmount', e?.target?.value)}
            error={errors?.marginAmount}
            disabled={loading}
            min="0"
            step="1000"
            required
          />

          <Input
            label="Start Date"
            type="date"
            value={DEFAULT_START_DATE}
            onChange={(e) => handleInputChange('startDate', e?.target?.value)}
            error={errors?.startDate}
            disabled
            readOnly
            required
          />

          <Input
            label="End Date"
            type="date"
            value={todayIso}
            onChange={(e) => handleInputChange('endDate', e?.target?.value)}
            error={errors?.endDate}
            disabled
            readOnly
            required
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center space-x-3">
            <Button
              type="submit"
              variant="default"
              loading={loading}
              iconName="Play"
              iconPosition="left"
              iconSize={16}
              disabled={!formData?.ticker || !formData?.marginAmount || tickerOptionsLoading}
              className={cn(
                highlightFetchButton && !loading && 'animate-pulse ring-2 ring-primary/40 ring-offset-2 shadow-lg'
              )}
            >
              Fetch & Calculate
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              iconName="RotateCcw"
              iconPosition="left"
              iconSize={16}
              disabled={loading}
            >
              Reset
            </Button>
          </div>

          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <Icon 
              name="Info" 
              size={14} 
              color="currentColor"
              strokeWidth={2}
            />
            <span>SGX Trading Hours: 9:00 AM - 5:00 PM SGT</span>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ControlPanel;
