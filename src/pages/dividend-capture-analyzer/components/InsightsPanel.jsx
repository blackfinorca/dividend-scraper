import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/ui/Button';
import Icon from '../../../components/AppIcon';
import { cn } from '../../../utils/cn';

const MAX_TRADES = 3;
const formatOffset = (offset) => (offset > 0 ? `D+${offset}` : `D${offset}`);
const formatCurrency = (value) => {
  if (value === null || value === undefined) {
    return '—';
  }
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
const formatPercentage = (value) => {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const InsightsPanel = ({
  topTrades = [],
  loading = false,
  refreshKey = 0,
  onRefresh,
  averageBuyOffset = null,
  averageSellOffset = null,
}) => {
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [insightLoading, setInsightLoading] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  const activeControllerRef = useRef(null);
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY || '').trim();
  const apiKeyAvailable = Boolean(apiKey);

  const payload = useMemo(
    () =>
      topTrades.slice(0, MAX_TRADES).map((trade) => ({
        rowId: trade.rowId,
        ticker: trade.ticker,
        exDate: trade.exDate,
        buyOffset: trade.buyOffset,
        sellOffset: trade.sellOffset,
        netProfit: Number.isFinite(trade.totalCost) ? Number(trade.totalCost.toFixed(2)) : null,
        netPercentage: Number.isFinite(trade.netPercentage) ? Number(trade.netPercentage.toFixed(2)) : null,
        quantity: trade.quantity ?? null,
        dividendPerShare: trade.dividendPerShare ?? null,
      })),
    [topTrades]
  );
  const fingerprint = useMemo(() => JSON.stringify(payload), [payload]);

  useEffect(() => {
    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
        activeControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
      activeControllerRef.current = null;
    }
    setSummary('');
    setError('');
    setInsightLoading(false);
    setHasRequested(false);
  }, [fingerprint, refreshKey]);

  const generateInsights = useCallback(() => {
    if (loading || insightLoading) {
      return;
    }
    if (!payload.length) {
      setError('Auto-highlighted trades are required before insights can be generated.');
      setSummary('');
      setHasRequested(false);
      return;
    }
    if (!apiKeyAvailable) {
      setError('OpenAI API key is not configured. Set VITE_OPENAI_API_KEY to enable insights.');
      setSummary('');
      setHasRequested(false);
      return;
    }

    const controller = new AbortController();
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }
    activeControllerRef.current = controller;

    setInsightLoading(true);
    setError('');
    setHasRequested(true);

    const userPrompt = `Summarize the following dividend capture trades in 2-3 concise executive sentences. Mention relative attractiveness, timing, and risk notes when helpful.\nTrades:\n${JSON.stringify(payload)}`;

    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content:
              'You are an investment analyst drafting concise executive briefings on dividend capture opportunities. Keep the tone pragmatic and data-driven.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`OpenAI API error (${response.status})`);
        }
        return response.json();
      })
      .then((data) => {
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
          throw new Error('OpenAI did not return a summary.');
        }
        setSummary(text);
        setError('');
      })
      .catch((err) => {
        if (controller.signal.aborted) {
          return;
        }
        setSummary('');
        setError(err.message || 'Failed to generate insights. Please try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setInsightLoading(false);
          if (activeControllerRef.current === controller) {
            activeControllerRef.current = null;
          }
        }
      });
  }, [apiKey, apiKeyAvailable, insightLoading, loading, payload]);

  const handleRefresh = () => {
    if (typeof onRefresh === 'function') {
      onRefresh();
    }
  };

  const hasPayload = payload.length > 0;

  const placeholderMessage = useMemo(() => {
    if (!hasPayload) {
      return 'Auto-highlighted trades will appear here once qualifying setups are detected.';
    }
    if (!apiKeyAvailable) {
      return 'OpenAI API key is not configured. Set VITE_OPENAI_API_KEY to enable insights.';
    }
    if (!hasRequested) {
      return 'Click "Show insights" to generate a summary for the highlighted trades.';
    }
    if (insightLoading) {
      return 'Generating insights…';
    }
    return '';
  }, [hasPayload, hasRequested, insightLoading, apiKeyAvailable]);

  return (
    <div
      className={cn(
        'mt-6 bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-xl'
      )}
    >
      <div className="px-6 py-4 border-b border-white/70 dark:border-slate-700/70 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Insights</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Executive summary of the top auto-highlighted dividend capture trades.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {insightLoading && (
            <span className="text-xs text-slate-500 dark:text-slate-300 inline-flex items-center gap-1">
              <Icon name="Loader2" size={14} className="animate-spin" />
              Generating…
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={generateInsights}
            disabled={!hasPayload || insightLoading || loading || !apiKeyAvailable}
          >
            Show insights
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={!hasPayload || insightLoading || loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3 text-sm text-slate-700 dark:text-slate-200">
        {error ? (
          <div className="text-rose-500 bg-rose-100/60 dark:bg-rose-500/10 border border-rose-400/40 rounded-lg px-4 py-3 text-xs">
            {error}
          </div>
        ) : null}

        {!error && placeholderMessage && (
          <div className="rounded-lg border border-dashed border-slate-300/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-3 text-xs text-slate-500 dark:text-slate-300">
            {placeholderMessage}
          </div>
        )}

        {!error && !placeholderMessage && summary && (
          <div className="rounded-xl bg-gradient-to-r from-blue-50/90 via-slate-50/90 to-emerald-50/80 dark:from-slate-800/80 dark:via-slate-900/70 dark:to-emerald-900/30 border border-blue-200/60 dark:border-slate-700/70 px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-300">
                <Icon name="Sparkles" size={16} color="currentColor" strokeWidth={2} />
              </span>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-blue-600 dark:text-blue-200">
                  AI Summary
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-200">
                  {summary}
                </p>
              </div>
            </div>
          </div>
        )}

        {!error && !placeholderMessage && !summary && hasRequested && !insightLoading && (
          <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-300">
            Insights will appear here once generated.
          </p>
        )}

        {hasPayload && (
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-300 space-y-3">
            {(Number.isFinite(averageBuyOffset) || Number.isFinite(averageSellOffset)) && (
              <div className="rounded-xl border border-emerald-300/60 dark:border-emerald-500/50 bg-emerald-50/80 dark:bg-emerald-900/30 px-4 py-3 text-sm shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 dark:bg-emerald-800/60 text-emerald-600 dark:text-emerald-200 shadow-sm">
                    <Icon name="Timer" size={16} color="currentColor" strokeWidth={2} />
                  </span>
                  <div>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-200 uppercase tracking-wide text-[11px] mb-1">
                      Average Timing
                    </p>
                    <p className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed">
                      Buy windows cluster around{' '}
                      <span className="font-semibold text-emerald-700 dark:text-emerald-200">
                        {Number.isFinite(averageBuyOffset) ? formatOffset(Math.round(averageBuyOffset)) : '—'}
                      </span>
                      , while exits land near{' '}
                      <span className="font-semibold text-emerald-700 dark:text-emerald-200">
                        {Number.isFinite(averageSellOffset) ? formatOffset(Math.round(averageSellOffset)) : '—'}
                      </span>
                      {' '}across the selected trades.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Highlighted Trades
            </div>
            <ul className="space-y-1.5">
              {payload.map((trade) => (
                <li key={trade.rowId} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-slate-600 dark:text-slate-200">
                    {trade.ticker} · {trade.exDate || '—'} · {formatOffset(trade.buyOffset)} → {formatOffset(trade.sellOffset)}
                  </span>
                  <span className="text-slate-500 dark:text-slate-300">
                    {formatCurrency(trade.netProfit)} ({formatPercentage(trade.netPercentage)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default InsightsPanel;
