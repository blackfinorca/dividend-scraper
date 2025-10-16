import { csvParse } from 'd3-dsv';

const OFFSETS = Array.from({ length: 41 }, (_, idx) => idx - 10); // -10 .. +30
const CSV_JSON_URL = '/yahoo_stock_data.json';
const CSV_URL = '/yahoo_stock_data.csv';
const DASHBOARD_JSON_URL = '/dashboard_data.json';
const DASHBOARD_CSV_URL = '/dashboard_data.csv';
const TICKER_CATALOGUE_STORAGE_KEY = 'sgDividendTickerCatalogue';

const buildPriceKey = (offset) => `D${offset >= 0 ? '+' : ''}${offset}`;

const loadCsvRows = async () => {
  const response = await fetch(CSV_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load dividend dataset. Please try again later.');
  }

  const csvText = await response.text();
  const parsedRows = csvParse(csvText);
  return parsedRows ?? [];
};

const loadDashboardRows = async () => {
  const response = await fetch(DASHBOARD_CSV_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Unable to load dashboard dataset. Please try again later.');
  }
  const csvText = await response.text();
  const parsedRows = csvParse(csvText);
  return parsedRows ?? [];
};

const loadPrimaryRows = async () => {
  return loadCsvRows();
};

const parsePrice = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parsePercentageValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace('%', '').trim();
  if (!cleaned) return null;
  const numeric = parseFloat(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseAmountValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/,/g, '');
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = parseFloat(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseMarketCap = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace(/[\s,$€£¥₩₽₹₫₴₦฿₡₱₲₵₸₺₭₪₣₥₢₯₠₣ƒ~]/g, '')
    .toUpperCase();

  const match = cleaned.match(/(-?\d+(?:\.\d+)?)([KMBT]?)/);
  if (!match) {
    return null;
  }

  const [, numberStr, suffix = ''] = match;
  const numeric = parseFloat(numberStr);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const multipliers = {
    K: 1e3,
    M: 1e6,
    B: 1e9,
    T: 1e12,
  };

  const multiplier = multipliers[suffix] || 1;
  return numeric * multiplier;
};

const formatMarketCapDisplay = (rawValue, numericValue) => {
  if (rawValue !== undefined && rawValue !== null) {
    const trimmed = String(rawValue).trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (!Number.isFinite(numericValue)) {
    return '';
  }

  try {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency: 'SGD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(numericValue);
  } catch (error) {
    return numericValue.toLocaleString('en-SG');
  }
};

const itemDateCompare = (a, b) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

const normaliseInputTicker = (ticker) => {
  if (!ticker) return '';
  const trimmed = ticker.trim().toUpperCase();
  if (!trimmed) return '';
  const noSuffix = trimmed.split(':')[0].split('.')[0];
  return noSuffix;
};

const buildPriceMapFromRow = (row) => {
  const prices = {};
  OFFSETS.forEach((offset) => {
    const key = buildPriceKey(offset);
    prices[key] = null;
    if (offset === 0) {
      prices.D0 = null;
    }
  });

  const exPrice = parsePrice(row['Ex-Date Price']);
  if (exPrice !== null) {
    const formatted = exPrice.toFixed(2);
    prices.D0 = formatted;
    prices['D+0'] = formatted;
  }

  Object.entries(row).forEach(([key, value]) => {
    if (key === 'Ex-Date Price') return;
    const match = /^Price D([+-]\d+)$/.exec(key);
    if (!match) return;
    const offset = parseInt(match[1], 10);
    if (Number.isNaN(offset)) return;
    const price = parsePrice(value);
    const formattedKey = buildPriceKey(offset);
    const formattedValue = price !== null ? price.toFixed(2) : null;
    prices[formattedKey] = formattedValue;
    if (offset === 0) {
      prices.D0 = formattedValue;
    }
  });

  return prices;
};

const extractPriceValues = (row) => {
  const values = [];
  const exPrice = parsePrice(row['Ex-Date Price']);
  if (exPrice !== null) {
    values.push(exPrice);
  }

  Object.keys(row).forEach((key) => {
    if (!key.startsWith('Price D')) {
      return;
    }
    const price = parsePrice(row[key]);
    if (price !== null) {
      values.push(price);
    }
  });

  return values;
};

const calculateVolatility = (prices) => {
  if (!prices || prices.length < 2) {
    return null;
  }
  const mean = prices.reduce((acc, value) => acc + value, 0) / prices.length;
  if (!Number.isFinite(mean) || mean === 0) {
    return null;
  }
  const variance = prices.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (prices.length - 1);
  if (!Number.isFinite(variance)) {
    return null;
  }
  const stdDev = Math.sqrt(Math.max(variance, 0));
  if (!Number.isFinite(stdDev)) {
    return null;
  }
  return stdDev / Math.abs(mean);
};

const filterByDateRange = (rows, startDate, endDate) => {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (!start && !end) {
    return rows;
  }

  return rows.filter((row) => {
    const rowDate = new Date(row['Ex-Dividend Date']);
    if (Number.isNaN(rowDate.getTime())) return false;
    if (start && rowDate < start) return false;
    if (end && rowDate > end) return false;
    return true;
  });
};

export async function fetchSGXDividendData({ ticker, startDate, endDate }) {
  const parsedRows = await loadPrimaryRows();

  if (!parsedRows?.length) {
    return [];
  }

  const normalisedTicker = normaliseInputTicker(ticker);
  if (!normalisedTicker) {
    throw new Error('A valid ticker symbol is required to fetch data.');
  }

  const matchingRows = parsedRows.filter(
    (row) => (row?.Ticker || '').toUpperCase() === normalisedTicker
  );

  if (!matchingRows.length) {
    throw new Error('No records found for the requested ticker in the offline dataset.');
  }

  const filteredRows = filterByDateRange(matchingRows, startDate, endDate);

  if (!filteredRows.length) {
    return [];
  }

  return filteredRows.map((row) => {
    const exDate = row['Ex-Dividend Date'];
    const dividendAmount = parsePrice(row['Dividend Amount']) ?? 0;
    const prices = buildPriceMapFromRow(row);

    return {
      id: `${normalisedTicker}-${exDate}`,
      exDate,
      dividendPerShare: dividendAmount,
      prices,
      companyName: row['Company Name'] || null,
    };
  });
}

export async function fetchPortfolioSummary() {
  const parsedRows = await loadPrimaryRows();

  if (!parsedRows?.length) {
    return [];
  }

  const tickerMap = new Map();

  parsedRows.forEach((row) => {
    const tickerRaw = (row?.Ticker || '').trim();
    if (!tickerRaw) {
      return;
    }

    const ticker = tickerRaw.toUpperCase();
    const companyName = row['Company Name'] || '';
    const dividendAmount = parsePrice(row['Dividend Amount']);
    const exPrice = parsePrice(row['Ex-Date Price']);
    const exDate = row['Ex-Dividend Date'] || null;
    const rawMarketCap = getValue(row, ['Market Cap', 'market cap', 'market_cap', 'marketCap']);
    const marketCapValue = parseMarketCap(rawMarketCap);
    const marketCapDisplay = formatMarketCapDisplay(rawMarketCap, marketCapValue);

    if (!tickerMap.has(ticker)) {
      tickerMap.set(ticker, {
        ticker,
        companyName,
        eventCount: 0,
        dividendSum: 0,
        dividendCount: 0,
        yieldSum: 0,
        yieldCount: 0,
        volatilitySum: 0,
        volatilityCount: 0,
        latestExDate: null,
        marketCap: Number.isFinite(marketCapValue) ? marketCapValue : null,
        marketCapDisplay: marketCapDisplay || '',
      });
    }

    const entry = tickerMap.get(ticker);
    entry.eventCount += 1;
    if (companyName && !entry.companyName) {
      entry.companyName = companyName;
    }

    if (Number.isFinite(marketCapValue)) {
      if (!Number.isFinite(entry.marketCap) || marketCapValue > entry.marketCap) {
        entry.marketCap = marketCapValue;
        entry.marketCapDisplay = marketCapDisplay || entry.marketCapDisplay;
      }
    } else if (marketCapDisplay && !entry.marketCapDisplay) {
      entry.marketCapDisplay = marketCapDisplay;
    }

    if (dividendAmount !== null) {
      entry.dividendSum += dividendAmount;
      entry.dividendCount += 1;
    }

    if (dividendAmount !== null && exPrice !== null && exPrice > 0) {
      entry.yieldSum += (dividendAmount / exPrice) * 100;
      entry.yieldCount += 1;
    }

    const priceValues = extractPriceValues(row);
    const eventVolatility = calculateVolatility(priceValues);
    if (eventVolatility !== null) {
      entry.volatilitySum += eventVolatility;
      entry.volatilityCount += 1;
    }

    if (exDate) {
      const currentLatest = entry.latestExDate ? new Date(entry.latestExDate) : null;
      const candidateDate = new Date(exDate);
      if (!Number.isNaN(candidateDate.getTime())) {
        if (!currentLatest || candidateDate > currentLatest) {
          entry.latestExDate = exDate;
        }
      }
    }
  });

  const summaries = Array.from(tickerMap.values()).map((entry) => ({
    ticker: entry.ticker,
    companyName: entry.companyName,
    events: entry.eventCount,
    averageDividend: entry.dividendCount ? entry.dividendSum / entry.dividendCount : null,
    averageYield: entry.yieldCount ? entry.yieldSum / entry.yieldCount : null,
    averageVolatility: entry.volatilityCount ? entry.volatilitySum / entry.volatilityCount : null,
    latestExDate: entry.latestExDate,
    marketCap: Number.isFinite(entry.marketCap) ? entry.marketCap : null,
    marketCapDisplay: entry.marketCapDisplay || '',
  }));

  const benchmark = summaries.find((summary) => summary.ticker === 'S68');
  const benchmarkVolatility = benchmark && benchmark.averageVolatility !== null ? benchmark.averageVolatility : null;

  return summaries
    .map((summary) => ({
      ...summary,
      volatilityIndex:
        benchmarkVolatility && summary.averageVolatility !== null
          ? Math.min(summary.averageVolatility / benchmarkVolatility, 1)
          : null,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

const getValue = (row, candidates) => {
  const lowered = new Map(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value])
  );
  for (const candidate of candidates) {
    const direct = row[candidate];
    if (direct !== undefined) {
      return direct;
    }
    const normalized = lowered.get(candidate.trim().toLowerCase());
    if (normalized !== undefined) {
      return normalized;
    }
  }
  return '';
};

const buildTickerVariantSet = (rawTicker) => {
  const variants = new Set();
  const trimmed = (rawTicker || '').trim().toUpperCase();
  if (!trimmed) {
    return variants;
  }

  variants.add(trimmed);

  const canonical = normaliseInputTicker(trimmed);
  if (canonical) {
    variants.add(canonical);
    variants.add(`${canonical}.SI`);
  }

  return variants;
};

const buildTickerCatalogueFromRows = (rows) => {
  const seen = new Map();

  rows.forEach((row) => {
    const rawTicker = getValue(row, ['Ticker']);
    const companyName = getValue(row, ['Company Name']) || '';
    const variants = buildTickerVariantSet(rawTicker);
    if (!variants.size) {
      return;
    }

    const canonical = normaliseInputTicker(rawTicker);
    if (!canonical) {
      return;
    }

     const rawMarketCap = getValue(row, ['Market Cap', 'market cap', 'market_cap', 'marketCap']);
     const marketCapValue = parseMarketCap(rawMarketCap);
     const marketCapDisplay = formatMarketCapDisplay(rawMarketCap, marketCapValue);

    if (!seen.has(canonical)) {
      seen.set(canonical, {
        ticker: canonical,
        displayTicker: `${canonical}.SI`,
        companyName,
        variants: new Set(),
        marketCap: marketCapValue,
        marketCapDisplay,
      });
    }

    const entry = seen.get(canonical);
    if (companyName && !entry.companyName) {
      entry.companyName = companyName;
    }

    if (Number.isFinite(marketCapValue)) {
      if (!Number.isFinite(entry.marketCap) || marketCapValue > entry.marketCap) {
        entry.marketCap = marketCapValue;
        entry.marketCapDisplay = marketCapDisplay;
      }
    }

    variants.forEach((variant) => entry.variants.add(variant));
  });

  return Array.from(seen.values())
    .map((entry) => ({
      ticker: entry.ticker,
      displayTicker: entry.displayTicker,
      companyName: entry.companyName,
      variants: Array.from(entry.variants),
      marketCap: Number.isFinite(entry.marketCap) ? entry.marketCap : null,
      marketCapDisplay: entry.marketCapDisplay || '',
    }))
    .sort((a, b) => {
      const capA = Number.isFinite(a.marketCap) ? a.marketCap : -Infinity;
      const capB = Number.isFinite(b.marketCap) ? b.marketCap : -Infinity;
      if (capA !== capB) {
        return capB - capA;
      }
      return a.ticker.localeCompare(b.ticker);
    });
};

let tickerCatalogueCache = null;

const readStoredTickerCatalogue = () => {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(TICKER_CATALOGUE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.catalogue)) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Unable to read cached ticker catalogue.', error);
    return null;
  }
};

const writeStoredTickerCatalogue = (catalogue) => {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return;
  }
  try {
    const payload = JSON.stringify({
      catalogue,
      cachedAt: new Date().toISOString(),
    });
    window.localStorage.setItem(TICKER_CATALOGUE_STORAGE_KEY, payload);
  } catch (error) {
    console.warn('Unable to persist ticker catalogue cache.', error);
  }
};

export async function fetchTickerCatalogue({ forceRefresh = false } = {}) {
  if (!forceRefresh && tickerCatalogueCache) {
    return tickerCatalogueCache.slice();
  }

  let parsedRows;
  try {
    parsedRows = await loadDashboardRows();
  } catch (err) {
    console.warn('Falling back to yahoo_stock_data dataset for ticker list:', err);
    try {
      parsedRows = await loadPrimaryRows();
    } catch (fallbackError) {
      console.error('Unable to load fallback ticker dataset.', fallbackError);
    }
  }

  if (!parsedRows?.length) {
    const stored = readStoredTickerCatalogue();
    if (stored?.catalogue?.length) {
      tickerCatalogueCache = stored.catalogue;
      return tickerCatalogueCache.slice();
    }
    tickerCatalogueCache = [];
    return [];
  }

  tickerCatalogueCache = buildTickerCatalogueFromRows(parsedRows);
  writeStoredTickerCatalogue(tickerCatalogueCache);
  return tickerCatalogueCache.slice();
}

export async function fetchUpcomingDividends({ lookaheadDays = 30 } = {}) {
  let parsedRows;
  try {
    parsedRows = await loadDashboardRows();
  } catch (err) {
    console.warn('Falling back to yahoo_stock_data dataset for dashboard data:', err);
    parsedRows = await loadPrimaryRows();
  }

  if (!parsedRows?.length) {
    return [];
  }

  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + lookaheadDays);

  const byTicker = new Map();

  parsedRows.forEach((row) => {
    const rawTicker = (row?.Ticker || '').trim();
    if (!rawTicker) {
      return;
    }
    const ticker = rawTicker.toUpperCase();
    const companyName = getValue(row, ['Company Name']) || '';

    const upcomingDateStr = (getValue(row, ['Upcoming Dividend Ex Date', 'Upcoming Ex-Date']) || '').trim();
    if (!upcomingDateStr) {
      return;
    }
    const upcomingDate = new Date(upcomingDateStr);
    if (Number.isNaN(upcomingDate.getTime())) {
      return;
    }

    const payDateLabel = (getValue(row, ['dividend payment date', 'Upcoming Dividend Pay Date']) || '').trim();
    const yieldLabel = (getValue(row, ['dividend yield', 'Upcoming Dividend Yield']) || '').trim();
    const amountLabel = (getValue(row, ['dividend amount', 'Upcoming Dividend Amount']) || '').trim();
    const yieldValue = parsePercentageValue(yieldLabel);
    const amountValue = parseAmountValue(amountLabel);

    const existing = byTicker.get(ticker);
    if (!existing || upcomingDate < existing.exDate) {
      byTicker.set(ticker, {
        ticker,
        companyName,
        exDate: upcomingDate,
        exDateLabel: upcomingDateStr,
        payDateLabel,
        yieldLabel: yieldLabel || null,
        yieldValue,
        amountLabel: amountLabel || null,
        amountValue,
      });
    }
  });

  const filtered = Array.from(byTicker.values())
    .filter((item) => item.exDate >= today && item.exDate <= horizon)
    .sort((a, b) => itemDateCompare(a.exDate, b.exDate));

  return filtered.map((item) => ({
    ticker: item.ticker,
    companyName: item.companyName,
    exDate: item.exDateLabel || item.exDate.toISOString().split('T')[0],
    dividendAmount: item.amountValue,
    dividendAmountLabel: item.amountLabel,
    dividendPayDate: item.payDateLabel || null,
    yieldPercentage: item.yieldValue,
    yieldLabel: item.yieldLabel,
  }));
}

export const fetchDashboardTickers = fetchTickerCatalogue;

const findLatestDividendRow = (rows) => {
  let latestRow = null;
  let latestDate = null;

  rows.forEach((row) => {
    const dateStr = (row['Ex-Dividend Date'] || '').trim();
    if (!dateStr) {
      return;
    }
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    if (!latestDate || date > latestDate) {
      latestDate = date;
      latestRow = row;
    }
  });

  return { latestRow, latestDate };
};

export async function fetchLatestDividendSnapshot(ticker) {
  const parsedRows = await loadPrimaryRows();

  if (!parsedRows?.length) {
    throw new Error('Dividend dataset is not available.');
  }

  const normalisedTicker = normaliseInputTicker(ticker);
  if (!normalisedTicker) {
    throw new Error('Please provide a valid ticker symbol.');
  }

  const matchingRows = parsedRows.filter(
    (row) => (row?.Ticker || '').trim().toUpperCase() === normalisedTicker
  );

  if (!matchingRows.length) {
    throw new Error('The selected ticker does not have dividend records in the offline dataset.');
  }

  const { latestRow, latestDate } = findLatestDividendRow(matchingRows);
  if (!latestRow || !latestDate) {
    throw new Error('No dividend history is available for the selected ticker.');
  }

  const amountRaw = latestRow['Dividend Amount'];
  const amountValue = parseAmountValue(amountRaw);
  const priceValue = parsePrice(latestRow['Ex-Date Price']);

  return {
    ticker: normalisedTicker,
    companyName: latestRow['Company Name'] || '',
    lastExDate: latestDate.toISOString().split('T')[0],
    dividendAmount: amountValue !== null ? amountValue : null,
    dividendAmountLabel:
      amountValue !== null ? amountValue.toFixed(4) : (amountRaw !== undefined ? String(amountRaw).trim() : ''),
    exDatePrice: priceValue !== null ? priceValue : null,
    exDatePriceLabel: priceValue !== null ? priceValue.toFixed(4) : '',
  };
}
