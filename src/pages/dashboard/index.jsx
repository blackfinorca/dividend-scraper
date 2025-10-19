import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApplicationHeader from '../../components/ui/ApplicationHeader';
import StatusBanner from '../../components/ui/StatusBanner';
import Input from '../../components/ui/Input';
import ApplicationFooter from '../../components/ui/ApplicationFooter';
import {
  fetchUpcomingDividends,
  fetchTickerCatalogue,
  fetchLatestDividendSnapshot,
} from '../../utils/dividendDataApi';
import Button from '../../components/ui/Button';

const formatCurrency = (value) => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(4);
};

const formatPercentage = (value) => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  return `${value.toFixed(2)}%`;
};

const Dashboard = () => {
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [upcomingDividends, setUpcomingDividends] = useState([]);
  const [tickerOptions, setTickerOptions] = useState([]);
  const [tickerInput, setTickerInput] = useState('');
  const [selectedTicker, setSelectedTicker] = useState('');
  const [calculatorLoading, setCalculatorLoading] = useState(false);
  const [calculatorError, setCalculatorError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [shareCountInput, setShareCountInput] = useState('');
  const [marginAmountInput, setMarginAmountInput] = useState('');
  const navigate = useNavigate();

  const tickerVariantLookup = useMemo(() => {
    const map = new Map();
    tickerOptions.forEach((option) => {
      if (!option) {
        return;
      }
      const canonical = option.ticker?.toUpperCase();
      if (canonical) {
        map.set(canonical, option);
      }
      (option.variants || []).forEach((variant) => {
        if (variant) {
          map.set(variant.toUpperCase(), option);
        }
      });
    });
    return map;
  }, [tickerOptions]);

  const tickerCanonicalLookup = useMemo(() => {
    const map = new Map();
    tickerOptions.forEach((option) => {
      if (option?.ticker) {
        map.set(option.ticker, option);
      }
    });
    return map;
  }, [tickerOptions]);

  const { lookaheadDays, horizonLabel } = useMemo(() => {
    const now = new Date();
    const horizonEnd = new Date(2025, 11, 31); // fixed horizon through end of 2025
    const diffMs = Math.max(0, horizonEnd.getTime() - now.getTime());
    const diffDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const label = horizonEnd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return { lookaheadDays: diffDays, horizonLabel: label };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchUpcomingDividends({ lookaheadDays });
        if (isMounted) {
          setUpcomingDividends(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || 'Failed to load upcoming dividends.');
          setUpcomingDividends([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [lookaheadDays]);

  useEffect(() => {
    let isMounted = true;
    const loadTickers = async () => {
      try {
        const options = await fetchTickerCatalogue();
        if (isMounted) {
          setTickerOptions(options);
        }
      } catch (err) {
        console.warn('Unable to load dashboard tickers', err);
      }
    };

    loadTickers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const candidate = tickerInput.trim().toUpperCase();
    const matched = candidate ? tickerVariantLookup.get(candidate) : null;
    if (matched) {
      setSelectedTicker((prev) => (prev === matched.ticker ? prev : matched.ticker));
    } else if (selectedTicker) {
      setSelectedTicker('');
    }
  }, [tickerInput, tickerVariantLookup, selectedTicker]);

  useEffect(() => {
    if (!selectedTicker) {
      setSnapshot(null);
      setCalculatorError('');
      return;
    }

    let isMounted = true;
    const loadSnapshot = async () => {
      setCalculatorLoading(true);
      setCalculatorError('');
      try {
        const data = await fetchLatestDividendSnapshot(selectedTicker);
        if (isMounted) {
          setSnapshot(data);
        }
      } catch (err) {
        if (isMounted) {
          setSnapshot(null);
          setCalculatorError(err?.message || 'Unable to load dividend history for the selected ticker.');
        }
      } finally {
        if (isMounted) {
          setCalculatorLoading(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      isMounted = false;
    };
  }, [selectedTicker]);

  const sortedUpcomingDividends = useMemo(() => {
    if (!upcomingDividends?.length) {
      return [];
    }
    return upcomingDividends.slice().sort((a, b) => {
      const aDate = new Date(a.exDate);
      const bDate = new Date(b.exDate);
      return aDate.getTime() - bDate.getTime();
    });
  }, [upcomingDividends]);

  const nextDividendDate = useMemo(() => {
    if (!sortedUpcomingDividends.length) {
      return null;
    }
    return sortedUpcomingDividends[0].exDate;
  }, [sortedUpcomingDividends]);

  const totalUpcoming = sortedUpcomingDividends.length;

  const isWithinSevenDays = useCallback((dateLike) => {
    if (!dateLike) {
      return false;
    }
    const target = new Date(dateLike);
    if (Number.isNaN(target.getTime())) {
      return false;
    }
    const today = new Date();
    const diffMs = target.getTime() - today.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays < 7;
  }, []);

  const handleAnalyzeTicker = useCallback(
    (ticker) => {
      if (!ticker) {
        return;
      }
      navigate(`/dividend-capture-analyzer?ticker=${encodeURIComponent(ticker)}`);
    },
    [navigate]
  );

  const tickerNameLookup = useMemo(() => {
    const map = new Map();
    tickerOptions.forEach((option) => {
      map.set(option.ticker, option.companyName);
    });
    return map;
  }, [tickerOptions]);

  const parsedShareCount = useMemo(() => {
    const value = parseFloat(shareCountInput);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  }, [shareCountInput]);

  const parsedMarginAmount = useMemo(() => {
    const value = parseFloat(marginAmountInput);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return value;
  }, [marginAmountInput]);

  const calculatorResult = useMemo(() => {
    if (!snapshot) {
      return null;
    }
    const dividendPerShare = snapshot.dividendAmount;
    if (dividendPerShare === null || Number.isNaN(dividendPerShare)) {
      return null;
    }

    const sharesFromInput = parsedShareCount;
    const exDatePrice = snapshot.exDatePrice;
    let estimatedShares = null;

    if (sharesFromInput !== null) {
      estimatedShares = sharesFromInput;
    } else if (parsedMarginAmount !== null && exDatePrice && exDatePrice > 0) {
      estimatedShares = Math.floor(parsedMarginAmount / exDatePrice);
    }

    if (estimatedShares === null || estimatedShares <= 0) {
      return {
        shares: null,
        totalDividend: null,
        estimatedYield: null,
      };
    }

    const totalDividend = estimatedShares * dividendPerShare;
    const estimatedYield =
      parsedMarginAmount !== null && parsedMarginAmount > 0
        ? (totalDividend / parsedMarginAmount) * 100
        : null;

    return {
      shares: estimatedShares,
      totalDividend,
      estimatedYield,
    };
  }, [snapshot, parsedShareCount, parsedMarginAmount]);

  const formatMoney = (value, fractionDigits = 2) => {
    if (value === null || Number.isNaN(value)) {
      return '—';
    }
    return value.toLocaleString('en-SG', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  };

  const calculatorTickerLabel = useMemo(() => {
    if (!selectedTicker) {
      return '';
    }
    return tickerNameLookup.get(selectedTicker) || '';
  }, [selectedTicker, tickerNameLookup]);

  const selectedTickerMeta = selectedTicker ? tickerCanonicalLookup.get(selectedTicker) : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white flex flex-col">
      <ApplicationHeader
        theme={theme}
        onThemeToggle={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/50 shadow-sm"
      />
      <main className="flex-1 pt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-lg p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 via-emerald-500 to-blue-400 text-transparent bg-clip-text font-['Poppins',sans-serif]">
                  Upcoming Dividends Dashboard
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Find upcoming dividends in one place and calculate capture profits using leverage.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-4 text-right">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Lookahead</span>
                  <div className="mt-1 text-lg font-semibold">{horizonLabel}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{lookaheadDays} days remaining</span>
                </div>
                <div className="rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-4 text-right">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Upcoming</span>
                  <div className="mt-1 text-lg font-semibold">{loading ? '—' : totalUpcoming}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">tracked events</span>
                </div>
              </div>
            </div>
          </header>

          {error && (
            <StatusBanner type="error" message={error} className="mb-4" />
          )}

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white font-['Poppins',sans-serif]">
                  Upcoming Ex-Dividend Events
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Sorted by ex-date; cards highlight events within 7 days so you can plan captures quickly.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex h-3 w-3 rounded-full bg-slate-900/70 dark:bg-white/80" />
                <span>Ex-date within the next week</span>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-lg border border-white/70 dark:border-slate-700/70 rounded-xl shadow-lg p-6 animate-pulse space-y-4"
                  >
                    <div className="h-6 bg-slate-200/70 dark:bg-slate-700/70 rounded" />
                    <div className="h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded w-3/4" />
                    <div className="h-4 bg-slate-200/70 dark:bg-slate-700/70 rounded w-1/2" />
                    <div className="flex gap-3">
                      <span className="h-8 flex-1 bg-slate-200/70 dark:bg-slate-700/70 rounded" />
                      <span className="h-8 w-16 bg-slate-200/70 dark:bg-slate-700/70 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedUpcomingDividends.length === 0 ? (
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-xl shadow-lg p-6 text-center text-sm text-slate-600 dark:text-slate-300">
                No upcoming ex-dividend dates scheduled through {horizonLabel}.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedUpcomingDividends.map((item) => {
                  const highlight = isWithinSevenDays(item.exDate);
                  return (
                    <div
                      key={`${item.ticker}-${item.exDate}`}
                      className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/90 dark:border-slate-700/90 rounded-xl shadow-lg p-6 transition-all duration-200 hover:shadow-xl flex flex-col gap-4 ${
                        highlight ? 'ring-1 ring-slate-900/50 dark:ring-white/60' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ticker</span>
                          <div className="mt-1 text-2xl font-semibold font-mono text-slate-900 dark:text-white">{item.ticker}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-300">{item.companyName || '—'}</div>
                        </div>
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${highlight ? 'bg-slate-900/90 text-white dark:bg-white/90 dark:text-slate-900' : 'bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200'}`}>
                          {new Date(item.exDate).toLocaleDateString('en-GB')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1">
                          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Yield</span>
                          <div className="text-base font-semibold text-slate-900 dark:text-white">{item.yieldLabel ?? formatPercentage(item.yieldPercentage)}</div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Dividend</span>
                          <div className="text-base font-mono font-semibold text-slate-900 dark:text-white">{item.dividendAmountLabel ?? formatCurrency(item.dividendAmount)}</div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pay Date</span>
                          <div className="text-sm text-slate-700 dark:text-slate-300">{item.dividendPayDate ? new Date(item.dividendPayDate).toLocaleDateString('en-GB') : 'Pending'}</div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Days Away</span>
                          <div className="text-sm text-slate-700 dark:text-slate-300">
                            {(() => {
                              const today = new Date();
                              const ex = new Date(item.exDate);
                              const diff = Math.ceil((ex.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                              return diff >= 0 ? `${diff} day${diff === 1 ? '' : 's'}` : 'Passed';
                            })()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                          iconName="BarChart2"
                          iconSize={14}
                          onClick={() => handleAnalyzeTicker(item.ticker)}
                        >
                          Analyze
                        </Button>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Last updated {new Date().toLocaleDateString('en-GB')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-5 border-b border-white/70 dark:border-slate-700/70 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white font-['Poppins',sans-serif]">
                  Dividend Capture Calculator
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                  Back-test ex-date capture plays: we prefill dividends and price history so you can size positions with confidence.
                </p>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Data refreshed {new Date().toLocaleString('en-GB')}
              </div>
            </div>

            <div className="px-6 py-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 block" htmlFor="dashboard-ticker-input">
                  Ticker
                </label>
                <Input
                  id="dashboard-ticker-input"
                  placeholder="Start typing (e.g. D05)"
                  value={tickerInput}
                  onChange={(event) => setTickerInput(event.target.value)}
                  list="dashboard-tickers"
                  className="bg-white/70 dark:bg-slate-900/50 border border-white/70 dark:border-slate-700/80 focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="dashboard-tickers">
                  {tickerOptions.map((option) => (
                    <option key={option.ticker} value={option.ticker}>
                      {option.displayTicker}
                      {option.companyName ? ` — ${option.companyName}` : ''}
                      {option.marketCapDisplay ? ` — ${option.marketCapDisplay}` : ''}
                    </option>
                  ))}
                </datalist>
                {selectedTicker && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
                    {selectedTickerMeta?.displayTicker ?? selectedTicker}
                    {calculatorTickerLabel ? ` — ${calculatorTickerLabel}` : ''}
                  </div>
                )}
                {!selectedTicker && tickerInput && (
                  <div className="mt-2 text-xs text-red-500">
                    {tickerOptions.length
                      ? 'Select a valid ticker from the catalogue.'
                      : 'Ticker catalogue not available yet.'}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 block" htmlFor="share-count">
                  Number of Shares
                </label>
                <Input
                  id="share-count"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 1000"
                  value={shareCountInput}
                  onChange={(event) => setShareCountInput(event.target.value)}
                  className="bg-white/70 dark:bg-slate-900/50 border border-white/70 dark:border-slate-700/80 focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Leave blank if you prefer to work with a margin amount.
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 block" htmlFor="margin-amount">
                  Margin Amount (SGD)
                </label>
                <Input
                  id="margin-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 15000"
                  value={marginAmountInput}
                  onChange={(event) => setMarginAmountInput(event.target.value)}
                  className="bg-white/70 dark:bg-slate-900/50 border border-white/70 dark:border-slate-700/80 focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  If both fields are filled, priority is given to the share count.
                </div>
              </div>
            </div>

            <div className="px-6 py-6 border-t border-white/70 dark:border-slate-700/70 bg-white/60 dark:bg-slate-900/40 backdrop-blur">
              {calculatorLoading ? (
                <div className="text-sm text-slate-600 dark:text-slate-300 animate-pulse">Loading dividend history...</div>
              ) : calculatorError ? (
                <div className="text-sm text-red-500">{calculatorError}</div>
              ) : !selectedTicker ? (
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Pick a ticker to view the latest dividend information.
                </div>
              ) : !snapshot ? (
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  No dividend history found for the selected ticker.
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Last Ex-Dividend Date</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {snapshot.lastExDate ? new Date(snapshot.lastExDate).toLocaleDateString('en-GB') : '—'}
                    </div>
                  </div>
                  <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Dividend / Share</div>
                    <div className="mt-2 text-lg font-mono font-semibold text-slate-900 dark:text-white">
                      {snapshot.dividendAmount !== null ? formatMoney(snapshot.dividendAmount, 4) : '—'}
                    </div>
                  </div>
                  <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ex-Date Price</div>
                    <div className="mt-2 text-lg font-mono font-semibold text-slate-900 dark:text-white">
                      {snapshot.exDatePrice !== null ? formatMoney(snapshot.exDatePrice, 4) : '—'}
                    </div>
                  </div>
                  <div className="bg-white/70 dark:bg-slate-900/40 border border-white/70 dark:border-slate-700/70 rounded-xl p-4">
                    <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Estimated Dividend</div>
                    <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {calculatorResult?.totalDividend !== null
                        ? `S$ ${formatMoney(calculatorResult.totalDividend, 2)}`
                        : '—'}
                    </div>
                    {calculatorResult?.shares !== null && (
                      <div className="text-xs text-slate-500 dark:text-slate-300 mt-2">
                        Based on {calculatorResult.shares.toLocaleString('en-SG')} shares
                        {parsedMarginAmount !== null && snapshot.exDatePrice ? (
                          <>
                            {' '}
                            (≈ S$ {formatMoney(calculatorResult.shares * snapshot.exDatePrice, 2)} deployed)
                          </>
                        ) : null}
                      </div>
                    )}
                    {calculatorResult?.estimatedYield !== null && (
                      <div className="text-xs text-slate-500 dark:text-slate-300 mt-1">
                        Approx. yield on capital: {calculatorResult.estimatedYield.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <ApplicationFooter />
    </div>
  );
};

export default Dashboard;
