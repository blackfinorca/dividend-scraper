import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

  const handleSort = useCallback((column) => {
    setSortConfig((prev) => {
      if (prev.column === column) {
        return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { column, direction: column === 'marketCap' ? 'desc' : 'asc' };
    });
  }, []);

  const getSortIndicator = useCallback((column) => {
    if (sortConfig.column !== column) {
      return '↕';
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  }, [sortConfig]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <ApplicationHeader theme={theme} onThemeToggle={handleThemeToggle} />
      <main className="flex-1 pt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground mb-2">Portfolio Overview</h1>
            <p className="text-sm text-muted-foreground">
              Summary of dividend opportunities across all tracked Singapore tickers based on the offline dataset.
            </p>
          </div>

          {error && (
            <StatusBanner
              type="error"
              message={error}
              className="mb-4"
            />
          )}

          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {filteredRows.length} of {portfolioRows.length} tickers
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="w-full sm:w-72">
                <Input
                  placeholder="Search by ticker or company name"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full"
                />
              </div>
              <div className="w-full sm:w-48">
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="Yield more than (%)"
                  value={yieldThreshold}
                  onChange={(event) => setYieldThreshold(event.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/70">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleSort('ticker')}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Toggle ticker sorting"
                      >
                        Ticker
                        <span className="text-xs font-normal">{getSortIndicator('ticker')}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleSort('companyName')}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Toggle company name sorting"
                      >
                        Company Name
                        <span className="text-xs font-normal">{getSortIndicator('companyName')}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleSort('marketCap')}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Toggle market cap sorting"
                      >
                        Market Cap
                        <span className="text-xs font-normal">{getSortIndicator('marketCap')}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleSort('averageYield')}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Toggle average dividend yield sorting"
                      >
                        Avg Dividend Yield
                        <span className="text-xs font-normal">{getSortIndicator('averageYield')}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleSort('volatilityIndex')}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Toggle volatility index sorting"
                      >
                        Volatility Index
                        <span className="text-xs font-normal">{getSortIndicator('volatilityIndex')}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleSort('averageDividend')}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Toggle average dividend per share sorting"
                      >
                        Avg Dividend/Share
                        <span className="text-xs font-normal">{getSortIndicator('averageDividend')}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleSort('events')}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Toggle events tracked sorting"
                      >
                        Events Tracked
                        <span className="text-xs font-normal">{getSortIndicator('events')}</span>
                      </button>
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <button
                        type="button"
                        onClick={() => handleSort('latestExDate')}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Toggle most recent ex-date sorting"
                      >
                        Most Recent Ex-Date
                        <span className="text-xs font-normal">{getSortIndicator('latestExDate')}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Loading portfolio data...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No tickers match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.ticker} className="hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{row.ticker}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.companyName || '—'}</td>
                        <td className="px-4 py-3 text-sm text-foreground">
                          {formatMarketCapValue(row.marketCap, row.marketCapDisplay)}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatPercentage(row.averageYield)}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{formatIndex(row.volatilityIndex)}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{formatDividend(row.averageDividend)}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.events}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{row.latestExDate ? new Date(row.latestExDate).toLocaleDateString('en-GB') : '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
      <ApplicationFooter />
    </div>
  );
};

export default Portfolio;
