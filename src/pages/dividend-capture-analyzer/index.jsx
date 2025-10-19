import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ApplicationHeader from '../../components/ui/ApplicationHeader';
import StatusBanner from '../../components/ui/StatusBanner';
import ControlPanel from './components/ControlPanel';
import SummaryStrip from './components/SummaryStrip';
import DataGrid from './components/DataGrid';
import DisclaimerFooter from './components/DisclaimerFooter';
import { calculateSGXMarginCosts } from '../../utils/sgxMarginCalculator';
import { fetchSGXDividendData, fetchTickerCatalogue } from '../../utils/dividendDataApi';
import ApplicationFooter from '../../components/ui/ApplicationFooter';

const BROKER_FEE_RATE = 0.00127;
const MINIMUM_FEE = 4.10;

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
  const [searchParams] = useSearchParams();

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

  const handleReset = useCallback(() => {
    setGridData([]);
    setSelectedCells({});
    setStatusMessage('');
    setCurrentParams(null);
    setIsGridFullScreen(false);
  }, []);


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
          const priceDifferenceValue = (buyPrice - sellPrice) * quantity;
          const totalCost =
            dividendReceived +
            priceDifferenceValue -
            tradeFeeTotal -
            marginFee;

          return {
            totalTradeFee: totals.totalTradeFee + tradeFeeTotal,
            totalMarginFee: totals.totalMarginFee + marginFee,
            totalResult: totals.totalResult + totalCost,
          };
        }
      }
    }
    return totals;
  }, { totalTradeFee: 0, totalMarginFee: 0, totalResult: 0 });

  const rowsLoaded = gridData?.length ?? 0;

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
          />

          {/* Summary Strip */}
          {rowsLoaded > 0 && (
            <SummaryStrip
              rowsLoaded={rowsLoaded}
              selectedCount={selectedCount}
              totalTradeFee={aggregates.totalTradeFee}
              totalMarginFee={aggregates.totalMarginFee}
              totalResult={aggregates.totalResult}
            />
          )}

          {/* Data Grid */}
          <DataGrid
            data={gridData}
            marginAmount={currentParams?.marginAmount ? parseFloat(currentParams?.marginAmount) : 50000}
            onCellSelect={handleCellSelect}
            selectedCells={selectedCells}
            className={isGridFullScreen ? '' : 'mt-6'}
            fullScreen={isGridFullScreen}
            onToggleFullScreen={() => setIsGridFullScreen((prev) => !prev)}
          />

          {/* Disclaimer Footer */}
          <DisclaimerFooter />
        </div>
      </main>
      <ApplicationFooter />
    </div>
  );
};

export default DividendCaptureAnalyzer;
