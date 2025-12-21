import React from 'react';
import Button from '../../../components/ui/Button';
import { cn } from '../../../utils/cn';

const formatDate = (value) => {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('en-GB');
};

const formatYield = (value) => {
  if (!value) {
    return '—';
  }
  const trimmed = String(value).trim();
  return trimmed || '—';
};

const DividendEventsTable = ({
  rows = [],
  year = null,
  filterLabel = '',
  loading = false,
  error = '',
  onSelectTicker,
  className = '',
}) => {
  const hasFilter = Boolean(filterLabel);
  const eventsHeader = year ? `Dividend Events (${year})` : 'Dividend Events';

  return (
    <section
      className={cn(
        'bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-xl',
        className
      )}
    >
      <div className="px-6 py-4 border-b border-white/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Filtered Dividend Events
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {hasFilter
              ? `Showing tickers with ${filterLabel} dividend events per year${year ? ` (based on ${year})` : ''}.`
              : 'Select a dividend event filter to see matching tickers.'}
          </p>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Results: {loading ? '—' : hasFilter ? rows.length : '—'}
        </div>
      </div>

      <div className="px-6 py-4">
        {loading && (
          <div className="text-xs text-slate-500 dark:text-slate-300">Loading dividend event filters…</div>
        )}

        {!loading && error && (
          <div className="text-xs text-rose-500 bg-rose-100/60 dark:bg-rose-500/10 border border-rose-400/40 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {!loading && !error && hasFilter && rows.length === 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-300">
            No tickers match the selected dividend event count.
          </div>
        )}

        {!loading && !error && hasFilter && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-white/70 dark:border-slate-700/70">
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4">{eventsHeader}</th>
                  <th className="py-2 pr-4">Yield</th>
                  <th className="py-2 pr-4">Next Dividend Date</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/60 dark:divide-slate-700/60">
                {rows.map((row) => (
                  <tr key={row.ticker} className="text-slate-700 dark:text-slate-200">
                    <td className="py-2 pr-4 font-semibold font-mono">{row.ticker}</td>
                    <td className="py-2 pr-4">{row.eventCount}</td>
                    <td className="py-2 pr-4">{formatYield(row.yieldLabel)}</td>
                    <td className="py-2 pr-4">{formatDate(row.nextDividendDate)}</td>
                    <td className="py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onSelectTicker?.(row.ticker)}
                        disabled={!onSelectTicker}
                        className="whitespace-nowrap"
                      >
                        Add to the analysis
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default DividendEventsTable;
