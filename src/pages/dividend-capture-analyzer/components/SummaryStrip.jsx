import React from 'react';
import Icon from '../../../components/AppIcon';
import { cn } from '../../../utils/cn';

const SummaryStrip = ({
  rowsLoaded = 0,
  selectedCount = 0,
  totalTradeFee = 0,
  totalMarginFee = 0,
  totalDividendReceived = 0,
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

  const hasFinancials =
    totalTradeFee !== 0 || totalMarginFee !== 0 || totalDividendReceived !== 0 || totalResult !== 0;

  return (
    <div
      className={cn(
        'bg-white/90 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-md p-4 sm:p-5',
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">P&amp;L Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Capture summary of loaded events and current selection markers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-300">
              <Icon name="Database" size={14} color="currentColor" strokeWidth={2} />
            </span>
            <div className="leading-tight">
              <span className="font-semibold text-slate-900 dark:text-white">{rowsLoaded}</span>
              <span className="ml-1">ex-date{rowsLoaded !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
              <Icon name="Target" size={14} color="currentColor" strokeWidth={2} />
            </span>
            <div className="leading-tight">
              <span className="font-semibold text-slate-900 dark:text-white">{selectedCount}</span>
              <span className="ml-1">selection{selectedCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Icon name="Clock" size={12} />
            <span>Updated {new Date()?.toLocaleTimeString('en-SG')}</span>
          </div>
        </div>
      </div>

      {hasFinancials && (
        <div className="mt-4 border-t border-white/70 dark:border-slate-700/70 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white/80 dark:bg-slate-900/60 border border-white/70 dark:border-slate-700/70 rounded-xl p-5 sm:col-span-1">
              <div className="flex items-center gap-3">
                <span
                  className={`p-2.5 rounded-lg ${
                    totalResult >= 0 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'
                  }`}
                >
                  <Icon
                    name={totalResult >= 0 ? 'TrendingUp' : 'TrendingDown'}
                    size={20}
                    color="currentColor"
                    strokeWidth={2.7}
                  />
                </span>
                <div className="leading-tight">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Total P&amp;L
                  </div>
                  <div
                    className={`text-2xl font-semibold ${
                      totalResult >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {formatCurrency(totalResult)}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                dividend received + (sell price − buy price) − trade fee − margin fee
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-emerald-500/15 text-emerald-500">
                  <Icon name="DollarSign" size={18} color="currentColor" strokeWidth={2.3} />
                </span>
                <div className="leading-tight">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Dividend Received
                  </div>
                  <div className="text-lg font-semibold text-emerald-500">
                    {formatCurrency(totalDividendReceived)}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Gross cash credited from captures based on selected quantity.
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-amber-500/15 text-amber-500">
                  <Icon name="Receipt" size={18} color="currentColor" strokeWidth={2.3} />
                </span>
                <div className="leading-tight">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Trade Fee (Open & Close)
                  </div>
                  <div className="text-lg font-semibold text-amber-500">{formatCurrency(totalTradeFee)}</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                max(0.127% × trade value, S$4.10) per leg
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-300">
                  <Icon name="Coins" size={18} color="currentColor" strokeWidth={2.3} />
                </span>
                <div className="leading-tight">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Margin Fee
                  </div>
                  <div className="text-lg font-semibold text-blue-600 dark:text-blue-300">
                    {formatCurrency(totalMarginFee)}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                6% p.a. applied to borrowed funds, prorated by holding days
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-white/70 dark:border-slate-700/70 pt-3 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Icon name="Zap" size={12} />
          <span>Margin rate 6% p.a.</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="Calculator" size={12} />
          <span>Fees recomputed on selection changes</span>
        </div>
        <div className="flex items-center gap-2">
          <Icon name="Activity" size={12} />
          <span>SGX focus • Real-time math</span>
        </div>
      </div>
    </div>
  );
};

export default SummaryStrip;
