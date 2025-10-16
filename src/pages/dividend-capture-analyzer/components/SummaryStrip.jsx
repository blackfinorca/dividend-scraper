import React from 'react';
import Icon from '../../../components/AppIcon';

const SummaryStrip = ({
  rowsLoaded = 0,
  selectedCount = 0,
  totalTradeFee = 0,
  totalMarginFee = 0,
  totalResult = 0,
  className = ''
}) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })?.format(amount);
  };

  const hasFinancials = totalTradeFee !== 0 || totalMarginFee !== 0 || totalResult !== 0;

  return (
    <div className={`bg-muted/50 border border-border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Left side - Data summary */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <Icon 
              name="Database" 
              size={16} 
              color="var(--color-primary)"
              strokeWidth={2}
            />
            <div className="text-sm">
              <span className="font-medium text-foreground">{rowsLoaded}</span>
              <span className="text-muted-foreground ml-1">
                ex-date{rowsLoaded !== 1 ? 's' : ''} loaded
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Icon 
              name="Target" 
              size={16} 
              color="var(--color-accent)"
              strokeWidth={2}
            />
            <div className="text-sm">
              <span className="font-medium text-foreground">{selectedCount}</span>
              <span className="text-muted-foreground ml-1">
                selection{selectedCount !== 1 ? 's' : ''} made
              </span>
            </div>
          </div>
        </div>
      </div>

      {hasFinancials && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Result */}
            <div className="bg-background/80 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${
                    totalResult >= 0 ? 'bg-success/10' : 'bg-error/10'
                  }`}>
                    <Icon
                      name={totalResult >= 0 ? 'TrendingUp' : 'TrendingDown'}
                      size={20}
                      color={totalResult >= 0 ? 'var(--color-success)' : 'var(--color-error)'}
                      strokeWidth={2.5}
                    />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Total Cost Result
                    </div>
                    <div className={`text-xl font-bold ${
                      totalResult >= 0 ? 'text-success' : 'text-error'
                    }`}>
                      {formatCurrency(totalResult)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                dividend received + (open price − closing price) − trade fee − margin fee
              </div>
            </div>

            {/* Trade Fees */}
            <div className="bg-background/80 border border-border rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-warning/10">
                  <Icon
                    name="Receipt"
                    size={20}
                    color="var(--color-warning)"
                    strokeWidth={2.5}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Trade Fee (Open & Close)
                  </div>
                  <div className="text-xl font-bold text-warning">
                    {formatCurrency(totalTradeFee)}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Calculated at max(0.127% of trade value, S$4.10) per leg.
              </div>
            </div>

            {/* Margin Fees */}
            <div className="bg-background/80 border border-border rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-accent/20">
                  <Icon
                    name="Coins"
                    size={20}
                    color="var(--color-accent)"
                    strokeWidth={2.5}
                  />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Margin Fee
                  </div>
                  <div className="text-xl font-bold text-accent">
                    {formatCurrency(totalMarginFee)}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Daily interest on borrowed funds at 6% p.a. prorated by holding days.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Additional info row */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        <div className="flex items-center space-x-4 text-xs text-muted-foreground">
          <div className="flex items-center space-x-1">
            <Icon name="Clock" size={12} />
            <span>Data as of: {new Date()?.toLocaleString('en-SG')}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Icon name="Zap" size={12} />
            <span>Margin Rate: 6% p.a.</span>
          </div>
          <div className="flex items-center space-x-1">
            <Icon name="Calculator" size={12} />
            <span>Trade Fee: max(0.127% × value, S$4.10) per leg</span>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          <span>SGX Trading • Real-time calculations</span>
        </div>
      </div>
    </div>
  );
};

export default SummaryStrip;
