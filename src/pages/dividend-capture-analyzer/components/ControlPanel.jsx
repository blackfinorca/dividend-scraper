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
    <div className={cn('bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-xl overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/70 dark:border-slate-700/70">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg">
            <Icon
              name="Settings"
              size={18}
              color="currentColor"
              strokeWidth={2}
            />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Analysis Parameters</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Configure margin, timeframe, and ticker catalogue</p>
          </div>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-300">
          Last updated: {new Date()?.toLocaleTimeString()}
        </div>
      </div>
      {/* Form Content */}
      <form onSubmit={handleSubmit} className="px-5 py-5 space-y-6">
        {/* Primary Inputs Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            className="bg-white/70 dark:bg-slate-900/50 border border-white/60 dark:border-slate-700/70 focus:ring-2 focus:ring-blue-500"
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
            className="bg-white/50 dark:bg-slate-900/40 border border-white/50 dark:border-slate-700/60"
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
            className="bg-white/50 dark:bg-slate-900/40 border border-white/50 dark:border-slate-700/60"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between pt-4 border-t border-white/70 dark:border-slate-700/70">
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
                'bg-blue-600 hover:bg-blue-700 text-white shadow-md',
                highlightFetchButton && !loading && 'animate-pulse ring-2 ring-blue-500/50 ring-offset-2 ring-offset-white dark:ring-offset-slate-800'
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
              className="border-white/70 dark:border-slate-700/70 bg-white/40 dark:bg-slate-900/40 hover:bg-white/60 dark:hover:bg-slate-900/60"
            >
              Reset
            </Button>
          </div>

          <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
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
