import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApplicationHeader from '../../components/ui/ApplicationHeader';
import StatusBanner from '../../components/ui/StatusBanner';
import Input from '../../components/ui/Input';
import { fetchPortfolioSummary } from '../../utils/dividendDataApi';
import ApplicationFooter from '../../components/ui/ApplicationFooter';

const formatPercentage = (value) => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(2)}%`;
};

const formatDividend = (value) => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(4);
};

const formatIndex = (value) => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(2);
};

const formatMarketCapValue = (value, display) => {
  if (display) {
    return display;
  }
  if (!Number.isFinite(value)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch (error) {
    return value.toLocaleString('en-SG');
  }
};

const Portfolio = () => {
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [portfolioRows, setPortfolioRows] = useState([]);
  const [yieldThreshold, setYieldThreshold] = useState('');
  const [sortConfig, setSortConfig] = useState({ column: 'marketCap', direction: 'desc' });
  const navigate = useNavigate();

  const handleThemeToggle = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadPortfolio = async () => {
      setLoading(true);
      setError('');
      try {
        const summary = await fetchPortfolioSummary();
        if (isMounted) {
          setPortfolioRows(summary);
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Failed to load portfolio summary.');
          setPortfolioRows([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPortfolio();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredRows = useMemo(() => {
    let rows = [...portfolioRows];

    if (searchTerm) {
      const query = searchTerm.trim().toLowerCase();
      rows = rows.filter((row) =>
        row.ticker.toLowerCase().includes(query) ||
        (row.companyName || '').toLowerCase().includes(query)
      );
    }

    if (yieldThreshold) {
      const thresholdValue = parseFloat(yieldThreshold);
      if (!Number.isNaN(thresholdValue)) {
        rows = rows.filter((row) => {
          const yieldValue = row.averageYield;
          return yieldValue !== null && !Number.isNaN(yieldValue) && yieldValue > thresholdValue;
        });
      }
    }

    if (sortConfig?.column) {
      const { column, direction } = sortConfig;
      const multiplier = direction === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const isMissing = (value) =>
          value === null ||
          value === undefined ||
          (typeof value === 'number' && !Number.isFinite(value));

        const compare = (valueA, valueB, fallbackHigh = Number.POSITIVE_INFINITY, fallbackLow = Number.NEGATIVE_INFINITY) => {
          const normalizedA = isMissing(valueA) ? (direction === 'asc' ? fallbackHigh : fallbackLow) : valueA;
          const normalizedB = isMissing(valueB) ? (direction === 'asc' ? fallbackHigh : fallbackLow) : valueB;
          if (normalizedA < normalizedB) return -1;
          if (normalizedA > normalizedB) return 1;
          return 0;
        };

        switch (column) {
          case 'ticker':
            return multiplier * (a.ticker || '').localeCompare(b.ticker || '', undefined, { sensitivity: 'base' });
          case 'companyName':
            return multiplier * (a.companyName || '').localeCompare(b.companyName || '', undefined, { sensitivity: 'base' });
          case 'marketCap': {
            const capA = Number.isFinite(a.marketCap) ? a.marketCap : null;
            const capB = Number.isFinite(b.marketCap) ? b.marketCap : null;
            const missingA = capA === null;
            const missingB = capB === null;
            const tickerComparison = (a.ticker || '').localeCompare(b.ticker || '', undefined, { sensitivity: 'base' });
            if (missingA && missingB) {
              return direction === 'asc' ? tickerComparison : -tickerComparison;
            }
            if (missingA) return direction === 'asc' ? 1 : -1;
            if (missingB) return direction === 'asc' ? -1 : 1;
            if (capA < capB) return direction === 'asc' ? -1 : 1;
            if (capA > capB) return direction === 'asc' ? 1 : -1;
            return direction === 'asc' ? tickerComparison : -tickerComparison;
          }
          case 'averageYield':
            return multiplier * compare(a.averageYield, b.averageYield);
          case 'volatilityIndex':
            return multiplier * compare(a.volatilityIndex, b.volatilityIndex);
          case 'averageDividend':
            return multiplier * compare(a.averageDividend, b.averageDividend);
          case 'events':
            return multiplier * compare(a.events, b.events);
          case 'latestExDate': {
            const dateA = a.latestExDate ? new Date(a.latestExDate) : null;
            const dateB = b.latestExDate ? new Date(b.latestExDate) : null;
            const timeA = dateA && !Number.isNaN(dateA.getTime()) ? dateA.getTime() : null;
            const timeB = dateB && !Number.isNaN(dateB.getTime()) ? dateB.getTime() : null;
            return multiplier * compare(timeA, timeB);
          }
          default:
            return 0;
        }
      });
    }

    return rows;
  }, [portfolioRows, searchTerm, yieldThreshold, sortConfig]);

  const sortOptions = useMemo(() => [
    { value: 'marketCap', label: 'Market Cap' },
    { value: 'averageYield', label: 'Average Yield' },
    { value: 'averageDividend', label: 'Average Dividend' },
    { value: 'volatilityIndex', label: 'Volatility Index' },
    { value: 'events', label: 'Events Tracked' },
    { value: 'latestExDate', label: 'Latest Ex-Date' },
    { value: 'ticker', label: 'Ticker' },
    { value: 'companyName', label: 'Company Name' },
  ], []);

  const handleSortColumnChange = useCallback((event) => {
    const column = event.target.value;
    setSortConfig((prev) => {
      if (prev.column === column) {
        return prev;
      }
      return {
        column,
        direction: column === 'marketCap' ? 'desc' : 'asc',
      };
    });
  }, []);

  const toggleSortDirection = useCallback(() => {
    setSortConfig((prev) => ({
      column: prev.column,
      direction: prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const filteredCount = filteredRows.length;
  const totalTickers = portfolioRows.length;
  const selectedSortOption = sortOptions.find((option) => option.value === sortConfig.column) || sortOptions[0];
  const isSortDesc = sortConfig.direction === 'desc';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white flex flex-col">
      <ApplicationHeader theme={theme} onThemeToggle={handleThemeToggle} className="bg-white/70 dark:bg-slate-900/80 backdrop-blur-md border-b border-white/60 dark:border-slate-700/70 shadow-sm" />
      <main className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-lg p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 via-emerald-500 to-blue-400 text-transparent bg-clip-text font-['Poppins',sans-serif]">
                  Portfolio Overview
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                  Compare dividend consistency, yield potential, and volatility across the tracked SGX universe.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-4">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Tracked Tickers</span>
                  <div className="mt-1 text-2xl font-semibold font-mono text-slate-900 dark:text-white">{totalTickers}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">from offline snapshot</span>
                </div>
                <div className="rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-4">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Filtered View</span>
                  <div className="mt-1 text-2xl font-semibold font-mono text-emerald-500">{filteredCount}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">matching your criteria</span>
                </div>
                <div className="rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-4">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Sort Order</span>
                  <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedSortOption.label}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{isSortDesc ? 'Descending' : 'Ascending'}</span>
                </div>
              </div>
            </div>
          </header>

          {error && (
            <StatusBanner
              type="error"
              message={error}
              className="bg-white/80 dark:bg-slate-800/80 border border-white/80 dark:border-slate-700/80 rounded-2xl"
            />
          )}

          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-lg p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Showing <span className="font-semibold text-slate-900 dark:text-white">{filteredCount}</span> of {totalTickers} tickers
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 flex-1">
                <Input
                  placeholder="Search by ticker or company"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="bg-white/70 dark:bg-slate-900/50 border border-white/70 dark:border-slate-700/70 focus:ring-2 focus:ring-blue-500"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="Yield more than (%)"
                  value={yieldThreshold}
                  onChange={(event) => setYieldThreshold(event.target.value)}
                  className="bg-white/70 dark:bg-slate-900/50 border border-white/70 dark:border-slate-700/70 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center gap-2">
                  <label htmlFor="portfolio-sort" className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Sort by
                  </label>
                  <select
                    id="portfolio-sort"
                    value={selectedSortOption.value}
                    onChange={handleSortColumnChange}
                    className="h-10 flex-1 rounded-lg border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/50 px-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSortDirection}
                    className="h-10 w-full rounded-lg border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/50 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-900/70 transition"
                  >
                    {isSortDesc ? 'Descending' : 'Ascending'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`skeleton-${index}`} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-lg border border-white/70 dark:border-slate-700/70 rounded-xl shadow-lg p-6 animate-pulse space-y-4">
                  <div className="h-6 bg-slate-200/70 dark:bg-slate-700/70 rounded w-1/2"></div>
                  <div className="h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded w-3/4"></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
                    <div className="h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
                    <div className="h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
                    <div className="h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCount === 0 ? (
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-xl shadow-lg p-6 text-center text-sm text-slate-600 dark:text-slate-300">
              No tickers match your search criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRows.map((row) => (
                <div key={row.ticker} className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/90 dark:border-slate-700/90 rounded-xl shadow-lg p-6 flex flex-col gap-4 transition-all duration-200 hover:shadow-xl">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ticker</span>
                      <div className="mt-1 text-2xl font-mono font-semibold text-slate-900 dark:text-white">{row.ticker}</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">{row.companyName || '—'}</div>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                      {formatMarketCapValue(row.marketCap, row.marketCapDisplay)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="text-xs uppercase tracking-wide">Avg Yield</span>
                      <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{formatPercentage(row.averageYield)}</div>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide">Avg Dividend</span>
                      <div className="mt-1 text-base font-mono font-semibold text-slate-900 dark:text-white">{formatDividend(row.averageDividend)}</div>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide">Volatility Index</span>
                      <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{formatIndex(row.volatilityIndex)}</div>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide">Events</span>
                      <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{row.events}</div>
                    </div>
                    <div>
                      <span className="text-xs uppercase tracking-wide">Last Ex-Date</span>
                      <div className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                        {row.latestExDate ? new Date(row.latestExDate).toLocaleDateString('en-GB') : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/dividend-capture-analyzer?ticker=${encodeURIComponent(row.ticker)}`)}
                      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-md transition hover:bg-blue-700"
                    >
                      Analyze
                    </button>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Yield &gt; {yieldThreshold || '0'}? {row.averageYield !== null && yieldThreshold ? (row.averageYield > parseFloat(yieldThreshold) ? 'Yes' : 'No') : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <ApplicationFooter />
    </div>
  );
};

export default Portfolio;
