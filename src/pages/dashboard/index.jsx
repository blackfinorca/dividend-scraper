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
    const horizonEnd = new Date(now.getFullYear() + 1, 11, 31); // cover the entire next calendar year
    const diffMs = horizonEnd.getTime() - now.getTime();
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
    <div className="min-h-screen bg-background flex flex-col">
      <ApplicationHeader theme={theme} onThemeToggle={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))} />
      <main className="flex-1 pt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground mb-2">Upcoming Dividends Dashboard</h1>
            <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
              <p>
                This dashboard aggregates the latest dividend guidance for Singapore-listed counters using an offline snapshot that refreshes daily. We focus on upcoming ex-dates, previously declared cash distributions, and implied yields to help you stage capture strategies ahead of time.
              </p>
              <p>
                Current coverage spans the Straits Times Index and major REITs, with fallback logic that surfaces the most recent records whenever a live feed is unavailable. Dates are normalised to the Singapore trading calendar and rounded to the nearest publishable announcement.
              </p>
              <p>
                Key assumptions: instruments trade in board lots with full cash settlement, dividends are credited in the declared currency without FX haircuts, and corporate actions (e.g., splts, rights issues) are already reflected in the raw file. Any ticker not present in the dataset is treated as having no scheduled distributions in the current window.
              </p>
            </div>
          </div>

          {error && (
            <StatusBanner type="error" message={error} className="mb-4" />
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Upcoming Events</div>
              <div className="text-2xl font-semibold text-foreground">{loading ? '—' : totalUpcoming}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Next Ex-Date</div>
              <div className="text-2xl font-semibold text-foreground">{loading ? '—' : (nextDividendDate ? new Date(nextDividendDate).toLocaleDateString('en-GB') : '—')}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Lookahead Window</div>
              <div className="text-2xl font-semibold text-foreground">{horizonLabel}</div>
              <div className="text-xs text-muted-foreground mt-1">({lookaheadDays} days remaining)</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/70">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ticker</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ex-Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dividend Yield</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dividend Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Loading upcoming dividends...</td>
                    </tr>
                  ) : sortedUpcomingDividends.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No upcoming ex-dividend dates scheduled through {horizonLabel}.</td>
                    </tr>
                  ) : (
                    sortedUpcomingDividends.map((item) => {
                      const highlight = isWithinSevenDays(item.exDate);
                      return (
                        <tr
                          key={`${item.ticker}-${item.exDate}`}
                          className={`transition-colors ${highlight ? 'bg-muted/20 hover:bg-muted/30' : 'hover:bg-accent/40'}`}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{item.ticker}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{item.companyName || '—'}</td>
                          <td className={`px-4 py-3 text-sm ${highlight ? 'text-foreground font-semibold' : 'text-foreground'}`}>
                            {new Date(item.exDate).toLocaleDateString('en-GB')}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">{item.yieldLabel ?? formatPercentage(item.yieldPercentage)}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{item.dividendAmountLabel ?? formatCurrency(item.dividendAmount)}</td>
                          <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            iconName="BarChart2"
                            iconSize={14}
                            onClick={() => handleAnalyzeTicker(item.ticker)}
                          >
                            Analyze
                          </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 bg-card border border-border rounded-lg shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-lg font-semibold text-foreground">Dividend Capture Calculator</h2>
              <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                <p>
                  Use this calculator to back-test a capture play on the most recent ex-date: choose a portfolio ticker, specify the shares you would hold (or the capital you would leverage), and we infer the implied dividend payout plus price drift around the ex-window.
                </p>
                <p>
                  Assumptions baked into the math: trades execute at the recorded closing prices, cash flows settle in SGD, and margin financing carries a flat six-percent annual rate with SGX-standard brokerage fees (0.127% subject to a S$4.10 minimum each way).
                </p>
                <p>
                  We prioritise declared dividends over speculative guidance, treat missing price nodes as unavailable, and floor the resulting position size at zero. If you enter both shares and capital, the explicit share count wins; otherwise we compute a rounded lot size based on the ex-date price.
                </p>
              </div>
            </div>
            <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2 block" htmlFor="ticker-search">
                  Ticker
                </label>
                <Input
                  id="ticker-search"
                  placeholder="Start typing (e.g. D05)"
                  value={tickerInput}
                  onChange={(event) => setTickerInput(event.target.value)}
                  list="dashboard-tickers"
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
                  <div className="mt-2 text-xs text-muted-foreground">
                    {selectedTickerMeta?.displayTicker ?? selectedTicker}
                    {calculatorTickerLabel ? ` — ${calculatorTickerLabel}` : ''}
                  </div>
                )}
                {!selectedTicker && tickerInput && (
                  <div className="mt-2 text-xs text-destructive">
                    {tickerOptions.length
                      ? 'Select a valid ticker from the catalogue.'
                      : 'Ticker catalogue not available yet.'}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2 block" htmlFor="share-count">
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
                />
                <div className="mt-2 text-xs text-muted-foreground">
                  Leave blank if you prefer to work with a margin amount.
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2 block" htmlFor="margin-amount">
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
                />
                <div className="mt-2 text-xs text-muted-foreground">
                  If both fields are filled, priority is given to the share count.
                </div>
              </div>
            </div>
            <div className="border-t border-border px-4 py-4">
              {calculatorLoading ? (
                <div className="text-sm text-muted-foreground">Loading dividend history...</div>
              ) : calculatorError ? (
                <div className="text-sm text-destructive">{calculatorError}</div>
              ) : !selectedTicker ? (
                <div className="text-sm text-muted-foreground">Pick a ticker to view the latest dividend information.</div>
              ) : !snapshot ? (
                <div className="text-sm text-muted-foreground">No dividend history found for the selected ticker.</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">Last Ex-Dividend Date</div>
                    <div className="text-base font-semibold text-foreground">
                      {snapshot.lastExDate ? new Date(snapshot.lastExDate).toLocaleDateString('en-GB') : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">Dividend / Share</div>
                    <div className="text-base font-semibold text-foreground">
                      {snapshot.dividendAmount !== null ? formatMoney(snapshot.dividendAmount, 4) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">Ex-Date Price</div>
                    <div className="text-base font-semibold text-foreground">
                      {snapshot.exDatePrice !== null ? formatMoney(snapshot.exDatePrice, 4) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wide">Estimated Dividend</div>
                    <div className="text-base font-semibold text-foreground">
                      {calculatorResult?.totalDividend !== null
                        ? `S$ ${formatMoney(calculatorResult.totalDividend, 2)}`
                        : '—'}
                    </div>
                    {calculatorResult?.shares !== null && (
                      <div className="text-xs text-muted-foreground mt-1">
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
                      <div className="text-xs text-muted-foreground mt-1">
                        Approx. yield on capital: {calculatorResult.estimatedYield.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <ApplicationFooter />
    </div>
  );
};

export default Dashboard;
