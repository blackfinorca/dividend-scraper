import React from 'react';
import Icon from '../../../components/AppIcon';
import { cn } from '../../../utils/cn';

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
    <div className={cn('bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-lg p-6', className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left side - Data summary */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-300">
              <Icon name="Database" size={16} color="currentColor" strokeWidth={2} />
            </span>
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">{rowsLoaded}</span>
              <span className="ml-1">ex-date{rowsLoaded !== 1 ? 's' : ''} loaded</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
              <Icon name="Target" size={16} color="currentColor" strokeWidth={2} />
            </span>
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">{selectedCount}</span>
              <span className="ml-1">selection{selectedCount !== 1 ? 's' : ''} made</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Updated {new Date()?.toLocaleString('en-SG')}
        </div>
      </div>

      {hasFinancials && (
        <div className="mt-6 pt-6 border-t border-white/70 dark:border-slate-700/70">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Result */}
            <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className={`p-2 rounded-xl ${totalResult >= 0 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'}`}>
                  <Icon
                    name={totalResult >= 0 ? 'TrendingUp' : 'TrendingDown'}
                    size={20}
                    color="currentColor"
                    strokeWidth={2.5}
                  />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Total Cost Result
                  </div>
                  <div className={`text-xl font-bold ${totalResult >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {formatCurrency(totalResult)}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                dividend received + (open price − closing price) − trade fee − margin fee
              </div>
            </div>

            {/* Trade Fees */}
            <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-amber-500/15 text-amber-500">
                  <Icon
                    name="Receipt"
                    size={20}
                    color="currentColor"
                    strokeWidth={2.5}
                  />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Trade Fee (Open & Close)
                  </div>
                  <div className="text-xl font-bold text-amber-500">
                    {formatCurrency(totalTradeFee)}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Calculated at max(0.127% of trade value, S$4.10) per leg.
              </div>
            </div>

            {/* Margin Fees */}
            <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-300">
                  <Icon
                    name="Coins"
                    size={20}
                    color="currentColor"
                    strokeWidth={2.5}
                  />
                </span>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Margin Fee
                  </div>
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-300">
                    {formatCurrency(totalMarginFee)}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Daily interest on borrowed funds at 6% p.a. prorated by holding days.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Additional info row */}
      <div className="flex flex-col gap-3 mt-6 pt-6 border-t border-white/70 dark:border-slate-700/70 text-xs text-slate-500 dark:text-slate-400 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            <Icon name="Clock" size={12} />
            <span>Data snapshot: {new Date()?.toLocaleString('en-SG')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Icon name="Zap" size={12} />
            <span>Margin Rate: 6% p.a.</span>
          </div>
          <div className="flex items-center gap-1">
            <Icon name="Calculator" size={12} />
            <span>Trade Fee: max(0.127% × value, S$4.10) per leg</span>
          </div>
        </div>

        <div className="text-xs">
          SGX Trading • Real-time calculations
        </div>
      </div>
    </div>
  );
};

export default SummaryStrip;
