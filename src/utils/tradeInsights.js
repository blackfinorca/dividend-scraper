import { calculateSGXMarginCosts } from './sgxMarginCalculator';

export const PRICE_OFFSETS = Array.from({ length: 41 }, (_, idx) => idx - 10);
export const AUTO_TRADE_SYMBOLS = ['BEC', 'BEC.SI', 'BEX', 'BEX.SI'];

const BROKER_FEE_RATE = 0.00127;
const MINIMUM_FEE = 4.10;

const DEFAULT_MARGIN_AMOUNT = 50000;

const normaliseMarginAmount = (value) => {
  const numeric = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_MARGIN_AMOUNT;
  }
  return numeric;
};

export const calculatePnLForOffsets = (row, buyOffset, sellOffset, marginAmountInput) => {
  if (!row || buyOffset >= 0 || sellOffset <= 0) {
    return null;
  }

  const marginAmount = normaliseMarginAmount(marginAmountInput);
  const buyKey = `D${buyOffset}`;
  const sellKey = `D${sellOffset >= 0 ? '+' : ''}${sellOffset}`;

  const rawBuyPrice = row?.prices?.[buyKey];
  const rawSellPrice = row?.prices?.[sellKey];
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

  let marginFee = 0;
  try {
    const marginCosts = calculateSGXMarginCosts({
      tradeValue: marginAmount,
      marginRatio: 0.5,
      holdingDays,
      marginInterestRate: 0.06,
      feeRate: BROKER_FEE_RATE,
      minimumFee: MINIMUM_FEE,
    });
    marginFee = marginCosts?.financingCost ?? 0;
  } catch {
    marginFee = (marginAmount * 0.06 * holdingDays) / 365;
  }

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
};

export const computeAutoTradeHighlights = (
  data = [],
  marginAmountInput,
  { targetTickers = null, maxRowsPerTicker = 3 } = {}
) => {
  const marginAmount = normaliseMarginAmount(marginAmountInput);
  const highlightMap = {};
  const selectedEntries = [];

  const targetSet =
    Array.isArray(targetTickers) && targetTickers.length
      ? new Set(targetTickers.map((symbol) => symbol.toUpperCase()))
      : null;

  const perTicker = new Map();

  data.forEach((row) => {
    const rowId = row?.id;
    if (!rowId) {
      return;
    }
    const ticker = rowId.split('-')[0]?.toUpperCase();
    if (!ticker) {
      return;
    }

    if (targetSet && !targetSet.has(ticker)) {
      return;
    }

    let bestTrade = null;

    let lowestBuy = null;
    let highestSell = null;

    PRICE_OFFSETS.forEach((offset) => {
      if (offset < 0) {
        const key = `D${offset}`;
        const raw = row?.prices?.[key];
        const price = raw !== undefined && raw !== null ? parseFloat(raw) : null;
        if (Number.isFinite(price)) {
          if (!lowestBuy || price < lowestBuy.price || (price === lowestBuy.price && offset > lowestBuy.offset)) {
            lowestBuy = { offset, price };
          }
        }
      } else if (offset > 0) {
        const key = `D+${offset}`;
        const raw = row?.prices?.[key];
        const price = raw !== undefined && raw !== null ? parseFloat(raw) : null;
        if (Number.isFinite(price)) {
          if (!highestSell || price > highestSell.price || (price === highestSell.price && offset < highestSell.offset)) {
            highestSell = { offset, price };
          }
        }
      }
    });

    if (lowestBuy && highestSell) {
      const trade = calculatePnLForOffsets(row, lowestBuy.offset, highestSell.offset, marginAmount);
      if (trade) {
        bestTrade = {
          ...trade,
          buyOffset: lowestBuy.offset,
          sellOffset: highestSell.offset,
          ticker,
          exDate: row?.exDate || '',
          dividendPerShare: row?.dividendPerShare || 0,
        };
      }
    }

    if (!bestTrade) {
      return;
    }

    if (!perTicker.has(ticker)) {
      perTicker.set(ticker, []);
    }
    perTicker.get(ticker).push({ rowId, trade: bestTrade, row });
  });

  perTicker.forEach((entries) => {
    entries.sort(
      (a, b) => (b.trade.totalCost ?? Number.NEGATIVE_INFINITY) - (a.trade.totalCost ?? Number.NEGATIVE_INFINITY)
    );
    entries.slice(0, maxRowsPerTicker).forEach((entry) => {
      highlightMap[entry.rowId] = {
        buyOffset: entry.trade.buyOffset,
        sellOffset: entry.trade.sellOffset,
        totalCost: entry.trade.totalCost,
        netPercentage: entry.trade.netPercentage,
        quantity: entry.trade.quantity,
      };
      selectedEntries.push({
        ...entry.trade,
        rowId: entry.rowId,
      });
    });
  });

  selectedEntries.sort(
    (a, b) => (b.totalCost ?? Number.NEGATIVE_INFINITY) - (a.totalCost ?? Number.NEGATIVE_INFINITY)
  );

  let buySum = 0;
  let sellSum = 0;
  let count = 0;

  selectedEntries.forEach((entry) => {
    const buyOffset = Number(entry.buyOffset);
    const sellOffset = Number(entry.sellOffset);
    if (Number.isFinite(buyOffset)) {
      buySum += buyOffset;
    }
    if (Number.isFinite(sellOffset)) {
      sellSum += sellOffset;
    }
    count += 1;
  });

  const averageBuyOffset = count > 0 ? buySum / count : null;
  const averageSellOffset = count > 0 ? sellSum / count : null;

  const topTrades = selectedEntries.slice(0, 3).map((entry) => ({
    ticker: entry.ticker,
    exDate: entry.exDate,
    buyOffset: entry.buyOffset,
    sellOffset: entry.sellOffset,
    totalCost: entry.totalCost,
    netPercentage: entry.netPercentage,
    quantity: entry.quantity,
    dividendPerShare: entry.dividendPerShare,
    rowId: entry.rowId,
  }));

  return {
    highlightMap,
    topTrades,
    averageBuyOffset,
    averageSellOffset,
  };
};
