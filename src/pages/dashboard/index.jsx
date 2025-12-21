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
import Icon from '../../components/AppIcon';

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
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
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

  const { lookaheadDays, horizonLabel, lookaheadHelper } = useMemo(() => {
    // Show all upcoming dividends from the feed (large window to avoid filtering)
    const label = 'All upcoming dividends';
    const helper = 'Full dataset';
    return { lookaheadDays: 3650, horizonLabel: label, lookaheadHelper: helper };
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

  const isWithinThirtyDays = useCallback((dateLike) => {
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
    return diffDays >= 0 && diffDays < 30;
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

  const generateAiSummary = useCallback((records) => {
    if (!Array.isArray(records) || !records.length) {
      return null;
    }
    const events = [];
    const profitsByTicker = new Map();
    const countsByTicker = new Map();
    const yieldsByTicker = new Map();
    const profitsByCount = new Map();
    const profitsByYear = new Map();

    records.forEach((row) => {
      const ticker = (row?.ticker || '').toUpperCase();
      const exDate = row?.ex_dividend_date;
      if (!ticker || !exDate) {
        return;
      }
      const parseNum = (value) => {
        if (value === null || value === undefined || value === '') {
          return null;
        }
        const cleaned = String(value).replace('%', '');
        const numeric = Number.parseFloat(cleaned);
        return Number.isFinite(numeric) ? numeric : null;
      };
      const buyPrice = parseNum(row?.price_d_minus_1);
      const sellPrice = parseNum(row?.price_d_plus_1);
      const dividend = parseNum(row?.dividend_amount);
      const exPrice = parseNum(row?.ex_dividend_price);
      if (
        buyPrice === null ||
        sellPrice === null ||
        dividend === null ||
        exPrice === null ||
        exPrice <= 0
      ) {
        return;
      }
      const profit = dividend + (sellPrice - buyPrice);
      const yieldPct = (dividend / exPrice) * 100;

      events.push({ ticker, exDate, profit, yieldPct });
      profitsByTicker.set(ticker, (profitsByTicker.get(ticker) || 0) + profit);
      countsByTicker.set(ticker, (countsByTicker.get(ticker) || 0) + 1);
      yieldsByTicker.set(ticker, (yieldsByTicker.get(ticker) || 0) + yieldPct);

      const year = new Date(exDate).getFullYear();
      profitsByYear.set(year, (profitsByYear.get(year) || 0) + profit);
    });

    if (!events.length) {
      return null;
    }

    countsByTicker.forEach((count, ticker) => {
      const aggregateProfit = profitsByTicker.get(ticker) || 0;
      const list = profitsByCount.get(count) || [];
      list.push(aggregateProfit / count);
      profitsByCount.set(count, list);
    });

    const payoutStats = Array.from(profitsByCount.entries())
      .map(([count, profits]) => ({
        count,
        avgProfit: profits.reduce((sum, value) => sum + value, 0) / profits.length,
        samples: profits.length,
      }))
      .sort((a, b) => b.avgProfit - a.avgProfit);

    const topPayout = payoutStats[0];

    const sortedEvents = events.slice().sort((a, b) => a.yieldPct - b.yieldPct);
    let cumulativeProfit = 0;
    let yieldThreshold = sortedEvents[0]?.yieldPct ?? 0;
    sortedEvents.forEach((event, index) => {
      cumulativeProfit += event.profit;
      const average = cumulativeProfit / (index + 1);
      if (average > 0 && yieldThreshold === sortedEvents[0]?.yieldPct) {
        yieldThreshold = event.yieldPct;
      }
    });

    const tickerAverages = Array.from(profitsByTicker.entries()).map(([ticker, total]) => ({
      ticker,
      avgProfit: total / (countsByTicker.get(ticker) || 1),
      events: countsByTicker.get(ticker) || 0,
      avgYield:
        (yieldsByTicker.get(ticker) || 0) / Math.max(1, countsByTicker.get(ticker) || 1),
    }));

    const topTickers = tickerAverages
      .filter((entry) => entry.events >= 3)
      .sort((a, b) => b.avgProfit - a.avgProfit)
      .slice(0, 5);

    const bestYear = Array.from(profitsByYear.entries())
      .filter(([year]) => Number.isFinite(year))
      .map(([year, profit]) => ({ year, profit }))
      .sort((a, b) => b.profit - a.profit)[0];

    return {
      totalEvents: events.length,
      topTickers,
      bestYear,
      yieldThreshold: yieldThreshold ?? 0,
      idealPayoutCount: topPayout,
    };
  }, []);

  const handleFetchRecommendations = useCallback(async () => {
    setAiLoading(true);
    setAiError('');
    setAiRecommendation('');

    const apiKey = (import.meta.env.VITE_OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      setAiLoading(false);
      setAiError('OpenAI API key not configured.');
      return;
    }

    try {
      const datasetResponse = await fetch('/yahoo_stock_data.json', { cache: 'no-store' });
      if (!datasetResponse.ok) {
        throw new Error('Unable to load historical dividend data.');
      }
      const dataset = await datasetResponse.json();
      const summary = generateAiSummary(dataset);
      if (!summary) {
        throw new Error('Dataset does not contain enough information for recommendations.');
      }

      const prompt = `You are an SGX dividend capture strategist. Analyze the provided summary of historical dividend events from yahoo_stock_data.json and recommend:\n1) Which 5 stocks have the best history of profitable dividend capture trades.\n2) Which calendar year was most profitable overall.\n3) The ideal dividend yield threshold and number of payouts for consistent profitability.\n\nSummary:\nTotal events analyzed: ${summary.totalEvents}.\nIdeal payout cadence: ${
        summary.idealPayoutCount?.count || 'N/A'
      } events/year (avg profit ${summary.idealPayoutCount?.avgProfit?.toFixed(4) || 'N/A'} SGD).\nYield threshold for profitability: ${summary.yieldThreshold?.toFixed(
        3
      )}%.\nTop tickers with strongest history:\n${summary.topTickers
        .map(
          (entry, index) =>
            `${index + 1}. ${entry.ticker} — avg profit ${entry.avgProfit.toFixed(
              4
            )} SGD over ${entry.events} captures (avg yield ${entry.avgYield.toFixed(2)}%).`
        )
        .join('\n')}\nMost profitable calendar year: ${
        summary.bestYear ? `${summary.bestYear.year} (total profit ${summary.bestYear.profit.toFixed(4)} SGD)` : 'N/A'
      }.\n\nProvide concise recommendations with rationale.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content:
                'You are an SGX dividend capture analyst. Provide actionable, concise recommendations based on provided data. Always mention the key tickers, yield threshold, and payout cadence.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI request failed (${response.status})`);
      }
      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('OpenAI did not return a recommendation.');
      }
      setAiRecommendation(text);
    } catch (error) {
      setAiError(error?.message || 'Unable to generate AI recommendation.');
    } finally {
      setAiLoading(false);
    }
  }, [generateAiSummary]);

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
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Scope</span>
                  <div className="mt-1 text-lg font-semibold">{horizonLabel}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{lookaheadHelper}</span>
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

          <section className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-xl shadow-md p-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    AI Recommendation
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Quick insight based on your historical dividend capture data.
                  </p>
                </div>
                <Button
                  onClick={handleFetchRecommendations}
                  loading={aiLoading}
                  disabled={aiLoading}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Recommend me
                </Button>
              </div>
              {aiError && (
                <div className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">
                  {aiError}
                </div>
              )}
              {aiLoading && !aiError && (
                <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Icon name="Loader2" className="animate-spin" size={14} />
                  Generating recommendation…
                </div>
              )}
              {aiRecommendation && !aiLoading && (
                <div className="text-sm text-slate-700 dark:text-slate-200 bg-white/70 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-3 whitespace-pre-line leading-relaxed">
                  {aiRecommendation}
                </div>
              )}
              {!aiRecommendation && !aiError && !aiLoading && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Click “Recommend me” to get ticker ideas and yield guidance based on recent capture performance.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white font-['Poppins',sans-serif]">
                  Upcoming Ex-Dividend Events
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Sorted by ex-date; cards highlight events within the next 30 days so you can plan captures quickly.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex h-3 w-3 rounded-full bg-slate-900/70 dark:bg-white/80" />
                <span>Ex-date within the next 30 days</span>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`skeleton-${index}`}
                    className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-lg border border-white/70 dark:border-slate-700/70 rounded-xl shadow-lg p-4 animate-pulse space-y-3"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedUpcomingDividends.map((item) => {
                  const highlight = isWithinThirtyDays(item.exDate);
                  const previousYearCount = item.prevYearEventCount ?? 0;
                  return (
                    <div
                      key={`${item.ticker}-${item.exDate}`}
                      className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/90 dark:border-slate-700/90 rounded-xl shadow-md p-4 transition-all duration-200 hover:shadow-lg flex flex-col gap-3 ${
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
                      <div className="rounded-xl border border-dashed border-slate-200/80 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-2 flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Latest Year Ex-Dates
                        </span>
                        <span className="text-base font-semibold text-slate-900 dark:text-white">
                          {previousYearCount}
                        </span>
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

        </div>
      </main>
      <ApplicationFooter />
    </div>
  );
};

export default Dashboard;
