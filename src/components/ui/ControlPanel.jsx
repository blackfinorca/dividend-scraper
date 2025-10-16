import React, { useState } from 'react';
import Button from './Button';
import Input from './Input';
import Select from './Select';
import { Checkbox } from './Checkbox';
import Icon from '../AppIcon';

const ControlPanel = ({ 
  onAnalyze, 
  onReset, 
  loading = false,
  className = "" 
}) => {
  const [formData, setFormData] = useState({
    symbol: '',
    capitalAmount: '',
    dividendYield: '',
    exDividendDate: '',
    recordDate: '',
    paymentDate: '',
    includeCommissions: true,
    riskTolerance: 'medium'
  });

  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (onAnalyze) {
      onAnalyze(formData);
    }
  };

  const handleReset = () => {
    setFormData({
      symbol: '',
      capitalAmount: '',
      dividendYield: '',
      exDividendDate: '',
      recordDate: '',
      paymentDate: '',
      includeCommissions: true,
      riskTolerance: 'medium'
    });
    if (onReset) {
      onReset();
    }
  };

  const riskOptions = [
    { value: 'low', label: 'Conservative' },
    { value: 'medium', label: 'Moderate' },
    { value: 'high', label: 'Aggressive' }
  ];

  return (
    <div className={`bg-card border border-border rounded-lg shadow-minimal ${className}`}>
      {/* Panel Header */}
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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hover:bg-muted hover-transition"
          aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          <Icon 
            name={isCollapsed ? 'ChevronDown' : 'ChevronUp'} 
            size={16} 
            color="currentColor"
            strokeWidth={2}
          />
        </Button>
      </div>
      {/* Panel Content */}
      {!isCollapsed && (
        <form onSubmit={handleSubmit} className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Stock Symbol */}
            <Input
              label="Stock Symbol"
              type="text"
              placeholder="e.g., DBS"
              value={formData?.symbol}
              onChange={(e) => handleInputChange('symbol', e?.target?.value)}
              required
              className="font-data"
            />

            {/* Capital Amount */}
            <Input
              label="Capital Amount (SGD)"
              type="number"
              placeholder="10000"
              value={formData?.capitalAmount}
              onChange={(e) => handleInputChange('capitalAmount', e?.target?.value)}
              required
              min="1000"
              step="100"
            />

            {/* Dividend Yield */}
            <Input
              label="Expected Dividend Yield (%)"
              type="number"
              placeholder="4.5"
              value={formData?.dividendYield}
              onChange={(e) => handleInputChange('dividendYield', e?.target?.value)}
              required
              min="0"
              max="20"
              step="0.1"
            />

            {/* Risk Tolerance */}
            <Select
              label="Risk Tolerance"
              options={riskOptions}
              value={formData?.riskTolerance}
              onChange={(value) => handleInputChange('riskTolerance', value)}
              placeholder="Select risk level"
              id="riskTolerance"
              name="riskTolerance"
              description="Choose your investment risk tolerance level"
              error=""
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Ex-Dividend Date */}
            <Input
              label="Ex-Dividend Date"
              type="date"
              value={formData?.exDividendDate}
              onChange={(e) => handleInputChange('exDividendDate', e?.target?.value)}
              required
            />

            {/* Record Date */}
            <Input
              label="Record Date"
              type="date"
              value={formData?.recordDate}
              onChange={(e) => handleInputChange('recordDate', e?.target?.value)}
              required
            />

            {/* Payment Date */}
            <Input
              label="Payment Date"
              type="date"
              value={formData?.paymentDate}
              onChange={(e) => handleInputChange('paymentDate', e?.target?.value)}
              required
            />
          </div>

          {/* Options */}
          <div className="mb-6">
            <Checkbox
              label="Include brokerage commissions in calculations"
              description="Factor in typical SGX trading fees and commissions"
              checked={formData?.includeCommissions}
              onChange={(e) => handleInputChange('includeCommissions', e?.target?.checked)}
              id="includeCommissions"
              name="includeCommissions"
              value={formData?.includeCommissions}
              error=""
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center space-x-2">
              <Button
                type="submit"
                variant="default"
                loading={loading}
                iconName="Play"
                iconPosition="left"
                iconSize={16}
                disabled={!formData?.symbol || !formData?.capitalAmount || !formData?.dividendYield}
              >
                Run Analysis
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
                name="Clock" 
                size={14} 
                color="currentColor"
                strokeWidth={2}
              />
              <span>Last updated: {new Date()?.toLocaleTimeString()}</span>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

export default ControlPanel;