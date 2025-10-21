import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { calculateSGXMarginCosts } from '../../../utils/sgxMarginCalculator';
import { cn } from '../../../utils/cn';


const PRICE_OFFSETS = Array.from({ length: 41 }, (_, idx) => idx - 10);
const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 42;
const SPARKLINE_MIN_OFFSET = PRICE_OFFSETS[0];
const SPARKLINE_RANGE = PRICE_OFFSETS[PRICE_OFFSETS.length - 1] - SPARKLINE_MIN_OFFSET || 1;
const BROKER_FEE_RATE = 0.00127;
const MINIMUM_FEE = 4.10;
const AUTO_TRADE_COLORS = { buy: '16,185,129', sell: '239,68,68' };

const buildSparkline = (prices) => {
  if (!prices) {
    return { path: '', points: [], exPoint: null };
  }

  const points = PRICE_OFFSETS.map((offset) => {
    const key = `D${offset >= 0 ? '+' : ''}${offset}`;
    const raw = prices?.[key];
    if (raw === undefined || raw === null || raw === '') {
      return null;
    }
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) {
      return null;
    }
    const x = ((offset - SPARKLINE_MIN_OFFSET) / SPARKLINE_RANGE) * SPARKLINE_WIDTH;
    return { offset, value, x };
  }).filter(Boolean);

  if (!points.length) {
    return { path: '', points: [], exPoint: null };
  }

  const minValue = Math.min(...points.map((pt) => pt.value));
  const maxValue = Math.max(...points.map((pt) => pt.value));
  const range = maxValue - minValue || 1;

  points.forEach((pt) => {
    pt.y = SPARKLINE_HEIGHT - ((pt.value - minValue) / range) * SPARKLINE_HEIGHT;
  });

  let path = '';
  if (points.length >= 2) {
    path = points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' ');
  }

  const exPoint = points.find((pt) => pt.offset === 0) || null;

  return { path, points, exPoint };
};

const DataGrid = ({
  data = [],
  marginAmount = 50000,
  autoTradeMap = null,
  onCellSelect,
  selectedCells = {},
  className = "",
  fullScreen = false,
  onToggleFullScreen,
}) => {
  const [hoveredCell, setHoveredCell] = useState(null);

  useEffect(() => {
    if (!fullScreen) {
      return undefined;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [fullScreen]);

  // Generate date columns from D-10 to D+30
  const dateColumns = useMemo(() => {
    const columns = [];
    for (let i = -10; i <= 30; i++) {
      columns?.push({
        key: `D${i >= 0 ? '+' : ''}${i}`,
        label: `D${i >= 0 ? '+' : ''}${i}`,
        offset: i,
        isExDate: i === 0
      });
    }
    return columns;
  }, []);

  // Calculate P&L for a row using SGX margin formulas
  const calculatePnL = (row, buyOffset, sellOffset) => {
    if (!buyOffset || !sellOffset || buyOffset >= 0 || sellOffset <= 0) {
      return null;
    }

    const rawBuyPrice = row?.prices?.[`D${buyOffset}`];
    const rawSellPrice = row?.prices?.[`D${sellOffset >= 0 ? '+' : ''}${sellOffset}`];
    const dividendAmount = row?.dividendPerShare || 0;

    const buyPrice = parseFloat(rawBuyPrice);
    const sellPrice = parseFloat(rawSellPrice);

    if (!Number.isFinite(buyPrice) || !Number.isFinite(sellPrice) || buyPrice <= 0) {
      return null;
    }

    const quantity = Math.floor(marginAmount / buyPrice);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }

    const holdingDays = Math.abs(sellOffset - buyOffset);
    const perLegFee = Math.max(MINIMUM_FEE, marginAmount * BROKER_FEE_RATE);
    const totalTradeFee = perLegFee * 2;
    const dividendReceived = dividendAmount * quantity;
    const priceDifferencePerShare = sellPrice - buyPrice;
    const priceDifferenceValue = priceDifferencePerShare * quantity;

    try {
      const marginCosts = calculateSGXMarginCosts({
        tradeValue: marginAmount,
        marginRatio: 0.5,
        holdingDays,
        marginInterestRate: 0.06,
        feeRate: BROKER_FEE_RATE,
        minimumFee: MINIMUM_FEE
      });

      const marginFee = marginCosts?.financingCost ?? 0;
      let totalCost = dividendReceived - totalTradeFee - marginFee;
      if (priceDifferenceValue >= 0) {
        totalCost += priceDifferenceValue;
      } else {
        totalCost -= Math.abs(priceDifferenceValue);
      }
      const netPercentage = (totalCost / marginAmount) * 100;

      return {
        quantity,
        dividendReceived,
        priceDifferenceValue,
        tradeFee: totalTradeFee,
        marginFee,
        totalCost,
        netPercentage,
        buyPrice,
        sellPrice,
        holdingDays,
        perLegFee,
      };
    } catch (error) {
      console.error('SGX margin calculation error:', error);

      const marginFee = (marginAmount * 0.06 * holdingDays) / 365;
      let totalCost = dividendReceived - totalTradeFee - marginFee;
      if (priceDifferenceValue >= 0) {
        totalCost += priceDifferenceValue;
      } else {
        totalCost -= Math.abs(priceDifferenceValue);
      }
      const netPercentage = (totalCost / marginAmount) * 100;

      return {
        quantity,
        dividendReceived,
        priceDifferenceValue,
        tradeFee: totalTradeFee,
        marginFee,
        totalCost,
        netPercentage,
        buyPrice,
        sellPrice,
        holdingDays,
        perLegFee,
      };
    }
  };

  const handleCellClick = (rowId, columnKey, offset) => {
    if (offset >= 0 && offset !== 0) {
      // Sell date selection (D+1 and above)
      onCellSelect && onCellSelect(rowId, columnKey, 'sell', offset);
    } else if (offset < 0) {
      // Buy date selection (D-1 and below)
      onCellSelect && onCellSelect(rowId, columnKey, 'buy', offset);
    }
  };

  const formatPrice = (price) => {
    if (!price || price === '—') return '—';
    return `$${parseFloat(price)?.toFixed(2)}`;
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '—';
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })?.format(amount);
  };

  const formatPercentage = (value) => {
    if (!value && value !== 0) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value?.toFixed(2)}%`;
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e?.key === 'Escape') {
        onCellSelect && onCellSelect(null, null, 'clear');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCellSelect]);

  if (!data || data?.length === 0) {
    return (
      <div className={`bg-card border border-border rounded-lg ${className}`}>
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <Icon 
            name="BarChart3" 
            size={48} 
            color="var(--color-muted-foreground)"
            strokeWidth={1}
            className="mb-4"
          />
          <h3 className="text-lg font-medium text-foreground mb-2">No Data Available</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Enter a stock symbol and click "Fetch & Calculate" to analyze dividend capture opportunities.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg border border-white/80 dark:border-slate-700/80 rounded-2xl shadow-xl overflow-hidden w-full relative flex flex-col',
        fullScreen
          ? 'fixed inset-0 z-50 m-0 rounded-none border-none shadow-2xl bg-slate-900 text-white h-full'
          : '',
        className
      )}
    >
      {onToggleFullScreen && (
        <div className="absolute top-2 right-2 z-10 flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFullScreen}
            className="h-8 w-8"
            aria-label={fullScreen ? 'Exit full screen' : 'Enter full screen'}
          >
            <Icon
              name={fullScreen ? 'Minimize2' : 'Maximize2'}
              size={16}
              color="currentColor"
            />
          </Button>
        </div>
      )}
      {/* Grid Container */}
      <div className="flex-1 overflow-x-auto">
        <div className="min-w-max w-full h-full flex flex-col">
          {/* Header Row */}
          <div className="sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-white/70 dark:border-slate-700/70 z-10">
            <div className="flex">
              {/* Fixed columns */}
              <div className="flex bg-white/80 dark:bg-slate-900/80">
                <div className="w-24 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white border-r border-white/70 dark:border-slate-700/70">
                  Ex-Date
                </div>
                <div className="w-20 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white border-r border-white/70 dark:border-slate-700/70">
                  Div/Share
                </div>
                <div className="w-16 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white border-r border-white/70 dark:border-slate-700/70">
                  Qty
                </div>
                <div className="w-24 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white border-r border-white/70 dark:border-slate-700/70">
                  Trade Fee (Open&nbsp;&amp;&nbsp;Close)
                </div>
                <div className="w-20 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white border-r border-white/70 dark:border-slate-700/70">
                  Margin Fee
                </div>
                <div className="w-24 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-white border-r border-white/70 dark:border-slate-700/70">
                  Total Cost
                </div>
                <div className="w-[120px] px-3 py-2 text-xs font-medium text-foreground border-r border-border text-center">
                  Trend
                </div>
              </div>
              
              {/* Price columns */}
              <div className="flex">
                {dateColumns?.map((column) => (
                  <div
                    key={column?.key}
                    className={`
                      w-16 px-2 py-2 text-xs font-medium text-center border-r border-border
                      ${column?.isExDate 
                        ? 'bg-amber-100 text-foreground font-semibold' 
                        : 'text-muted-foreground'
                      }
                    `}
                  >
                    {column?.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Data Rows */}
          <div className="flex-1 overflow-y-auto">
            {data?.map((row, rowIndex) => {
              const rowSelections = selectedCells?.[row?.id] || {};
              const buyOffset = rowSelections?.buy?.offset;
              const sellOffset = rowSelections?.sell?.offset;
              const pnlData = calculatePnL(row, buyOffset, sellOffset);
              const autoTrade = autoTradeMap?.[row?.id];
              const buyColumnKey = rowSelections?.buy?.columnKey;
              const selectedBuyPrice = buyColumnKey ? parseFloat(row?.prices?.[buyColumnKey]) : null;
              const sparkline = buildSparkline(row?.prices);
              const hasSparklinePoints = sparkline.points.length > 0;
              const showSparklinePath = Boolean(sparkline.path);
              const hasZebraBackground = !pnlData;
              let rowBackgroundStyle = {};

              if (pnlData?.buyPrice && pnlData?.sellPrice) {
                if (pnlData.buyPrice > pnlData.sellPrice) {
                  rowBackgroundStyle = {
                    backgroundImage:
                      'linear-gradient(90deg, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.05) 100%)',
                  };
                } else if (pnlData.buyPrice < pnlData.sellPrice) {
                  rowBackgroundStyle = {
                    backgroundImage:
                      'linear-gradient(90deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.05) 100%)',
                  };
                }
              }
              
              return (
                <div
                  key={row?.id}
                  className={`
                    flex border-b border-border hover:bg-accent/50 transition-colors
                    ${hasZebraBackground
                      ? rowIndex % 2 === 0
                        ? 'bg-white/60 dark:bg-slate-900/50'
                        : 'bg-white/40 dark:bg-slate-900/40'
                      : ''}
                  `}
                  style={rowBackgroundStyle}
                >
                  {/* Fixed columns */}
                  <div className="flex bg-card/80 backdrop-blur-sm">
                    <div className="w-24 px-3 py-2 text-xs font-data text-foreground border-r border-border">
                      {new Date(row.exDate)?.toLocaleDateString('en-GB')}
                    </div>
                    <div className="w-20 px-3 py-2 text-xs font-data text-foreground border-r border-border">
                      ${row?.dividendPerShare?.toFixed(3) || '—'}
                    </div>
                    <div className="w-16 px-3 py-2 text-xs font-data text-foreground border-r border-border">
                      {pnlData?.quantity || '—'}
                    </div>
                    <div className={`
                      w-24 px-3 py-2 text-xs font-data border-r border-border
                      ${pnlData ? 'text-foreground' : ''}
                    `}>
                      {pnlData ? (
                        <div>
                          <div className="font-medium">{formatCurrency(pnlData.tradeFee)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatCurrency(pnlData.perLegFee)} per leg
                          </div>
                        </div>
                      ) : '—'}
                    </div>
                    <div className={`
                      w-20 px-3 py-2 text-xs font-data border-r border-border
                      ${pnlData ? 'text-foreground' : ''}
                    `}>
                      {pnlData ? (
                        <div>
                          <div className="font-medium">{formatCurrency(pnlData.marginFee)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {pnlData.holdingDays} day{pnlData.holdingDays !== 1 ? 's' : ''} holding
                          </div>
                        </div>
                      ) : '—'}
                    </div>
                    <div className={`
                      w-24 px-3 py-2 text-xs font-data border-r border-border font-medium
                      ${pnlData?.totalCost > 0 ? 'text-success' : pnlData?.totalCost < 0 ? 'text-error' : 'text-foreground'}
                    `}>
                      {pnlData ? (
                        <div>
                          <div>{formatCurrency(pnlData.totalCost)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {Number.isFinite(pnlData.netPercentage) ? formatPercentage(pnlData.netPercentage) : '—'}
                          </div>
                        </div>
                      ) : '—'}
                    </div>
                    <div className="w-[120px] px-3 py-2 border-r border-border flex items-center justify-center">
                      {hasSparklinePoints ? (
                        <svg
                          width={SPARKLINE_WIDTH}
                          height={SPARKLINE_HEIGHT}
                          viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
                          preserveAspectRatio="none"
                          className="block"
                        >
                          {showSparklinePath && (
                            <path
                              d={sparkline.path}
                              stroke="var(--color-primary)"
                              strokeWidth={1.5}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}
                          {sparkline.points.length === 1 && (
                            <circle
                              cx={sparkline.points[0].x}
                              cy={sparkline.points[0].y}
                              r={2.2}
                              fill="var(--color-muted-foreground)"
                            />
                          )}
                          {sparkline.exPoint && (
                            <circle
                              cx={sparkline.exPoint.x}
                              cy={sparkline.exPoint.y}
                              r={2.5}
                              fill="var(--color-destructive)"
                              stroke="var(--color-destructive)"
                            />
                          )}
                        </svg>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </div>
                  {/* Price columns */}
                  <div className="flex">
                    {dateColumns?.map((column) => {
                      const price = row?.prices?.[column?.key];
                      const priceValue = price ? parseFloat(price) : null;
                      const isSelected = rowSelections?.buy?.columnKey === column?.key || 
                                       rowSelections?.sell?.columnKey === column?.key;
                      const canSelect = (column?.offset < 0) || (column?.offset > 0);
                      const isHovered = hoveredCell === `${row?.id}-${column?.key}`;
                      let dynamicHighlightStyle = {};
                      const autoHighlightType =
                        autoTrade && column?.offset !== 0
                          ? column?.offset === autoTrade.buyOffset
                            ? 'buy'
                            : column?.offset === autoTrade.sellOffset
                              ? 'sell'
                              : null
                          : null;

                      if (
                        rowSelections?.buy &&
                        !isSelected &&
                        typeof selectedBuyPrice === 'number' &&
                        Number.isFinite(priceValue)
                      ) {
                        const diff = priceValue - selectedBuyPrice;
                        if (diff !== 0) {
                          const ratioBase = Math.abs(selectedBuyPrice) > 0 ? Math.abs(diff) / Math.abs(selectedBuyPrice) : 0.3;
                          const ratio = Math.min(ratioBase, 0.6);
                          const alphaStart = 0.08 + ratio * 0.2;
                          const alphaEnd = 0.18 + ratio * 0.6;
                          if (diff < 0) {
                            dynamicHighlightStyle = {
                              ...dynamicHighlightStyle,
                              background: `linear-gradient(180deg, rgba(239,68,68,${alphaStart.toFixed(2)}), rgba(239,68,68,${alphaEnd.toFixed(2)}))`
                            };
                          } else {
                            dynamicHighlightStyle = {
                              ...dynamicHighlightStyle,
                              background: `linear-gradient(180deg, rgba(16,185,129,${alphaStart.toFixed(2)}), rgba(16,185,129,${alphaEnd.toFixed(2)}))`
                            };
                          }
                        }
                      }

                      if (autoHighlightType) {
                        const color = AUTO_TRADE_COLORS[autoHighlightType] || AUTO_TRADE_COLORS.buy;
                        dynamicHighlightStyle = {
                          ...dynamicHighlightStyle,
                          boxShadow: `0 0 0 2px rgba(${color},0.55) inset`,
                        };
                      }
                      
                      return (
                        <div
                          key={column?.key}
                          className={`
                            w-16 px-2 py-2 text-xs font-data text-center border-r border-border
                            relative cursor-pointer transition-all duration-150
                            ${column?.isExDate ? 'bg-amber-50' : ''}
                            ${canSelect ? 'hover:bg-accent hover:text-accent-foreground' : 'cursor-not-allowed'}
                            ${isSelected ? 'bg-primary/20 ring-1 ring-primary' : ''}
                            ${isHovered && canSelect ? 'bg-accent/50' : ''}
                          `}
                          onClick={() => canSelect && handleCellClick(row?.id, column?.key, column?.offset)}
                          onMouseEnter={() => setHoveredCell(`${row?.id}-${column?.key}`)}
                          onMouseLeave={() => setHoveredCell(null)}
                          title={canSelect ? `Click to select ${column?.offset < 0 ? 'buy' : 'sell'} date` : 'Cannot select ex-date'}
                          style={dynamicHighlightStyle}
                        >
                          {formatPrice(price)}
                          {/* Selection badges */}
                          {isSelected && (
                            <div className={`
                              absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] font-bold
                              flex items-center justify-center text-white
                              ${rowSelections?.buy?.columnKey === column?.key ? 'bg-blue-500' : 'bg-red-500'}
                            `}>
                              {rowSelections?.buy?.columnKey === column?.key ? 'B' : 'S'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Instructions */}
      <div className="px-4 py-3 bg-white/70 dark:bg-slate-900/60 border-t border-white/70 dark:border-slate-700/70">
        <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center flex-wrap gap-4">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>Buy Date</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span>Sell Date</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-emerald-500/30 rounded"></div>
              <span>Favorable Pattern</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Icon name="Info" size={12} />
            <span>Press ESC to clear selections • Click cells to select buy/sell dates</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataGrid;
