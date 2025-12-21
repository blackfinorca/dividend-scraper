import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ApplicationHeader from '../../components/ui/ApplicationHeader';
import StatusBanner from '../../components/ui/StatusBanner';
import ControlPanel from './components/ControlPanel';
import SummaryStrip from './components/SummaryStrip';
import DataGrid from './components/DataGrid';
import InsightsPanel from './components/InsightsPanel';
import { computeAutoTradeHighlights } from '../../utils/tradeInsights';
import DisclaimerFooter from './components/DisclaimerFooter';
import { calculateSGXMarginCosts } from '../../utils/sgxMarginCalculator';
import { fetchDividendEventFrequency, fetchSGXDividendData, fetchTickerCatalogue } from '../../utils/dividendDataApi';
import ApplicationFooter from '../../components/ui/ApplicationFooter';
import DividendEventsTable from './components/DividendEventsTable';

const BROKER_FEE_RATE = 0.00127;
const MINIMUM_FEE = 4.10;
const DEFAULT_START_DATE = '2020-01-01';
const getTodayIso = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const EVENT_FILTER_OPTIONS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4+', label: '4+', description: '4 or more events per year' },
];

const DividendCaptureAnalyzer = () => {
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [gridData, setGridData] = useState([]);
  const [selectedCells, setSelectedCells] = useState({});
  const [currentParams, setCurrentParams] = useState(null);
  const [tickerOptions, setTickerOptions] = useState([]);
  const [tickerOptionsLoading, setTickerOptionsLoading] = useState(false);
  const [tickerOptionsError, setTickerOptionsError] = useState('');
  const [isGridFullScreen, setIsGridFullScreen] = useState(false);
  const [initialTicker, setInitialTicker] = useState('');
  const [highlightFetchButton, setHighlightFetchButton] = useState(false);
  const [insightsRefreshKey, setInsightsRefreshKey] = useState(0);
  const [searchParams] = useSearchParams();
  const [eventFilter, setEventFilter] = useState('');
  const [eventFilterRows, setEventFilterRows] = useState([]);
  const [eventFilterYear, setEventFilterYear] = useState(null);
  const [eventFilterLoading, setEventFilterLoading] = useState(false);
  const [eventFilterError, setEventFilterError] = useState('');
  const pendingFetchParamsRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const loadCatalogue = async () => {
      setTickerOptionsLoading(true);
      setTickerOptionsError('');
      try {
        const options = await fetchTickerCatalogue();
        if (isMounted) {
          setTickerOptions(options);
        }
      } catch (error) {
        console.warn('Unable to load ticker catalogue for analyzer', error);
        if (isMounted) {
          setTickerOptions([]);
          setTickerOptionsError('Unable to load ticker catalogue. Please try again later.');
        }
      } finally {
        if (isMounted) {
          setTickerOptionsLoading(false);
        }
      }
    };

    loadCatalogue();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadEventFilters = async () => {
      setEventFilterLoading(true);
      setEventFilterError('');
      try {
        const payload = await fetchDividendEventFrequency();
        if (isMounted) {
          setEventFilterRows(payload?.rows || []);
          setEventFilterYear(payload?.year ?? null);
        }
      } catch (error) {
        console.warn('Unable to load dividend event filters', error);
        if (isMounted) {
          setEventFilterRows([]);
          setEventFilterYear(null);
          setEventFilterError('Unable to load dividend event filters. Please try again later.');
        }
      } finally {
        if (isMounted) {
          setEventFilterLoading(false);
        }
      }
    };

    loadEventFilters();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const ticker = (searchParams.get('ticker') || '').trim().toUpperCase();
    if (ticker) {
      setInitialTicker(ticker);
      setHighlightFetchButton(true);
    } else {
      setInitialTicker('');
      setHighlightFetchButton(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!highlightFetchButton) {
      return;
    }
    const timeout = setTimeout(() => setHighlightFetchButton(false), 2500);
    return () => clearTimeout(timeout);
  }, [highlightFetchButton]);

  const handleFetchData = useCallback(async (params) => {
    setLoading(true);
    setStatusMessage('');

    const rawTicker = params?.ticker?.trim().toUpperCase() || '';
    if (!rawTicker) {
      setLoading(false);
      setStatusMessage('Please select a ticker symbol before fetching data.');
      setStatusType('error');
      return;
    }

    const normalizedTicker = rawTicker.includes('.') ? rawTicker : `${rawTicker}.SI`;
    const nextParams = {
      ...params,
      ticker: normalizedTicker,
    };

    setCurrentParams(nextParams);
    
    try {
      const records = await fetchSGXDividendData({
        ticker: normalizedTicker,
        startDate: params?.startDate,
        endDate: params?.endDate,
      });

      if (!records?.length) {
        setStatusMessage('No dividend data found for the selected date range');
        setStatusType('warning');
      } else {
        setStatusMessage(`Loaded ${records.length} ex-dividend dates for ${normalizedTicker}`);
        setStatusType('success');
      }
      
      setGridData(records ?? []);
      setSelectedCells({});
      
    } catch (error) {
      setStatusMessage(error?.message || 'Failed to fetch data. Please check your parameters and try again.');
      setStatusType('error');
      setGridData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialTicker) {
      return;
    }
    const pendingParams = pendingFetchParamsRef.current;
    pendingFetchParamsRef.current = null;
    handleFetchData({
      ticker: initialTicker,
      marginAmount: pendingParams?.marginAmount ?? '50000',
      startDate: pendingParams?.startDate ?? DEFAULT_START_DATE,
      endDate: pendingParams?.endDate ?? getTodayIso(),
    });
  }, [initialTicker, handleFetchData]);

  const handleReset = useCallback(() => {
    setGridData([]);
    setSelectedCells({});
    setStatusMessage('');
    setCurrentParams(null);
    setIsGridFullScreen(false);
  }, []);

  const handleEventTickerSelect = useCallback(
    (ticker) => {
      const trimmed = (ticker || '').trim().toUpperCase();
      if (!trimmed) {
        return;
      }
      const baseParams = currentParams || {
        marginAmount: '50000',
        startDate: DEFAULT_START_DATE,
        endDate: getTodayIso(),
      };
      const nextParams = {
        marginAmount: baseParams.marginAmount ?? '50000',
        startDate: baseParams.startDate ?? DEFAULT_START_DATE,
        endDate: baseParams.endDate ?? getTodayIso(),
      };

      setEventFilter('');

      if (trimmed === initialTicker) {
        handleFetchData({ ...nextParams, ticker: trimmed });
        return;
      }

      pendingFetchParamsRef.current = nextParams;
      setInitialTicker(trimmed);
    },
    [currentParams, handleFetchData, initialTicker]
  );


  const handleCellSelect = useCallback((rowId, columnKey, action, offset) => {
    if (action === 'clear') {
      setSelectedCells({});
      setStatusMessage('All selections cleared');
      setStatusType('info');
      return;
    }

    const newSelectedCells = { ...selectedCells };
    
    if (!newSelectedCells?.[rowId]) {
      newSelectedCells[rowId] = {};
    }
    
    newSelectedCells[rowId][action] = {
      columnKey,
      offset
    };
    
    setSelectedCells(newSelectedCells);
  }, [selectedCells]);

  const handleThemeToggle = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }, []);

  const handleStatusDismiss = useCallback(() => {
    setStatusMessage('');
  }, []);

  // Calculate summary statistics
  const selectedCount = Object.keys(selectedCells)?.reduce((count, rowId) => {
    const row = selectedCells?.[rowId];
    return count + (row?.buy ? 1 : 0) + (row?.sell ? 1 : 0);
  }, 0);

  // Calculate aggregated fees and totals
  const aggregates = Object.keys(selectedCells)?.reduce((totals, rowId) => {
    const row = selectedCells?.[rowId];
    if (row?.buy && row?.sell && currentParams) {
      const dataRow = gridData?.find(d => d?.id === rowId);
      if (dataRow) {
        const buyPrice = parseFloat(dataRow?.prices?.[row?.buy?.columnKey]);
        const sellPrice = parseFloat(dataRow?.prices?.[row?.sell?.columnKey]);
        const dividendAmount = dataRow?.dividendPerShare || 0;
        
        if (buyPrice && sellPrice) {
          const quantity = Math.floor(parseFloat(currentParams?.marginAmount) / buyPrice);
          const holdingDays = Math.abs(row?.sell?.offset - row?.buy?.offset);
          const tradeValue = parseFloat(currentParams?.marginAmount);
          
          if (!Number.isFinite(quantity) || quantity <= 0) {
            return totals;
          }

          // Calculate total costs using SGX margin formulas
          const costCalculation = calculateSGXMarginCosts({
            tradeValue: tradeValue,
            marginRatio: 0.5, // 50% margin
            holdingDays: holdingDays,
            feeRate: BROKER_FEE_RATE,
            minimumFee: MINIMUM_FEE
          });
          
          const perLegFee = Math.max(MINIMUM_FEE, tradeValue * BROKER_FEE_RATE);
          const tradeFeeTotal = perLegFee * 2;
          const marginFee = costCalculation?.financingCost ?? 0;
          const dividendReceived = dividendAmount * quantity;
          const priceDifferenceValue = (sellPrice - buyPrice) * quantity;
          let totalCost = dividendReceived - tradeFeeTotal - marginFee;
          if (priceDifferenceValue >= 0) {
            totalCost += priceDifferenceValue;
          } else {
            totalCost -= Math.abs(priceDifferenceValue);
          }

          return {
            totalTradeFee: totals.totalTradeFee + tradeFeeTotal,
            totalMarginFee: totals.totalMarginFee + marginFee,
            totalDividendReceived: totals.totalDividendReceived + dividendReceived,
            totalResult: totals.totalResult + totalCost,
          };
        }
      }
    }
    return totals;
  }, { totalTradeFee: 0, totalMarginFee: 0, totalDividendReceived: 0, totalResult: 0 });

  const parsedMarginAmount = useMemo(() => {
    const numeric = currentParams?.marginAmount ? parseFloat(currentParams.marginAmount) : null;
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 50000;
  }, [currentParams?.marginAmount]);

  const { highlightMap, topTrades, averageBuyOffset, averageSellOffset } = useMemo(() => {
    if (!Array.isArray(gridData) || gridData.length === 0) {
      return { highlightMap: {}, topTrades: [], averageBuyOffset: null, averageSellOffset: null };
    }
    return computeAutoTradeHighlights(gridData, parsedMarginAmount, {
      maxRowsPerTicker: 3,
    });
  }, [gridData, parsedMarginAmount]);

  const rowsLoaded = gridData?.length ?? 0;
  const eventFilterLabel = EVENT_FILTER_OPTIONS.find((option) => option.value === eventFilter)?.label || '';
  const filteredEventRows = useMemo(() => {
    if (!eventFilter) {
      return [];
    }
    const targetCount = eventFilter === '4+' ? 4 : parseInt(eventFilter, 10);
    if (!Number.isFinite(targetCount)) {
      return [];
    }
    const filtered = eventFilterRows.filter((row) =>
      eventFilter === '4+' ? row.eventCount >= targetCount : row.eventCount === targetCount
    );
    return filtered.slice().sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [eventFilter, eventFilterRows]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white flex flex-col">
      <ApplicationHeader
        theme={theme}
        onThemeToggle={handleThemeToggle}
        className="bg-white/70 dark:bg-slate-900/80 backdrop-blur-md border-b border-white/60 dark:border-slate-700/70 shadow-sm"
      />
      <main className="flex-1 pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Page Header */}
          <header className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-lg p-6">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-blue-600 via-emerald-500 to-blue-400 text-transparent bg-clip-text font-['Poppins',sans-serif]">
                  Dividend Capture Analyzer
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                  Explore historical ex-dividend windows, compare capture strategies, and size entries using SGX-specific margin math.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-4">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Events Loaded</span>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white font-mono">{rowsLoaded}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Latest query</span>
                </div>
                <div className="rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-4">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Selections</span>
                  <div className="mt-1 text-2xl font-semibold text-emerald-500 font-mono">{selectedCount}</div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Buy/Sell markers</span>
                </div>
                <div className="rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/40 backdrop-blur p-4">
                  <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Margin Amount</span>
                  <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white font-mono">
                    {currentParams?.marginAmount ? `S$ ${parseFloat(currentParams.marginAmount).toLocaleString('en-SG')}` : '—'}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Adjust in controls</span>
                </div>
              </div>
            </div>
          </header>

          {/* Status Banner */}
          {statusMessage && (
            <StatusBanner
              message={statusMessage}
              type={statusType}
              onDismiss={handleStatusDismiss}
              autoHide={statusType === 'success'}
              className="bg-white/80 dark:bg-slate-800/80 border border-white/80 dark:border-slate-700/80 rounded-2xl"
            />
          )}

          {/* Control Panel */}
          <ControlPanel
            onFetchData={handleFetchData}
            onReset={handleReset}
            loading={loading}
            tickerOptions={tickerOptions}
            tickerOptionsLoading={tickerOptionsLoading}
            tickerOptionsError={tickerOptionsError}
            initialTicker={initialTicker}
            highlightFetchButton={highlightFetchButton}
            eventFilter={eventFilter}
            onEventFilterChange={setEventFilter}
            eventFilterOptions={EVENT_FILTER_OPTIONS}
          />

          {eventFilter && (
            <DividendEventsTable
              rows={filteredEventRows}
              year={eventFilterYear}
              filterLabel={eventFilterLabel}
              loading={eventFilterLoading}
              error={eventFilterError}
              onSelectTicker={handleEventTickerSelect}
            />
          )}

          <InsightsPanel
            topTrades={topTrades}
            loading={loading}
            refreshKey={insightsRefreshKey}
            averageBuyOffset={averageBuyOffset}
            averageSellOffset={averageSellOffset}
            onRefresh={() => setInsightsRefreshKey((prev) => prev + 1)}
          />

          {/* Summary Strip */}
          {rowsLoaded > 0 && (
          <SummaryStrip
            rowsLoaded={rowsLoaded}
            selectedCount={selectedCount}
            totalTradeFee={aggregates.totalTradeFee}
            totalMarginFee={aggregates.totalMarginFee}
            totalDividendReceived={aggregates.totalDividendReceived}
            totalResult={aggregates.totalResult}
          />
          )}

          {/* Data Grid */}
          <section className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Table View</h2>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Scroll to explore prices and auto-selected trades
              </div>
            </div>
            <DataGrid
              data={gridData}
              marginAmount={parsedMarginAmount}
              autoTradeMap={highlightMap}
              onCellSelect={handleCellSelect}
              selectedCells={selectedCells}
              className={isGridFullScreen ? 'h-full' : 'min-h-[32rem]'}
              fullScreen={isGridFullScreen}
              onToggleFullScreen={() => setIsGridFullScreen((prev) => !prev)}
            />
          </section>

          {/* Disclaimer Footer */}
          <DisclaimerFooter />
        </div>
      </main>
      <ApplicationFooter />
    </div>
  );
};

export default DividendCaptureAnalyzer;
