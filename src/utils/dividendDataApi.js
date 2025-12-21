import { csvParse } from 'd3-dsv';

const OFFSETS = Array.from({ length: 41 }, (_, idx) => idx - 10); // -10 .. +30
const SNAPSHOT_URL = '/sgx_snapshot.json';
const YAHOO_JSON_URL = '/yahoo_stock_data.json';
const DASHBOARD_CSV_URL = '/dashboard_data.csv';
const UPCOMING_JSON_URL = '/dividends_upcoming.json';
const DIVIDENDS_SG_UPCOMING_URL = 'https://www.dividends.sg/dividend/coming';
const TICKER_CATALOGUE_STORAGE_KEY = 'sgDividendTickerCatalogue';

const buildPriceKey = (offset) => `D${offset >= 0 ? '+' : ''}${offset}`;

const normaliseKeyVariants = (key) => {
  if (key === null || key === undefined) {
    return [];
  }
  const text = String(key);
  const variants = new Set();
  const queue = [text];

  while (queue.length) {
    const current = queue.shift();
    if (!current || variants.has(current)) {
      continue;
    }
    variants.add(current);

    const lower = current.toLowerCase();
    if (!variants.has(lower)) {
      queue.push(lower);
    }

    const replaced = lower.replace(/[-/]+/g, ' ');
    if (!variants.has(replaced)) {
      queue.push(replaced);
    }

    const noSpaces = replaced.replace(/\s+/g, '');
    if (!variants.has(noSpaces)) {
      queue.push(noSpaces);
    }

    const underscores = replaced.replace(/\s+/g, '_');
    if (!variants.has(underscores)) {
      queue.push(underscores);
    }

    const plusWord = underscores.replace(/\+/g, 'plus').replace(/-/g, 'minus');
    if (!variants.has(plusWord)) {
      queue.push(plusWord);
    }

    const plusUnderscore = underscores.replace(/\+/g, '_plus_').replace(/-/g, '_minus_');
    if (!variants.has(plusUnderscore)) {
      queue.push(plusUnderscore);
    }

    const stripped = replaced.replace(/[^a-z0-9]+/g, '');
    if (!variants.has(stripped)) {
      queue.push(stripped);
    }
  }

  return Array.from(variants);
};

const createRowAccessor = (row) => {
  const lookup = new Map();
  Object.entries(row || {}).forEach(([key, value]) => {
    normaliseKeyVariants(key).forEach((variant) => {
      if (!lookup.has(variant)) {
        lookup.set(variant, value);
      }
    });
  });
  return (key) => {
    if (!key) {
      return undefined;
    }
    const variants = normaliseKeyVariants(key);
    for (const variant of variants) {
      if (lookup.has(variant)) {
        return lookup.get(variant);
      }
    }
    return undefined;
  };
};

const getRowValue = (accessor, ...keys) => {
  if (!accessor) {
    return undefined;
  }
  for (const key of keys) {
    if (key === undefined || key === null) {
      continue;
    }
    const value = accessor(key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

let snapshotCache = null;
let snapshotPromise = null;
let yahooRowsCache = null;

const normaliseHeader = (text) =>
  (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .trim();

const parseFirstNumber = (text) => {
  if (!text) return null;
  const match = String(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = parseFloat(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseYieldField = (text) => {
  const match = String(text || '').match(/-?\d+(?:\.\d+)?\s*%/);
  if (!match) return null;
  const numeric = parseFloat(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseAmountField = (text) => {
  if (!text) return { amount: null, currency: '' };
  const cleaned = String(text).trim();
  const currencyMatch = cleaned.match(/^[A-Za-z]{3}/);
  const amount = parseFirstNumber(cleaned);
  return {
    amount,
    currency: currencyMatch ? currencyMatch[0].toUpperCase() : '',
  };
};

const parseDateField = (text) => {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  const isoLike = trimmed.replace(/\//g, '-');
  const date = new Date(isoLike);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const buildProxyUrl = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

const fetchHtmlWithFallbacks = async (urls) => {
  const attempts = Array.isArray(urls) ? urls : [urls];
  let lastError = null;

  for (const url of attempts) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        lastError = new Error(`Fetch failed with status ${response.status}`);
        continue;
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      // Try next fallback
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('Unable to fetch HTML');
};

const loadFallbackUpcomingJson = async () => {
  try {
    const response = await fetch(UPCOMING_JSON_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Fallback JSON unavailable (${response.status})`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data
      .map((row) => ({
        ticker: (row.ticker || '').toUpperCase(),
        companyName: row.company || '',
        exDate: row.nextDividend || '',
        dividendAmount: parseFirstNumber(row.amount),
        dividendAmountLabel: row.amount || null,
        dividendPayDate: null,
        yieldPercentage: parseYieldField(row.yield),
        yieldLabel: row.yield || null,
      }))
      .filter((row) => row.ticker && row.exDate);
  } catch (error) {
    console.warn('Unable to load fallback upcoming dividends JSON.', error);
    return [];
  }
};

const computeLatestYearCounts = (snapshot) => {
  const map = new Map();
  if (!snapshot?.tickers?.length) {
    return map;
  }
  const now = new Date();
  const targetYear = now.getFullYear() - 1;
  snapshot.tickers.forEach((entry) => {
    const ticker = (entry?.ticker || '').toUpperCase();
    if (!ticker) {
      return;
    }
    const events = Array.isArray(entry.events) ? entry.events : [];
    const count = events.reduce((total, event) => {
      const date = new Date(event.exDate);
      if (Number.isNaN(date.getTime())) {
        return total;
      }
      return date.getFullYear() === targetYear ? total + 1 : total;
    }, 0);
    map.set(ticker, count);
  });
  return map;
};

const buildLatestYearEventRows = (snapshot) => {
  const now = new Date();
  const targetYear = now.getFullYear() - 1;
  const counts = computeLatestYearCounts(snapshot);
  const rows = (snapshot?.tickers || [])
    .map((entry) => {
      const ticker = (entry?.ticker || '').toUpperCase();
      if (!ticker) {
        return null;
      }
      const upcoming = entry?.upcoming || null;
      const yieldValue = Number.isFinite(upcoming?.yieldValue) ? upcoming.yieldValue : null;
      const yieldLabelRaw = upcoming?.yieldLabel ? String(upcoming.yieldLabel).trim() : '';
      const yieldLabel =
        yieldLabelRaw || (Number.isFinite(yieldValue) ? `${yieldValue.toFixed(2)}%` : '');
      const nextDividendDate = upcoming?.exDate ? String(upcoming.exDate).trim() : '';

      return {
        ticker,
        eventCount: counts.get(ticker) ?? 0,
        yieldLabel,
        nextDividendDate,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  return { year: targetYear, rows };
};

const normalizePriceMap = (rawPrices) => {
  const prices = {};
  OFFSETS.forEach((offset) => {
    const key = buildPriceKey(offset);
    const raw = rawPrices?.[key];
    if (raw === undefined || raw === null || raw === '') {
      prices[key] = null;
    } else if (typeof raw === 'number') {
      prices[key] = raw.toFixed(2);
    } else {
      prices[key] = String(raw);
    }
    if (offset === 0) {
      if (prices[key] !== null) {
        prices.D0 = prices[key];
      }
    }
  });
  if (!prices.D0 && rawPrices?.D0) {
    prices.D0 = String(rawPrices.D0);
  }
  if (!prices['D+0'] && rawPrices?.['D+0']) {
    prices['D+0'] = String(rawPrices['D+0']);
  }
  if (!prices['D+0'] && prices.D0) {
    prices['D+0'] = prices.D0;
  }
  if (!prices.D0 && prices['D+0']) {
    prices.D0 = prices['D+0'];
  }
  return prices;
};

const normalizeUpcomingEntry = (entry) => {
  if (!entry) {
    return null;
  }
  const exDate = (entry.exDate || '').trim();
  if (!exDate) {
    return null;
  }
  const amountValue =
    typeof entry.amountValue === 'number' ? entry.amountValue : parseAmountValue(entry.amountLabel);
  const yieldValue =
    typeof entry.yieldValue === 'number' ? entry.yieldValue : parsePercentageValue(entry.yieldLabel);

  return {
    ticker: (entry.ticker || '').trim().toUpperCase(),
    companyName: entry.companyName || '',
    exDate,
    payDate: (entry.payDate || '').trim() || null,
    amountValue: Number.isFinite(amountValue) ? amountValue : null,
    amountLabel:
      Number.isFinite(amountValue) && !entry.amountLabel
        ? amountValue.toFixed(4)
        : (entry.amountLabel || null),
    yieldValue: Number.isFinite(yieldValue) ? yieldValue : null,
    yieldLabel:
      Number.isFinite(yieldValue) && !entry.yieldLabel
        ? `${yieldValue.toFixed(2)}%`
        : (entry.yieldLabel || null),
  };
};

const normalizeEventEntry = (event) => {
  if (!event) {
    return null;
  }
  const exDate = (event.exDate || '').trim();
  if (!exDate) {
    return null;
  }
  const dividendAmount =
    typeof event.dividendAmount === 'number'
      ? event.dividendAmount
      : parseAmountValue(event.dividendAmountLabel || event.dividendAmount);
  const exDatePrice =
    typeof event.exDatePrice === 'number'
      ? event.exDatePrice
      : parseAmountValue(event.exDatePriceLabel || event.exDatePrice);

  return {
    exDate,
    dividendAmount: Number.isFinite(dividendAmount) ? dividendAmount : null,
    dividendAmountLabel:
      Number.isFinite(dividendAmount) && !event.dividendAmountLabel
        ? dividendAmount.toFixed(4)
        : (event.dividendAmountLabel || null),
    exDatePrice: Number.isFinite(exDatePrice) ? exDatePrice : null,
    exDatePriceLabel:
      Number.isFinite(exDatePrice) && !event.exDatePriceLabel
        ? exDatePrice.toFixed(2)
        : (event.exDatePriceLabel || null),
    prices: normalizePriceMap(event.prices || {}),
  };
};

const normaliseSnapshot = (rawSnapshot) => {
  const tickers = Array.isArray(rawSnapshot?.tickers) ? rawSnapshot.tickers : [];
  const tickerMap = new Map();

  const normalisedTickers = tickers
    .map((entry) => {
      const ticker = (entry?.ticker || '').trim().toUpperCase();
      if (!ticker) {
        return null;
      }

      const normalisedEvents = Array.isArray(entry.events)
        ? entry.events
            .map(normalizeEventEntry)
            .filter(Boolean)
        : [];

      normalisedEvents.sort((a, b) => {
        const aDate = new Date(a.exDate);
        const bDate = new Date(b.exDate);
        return aDate.getTime() - bDate.getTime();
      });

      const normalisedEntry = {
        ticker,
        companyName: entry?.companyName || '',
        displayTicker: entry?.ticker || ticker,
        events: normalisedEvents,
        upcoming: normalizeUpcomingEntry(entry?.upcoming),
      };
      tickerMap.set(ticker, normalisedEntry);
      return normalisedEntry;
    })
    .filter(Boolean);

  return {
    version: rawSnapshot?.version ?? 1,
    generatedAt: rawSnapshot?.generatedAt || null,
    tickers: normalisedTickers,
    tickerMap,
  };
};

const loadSnapshot = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && snapshotCache) {
    return snapshotCache;
  }

  if (forceRefresh) {
    snapshotCache = null;
    snapshotPromise = null;
  }

  if (!snapshotPromise) {
    snapshotPromise = buildSnapshotFromCsv()
      .then((data) => {
        snapshotCache = normaliseSnapshot(data);
        return snapshotCache;
      })
      .catch(async (csvError) => {
        console.warn('Unable to build snapshot from CSV data, falling back to bundled JSON snapshot.', csvError);
        try {
          const response = await fetch(SNAPSHOT_URL, { cache: 'no-store' });
          if (!response.ok) {
            throw new Error('Unable to load dividend snapshot. Please try again later.');
          }
          const jsonData = await response.json();
          snapshotCache = normaliseSnapshot(jsonData);
          return snapshotCache;
        } catch (fallbackError) {
          snapshotPromise = null;
          const error = new Error('Unable to load dividend snapshot. Please try again later.');
          error.cause = csvError || fallbackError;
          throw error;
        }
      });
  }

  return snapshotPromise;
};

const parsePrice = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseDividendsSgUpcoming = (html) => {
  if (!html) return [];

  const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;
  const doc = parser ? parser.parseFromString(html, 'text/html') : null;
  const table = doc?.querySelector('table');

  if (!table) {
    return [];
  }

  const headerCells = Array.from(table.querySelectorAll('thead tr th'));
  const firstRowTh = !headerCells.length ? Array.from(table.querySelectorAll('tr th')) : [];
  const headers = headerCells.length ? headerCells : firstRowTh;
  const headerMap = new Map();

  headers.forEach((th, index) => {
    const key = normaliseHeader(th.textContent || '');
    if (!key) return;
    if (key.includes('company')) headerMap.set('company', index);
    if (key.includes('ticker') || key.includes('symbol')) headerMap.set('ticker', index);
    if (key.includes('price')) headerMap.set('price', index);
    if (key.includes('yield')) headerMap.set('yield', index);
    if (key.includes('amount') || key.includes('dividend')) headerMap.set('amount', index);
    if (key.includes('next') || key.includes('ex')) headerMap.set('nextDividend', index);
  });

  const rows = Array.from(table.querySelectorAll('tbody tr')); // prefer tbody
  const fallbackRows = rows.length ? [] : Array.from(table.querySelectorAll('tr')).slice(1);
  const targetRows = rows.length ? rows : fallbackRows;

  return targetRows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll('td')).map((td) => (td.textContent || '').trim());
      if (!cells.length) return null;

      const getCell = (key) => {
        const index = headerMap.get(key);
        if (index === undefined) return '';
        return cells[index] || '';
      };

      const companyName = getCell('company');
      const ticker = (getCell('ticker') || '').toUpperCase();
      const priceRaw = getCell('price');
      const yieldRaw = getCell('yield');
      const amountRaw = getCell('amount');
      const nextDividendRaw = getCell('nextDividend');

      const { amount: dividendAmount, currency: dividendCurrency } = parseAmountField(amountRaw);
      const yieldValue = parseYieldField(yieldRaw);
      const priceValue = parseFirstNumber(priceRaw);
      const exDate = parseDateField(nextDividendRaw);

      if (!exDate || !ticker) {
        return null;
      }

      return {
        ticker,
        companyName,
        exDate,
        dividendAmount,
        dividendAmountLabel: amountRaw || (Number.isFinite(dividendAmount) ? dividendAmount.toFixed(4) : null),
        dividendCurrency,
        dividendPayDate: null,
        yieldPercentage: yieldValue,
        yieldLabel: yieldRaw || (Number.isFinite(yieldValue) ? `${yieldValue.toFixed(2)}%` : null),
        price: priceValue,
        priceLabel: priceRaw || (Number.isFinite(priceValue) ? priceValue.toFixed(4) : null),
      };
    })
    .filter(Boolean);
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

const normaliseString = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const formatPriceLabel = (value) => {
  if (!Number.isFinite(value)) return null;
  return value.toFixed(2);
};

const buildPriceMapFromRow = (row) => {
  const get = createRowAccessor(row);
  const prices = {};
  const exPrice = parseAmountValue(getRowValue(get, 'Ex-Date Price', 'ex_dividend_price'));
  const formattedExPrice = formatPriceLabel(exPrice);
  prices['D+0'] = formattedExPrice;
  prices.D0 = formattedExPrice;

  OFFSETS.forEach((offset) => {
    if (offset === 0) {
      return;
    }
    const column = `Price D${offset >= 0 ? '+' : ''}${offset}`;
    const modernColumn =
      offset >= 0 ? `price_d_plus_${Math.abs(offset)}` : `price_d_minus_${Math.abs(offset)}`;
    const priceValue = parseAmountValue(getRowValue(get, column, modernColumn));
    const key = buildPriceKey(offset);
    prices[key] = formatPriceLabel(priceValue);
  });

  return prices;
};

const parseDashboardUpcomingRow = (row) => {
  const get = createRowAccessor(row);
  const ticker = normaliseString(getRowValue(get, 'Ticker')).toUpperCase();
  if (!ticker) {
    return null;
  }
  const amountLabel = normaliseString(getRowValue(get, 'dividend amount')) || null;
  const yieldLabel = normaliseString(getRowValue(get, 'dividend yield')) || null;
  const payDate = normaliseString(getRowValue(get, 'dividend payment date')) || null;
  const exDate = normaliseString(getRowValue(get, 'Upcoming Dividend Ex Date')) || null;

  return {
    ticker,
    companyName: normaliseString(getRowValue(get, 'Company Name')) || '',
    exDate: exDate || null,
    payDate,
    amountLabel,
    amountValue: parseAmountValue(amountLabel),
    yieldLabel,
    yieldValue: parsePercentageValue(yieldLabel),
  };
};

const parseYahooUpcomingRow = (row, fallbackCompanyName, ticker) => {
  const get = createRowAccessor(row);
  const exDate = normaliseString(getRowValue(get, 'Upcoming Ex-Date')) || null;
  if (!exDate) {
    return null;
  }
  const amountLabel = normaliseString(getRowValue(get, 'Upcoming Dividend Amount')) || null;
  const yieldLabel = normaliseString(getRowValue(get, 'Upcoming Dividend Yield')) || null;
  const payDate = normaliseString(getRowValue(get, 'Upcoming Dividend Pay Date')) || null;

  return {
    ticker,
    companyName: normaliseString(getRowValue(get, 'Company Name')) || fallbackCompanyName || '',
    exDate,
    payDate,
    amountLabel,
    amountValue: parseAmountValue(amountLabel),
    yieldLabel,
    yieldValue: parsePercentageValue(yieldLabel),
  };
};

const mergeUpcomingEntries = (primary, secondary) => {
  if (!primary) return secondary || null;
  if (!secondary) return primary || null;
  return {
    ticker: (primary.ticker || secondary.ticker || '').toUpperCase(),
    companyName: primary.companyName || secondary.companyName || '',
    exDate: primary.exDate || secondary.exDate || null,
    payDate: primary.payDate || secondary.payDate || null,
    amountLabel: primary.amountLabel || secondary.amountLabel || null,
    amountValue:
      Number.isFinite(primary.amountValue) && primary.amountValue !== null
        ? primary.amountValue
        : Number.isFinite(secondary.amountValue)
          ? secondary.amountValue
          : null,
    yieldLabel: primary.yieldLabel || secondary.yieldLabel || null,
    yieldValue:
      Number.isFinite(primary.yieldValue) && primary.yieldValue !== null
        ? primary.yieldValue
        : Number.isFinite(secondary.yieldValue)
          ? secondary.yieldValue
          : null,
  };
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

const extractPriceValues = (priceMap) => {
  if (!priceMap) {
    return [];
  }
  const values = [];
  const seenKeys = new Set();

  OFFSETS.forEach((offset) => {
    const key = buildPriceKey(offset);
    if (seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    const price = parsePrice(priceMap[key]);
    if (price !== null) {
      values.push(price);
    }
  });

  if (!seenKeys.has('D0')) {
    const price = parsePrice(priceMap.D0);
    if (price !== null) {
      values.push(price);
    }
  }

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

const filterByDateRange = (items, startDate, endDate) => {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (!start && !end) {
    return items;
  }

  return items.filter((item) => {
    const rowDate = new Date(item.exDate);
    if (Number.isNaN(rowDate.getTime())) return false;
    if (start && rowDate < start) return false;
    if (end && rowDate > end) return false;
    return true;
  });
};

export async function fetchSGXDividendData({ ticker, startDate, endDate }) {
  const normalisedTicker = normaliseInputTicker(ticker);
  if (!normalisedTicker) {
    throw new Error('A valid ticker symbol is required to fetch data.');
  }

  const snapshot = await loadSnapshot();
  let tickerEntry = snapshot.tickerMap.get(normalisedTicker);
  let fallbackCompanyName = '';

  if (!tickerEntry || !Array.isArray(tickerEntry.events) || !tickerEntry.events.length) {
    const fallback = await loadTickerEventsFromCsv(normalisedTicker);
    fallbackCompanyName = fallback.companyName || '';
    tickerEntry = {
      ticker: normalisedTicker,
      companyName: fallbackCompanyName,
      events: fallback.events,
    };
  }

  if (!tickerEntry || !Array.isArray(tickerEntry.events) || !tickerEntry.events.length) {
    throw new Error('No records found for the requested ticker in the offline dataset.');
  }

  const filteredEvents = filterByDateRange(tickerEntry.events || [], startDate, endDate);

  if (!filteredEvents.length) {
    return [];
  }

  const companyName = tickerEntry.companyName || fallbackCompanyName || null;

  return filteredEvents.map((event) => ({
    id: `${normalisedTicker}-${event.exDate}`,
    exDate: event.exDate,
    dividendPerShare: Number.isFinite(event.dividendAmount) ? event.dividendAmount : 0,
    prices: event.prices || {},
    companyName,
  }));
}

export async function fetchPortfolioSummary() {
  const snapshot = await loadSnapshot();

  const summaries = snapshot.tickers.map((entry) => {
    const events = entry.events || [];
    let dividendSum = 0;
    let dividendCount = 0;
    let yieldSum = 0;
    let yieldCount = 0;
    let volatilitySum = 0;
    let volatilityCount = 0;
    let latestExDate = null;

    events.forEach((event) => {
      if (Number.isFinite(event.dividendAmount)) {
        dividendSum += event.dividendAmount;
        dividendCount += 1;
      }

      if (
        Number.isFinite(event.dividendAmount) &&
        Number.isFinite(event.exDatePrice) &&
        event.exDatePrice > 0
      ) {
        yieldSum += (event.dividendAmount / event.exDatePrice) * 100;
        yieldCount += 1;
      }

      const priceValues = extractPriceValues(event.prices);
      const eventVolatility = calculateVolatility(priceValues);
      if (eventVolatility !== null) {
        volatilitySum += eventVolatility;
        volatilityCount += 1;
      }

      if (event.exDate) {
        const eventDate = new Date(event.exDate);
        if (!Number.isNaN(eventDate.getTime())) {
          if (!latestExDate || eventDate > new Date(latestExDate)) {
            latestExDate = event.exDate;
          }
        }
      }
    });

    return {
      ticker: entry.ticker,
      companyName: entry.companyName,
      events: events.length,
      averageDividend: dividendCount ? dividendSum / dividendCount : null,
      averageYield: yieldCount ? yieldSum / yieldCount : null,
      averageVolatility: volatilityCount ? volatilitySum / volatilityCount : null,
      latestExDate,
      marketCap: null,
      marketCapDisplay: '',
    };
  });

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

const buildTickerCatalogueFromSnapshot = (entries) => {
  const seen = new Map();

  entries.forEach((entry) => {
    const baseTicker = (entry?.ticker || '').trim().toUpperCase();
    if (!baseTicker) {
      return;
    }
    const canonical = normaliseInputTicker(baseTicker);
    if (!canonical) {
      return;
    }
    const variants = buildTickerVariantSet(baseTicker);
    if (!variants.size) {
      return;
    }

    if (!seen.has(canonical)) {
      seen.set(canonical, {
        ticker: canonical,
        displayTicker: baseTicker.includes('.') ? baseTicker : `${canonical}.SI`,
        companyName: entry?.companyName || '',
        variants: new Set(variants),
        marketCap: Number.isFinite(entry?.marketCap) ? entry.marketCap : null,
        marketCapDisplay: entry?.marketCapDisplay || '',
      });
      return;
    }

    const existing = seen.get(canonical);

    variants.forEach((variant) => existing.variants.add(variant));

    if (entry?.companyName && !existing.companyName) {
      existing.companyName = entry.companyName;
    }

    if (
      Number.isFinite(entry?.marketCap) &&
      (!Number.isFinite(existing.marketCap) || entry.marketCap > existing.marketCap)
    ) {
      existing.marketCap = entry.marketCap;
      existing.marketCapDisplay = entry?.marketCapDisplay || existing.marketCapDisplay;
    }
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
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
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

  try {
    const snapshot = await loadSnapshot({ forceRefresh });
    tickerCatalogueCache = buildTickerCatalogueFromSnapshot(snapshot.tickers || []);
    writeStoredTickerCatalogue(tickerCatalogueCache);
    return tickerCatalogueCache.slice();
  } catch (error) {
    console.warn('Unable to load snapshot for ticker catalogue.', error);
    const stored = readStoredTickerCatalogue();
    if (stored?.catalogue?.length) {
      tickerCatalogueCache = stored.catalogue;
      return tickerCatalogueCache.slice();
    }
    tickerCatalogueCache = [];
    return [];
  }
}

export async function fetchDividendEventFrequency() {
  const snapshot = await loadSnapshot();
  return buildLatestYearEventRows(snapshot);
}

export async function fetchUpcomingDividends({ lookaheadDays = 60 } = {}) {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + lookaheadDays);

  let prevYearCounts = new Map();
  try {
    const snapshot = await loadSnapshot();
    prevYearCounts = computeLatestYearCounts(snapshot);
  } catch (error) {
    console.warn('Unable to load snapshot for previous-year counts.', error);
  }

  const applyPrevYearCounts = (entries) =>
    entries.map((entry) => ({
      ...entry,
      prevYearEventCount: prevYearCounts.get((entry.ticker || '').toUpperCase()) ?? 0,
    }));

  const filterAndSort = (rows) => {
    const filtered = rows
      .filter((entry) => {
        const date = new Date(entry.exDate);
        if (Number.isNaN(date.getTime())) return false;
        if (date < today || date > horizon) return false;
        return true;
      })
      .map((entry) => ({
        ticker: entry.ticker,
        companyName: entry.companyName || '',
        exDate: entry.exDate,
        dividendAmount: entry.dividendAmount,
        dividendAmountLabel: entry.dividendAmountLabel,
        dividendPayDate: entry.dividendPayDate || null,
        yieldPercentage: entry.yieldPercentage,
        yieldLabel: entry.yieldLabel,
      }));

    const seen = new Set();
    const deduped = filtered.filter((entry) => {
      const key = `${entry.ticker}-${entry.exDate}-${entry.dividendAmountLabel || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return applyPrevYearCounts(
      deduped.sort((a, b) => itemDateCompare(new Date(a.exDate), new Date(b.exDate)))
    );
  };

  // Load fallback JSON first to guarantee tiles render even if live scrape fails
  const fallback = await loadFallbackUpcomingJson();
  if (fallback.length) {
    const processed = fallback.map((entry) => ({
      ...entry,
      exDate: entry.exDate || entry.nextDividend || entry.dividendPayDate || '',
    }));
    const result = filterAndSort(processed);
    if (result.length) {
      return result;
    }
    // No entries within lookahead, return entire fallback dataset
    return applyPrevYearCounts(
      processed.map((entry) => ({
        ticker: entry.ticker,
        companyName: entry.companyName || '',
        exDate: entry.exDate,
        dividendAmount: entry.dividendAmount,
        dividendAmountLabel: entry.dividendAmountLabel,
        dividendPayDate: entry.dividendPayDate || null,
        yieldPercentage: entry.yieldPercentage,
        yieldLabel: entry.yieldLabel,
      }))
    );
  }

  try {
    const html = await fetchHtmlWithFallbacks([
      DIVIDENDS_SG_UPCOMING_URL,
      buildProxyUrl(DIVIDENDS_SG_UPCOMING_URL),
      'https://r.jina.ai/http://www.dividends.sg/dividend/coming',
    ]);
    const parsed = parseDividendsSgUpcoming(html);
    const result = filterAndSort(parsed);
    if (result.length) {
      return result;
    }
  } catch (error) {
    console.warn('Failed to scrape dividends.sg upcoming data:', error);
  }

  // If everything fails, return any fallback rows without date filtering
  if (fallback.length) {
    return applyPrevYearCounts(
      fallback.map((entry) => ({
        ticker: entry.ticker,
        companyName: entry.companyName || '',
        exDate: entry.exDate || entry.nextDividend || '',
        dividendAmount: entry.dividendAmount,
        dividendAmountLabel: entry.dividendAmountLabel || entry.amount || null,
        dividendPayDate: entry.dividendPayDate || null,
        yieldPercentage: entry.yieldPercentage,
        yieldLabel: entry.yieldLabel || entry.yield,
      }))
    );
  }

  throw new Error('Unable to load upcoming dividends');
}

export const fetchDashboardTickers = fetchTickerCatalogue;

export async function fetchLatestDividendSnapshot(ticker) {
  const snapshot = await loadSnapshot();
  const normalisedTicker = normaliseInputTicker(ticker);
  if (!normalisedTicker) {
    throw new Error('Please provide a valid ticker symbol.');
  }

  const tickerEntry = snapshot.tickerMap.get(normalisedTicker);
  if (!tickerEntry) {
    throw new Error('The selected ticker does not have dividend records in the offline dataset.');
  }

  const events = tickerEntry.events || [];
  if (!events.length) {
    throw new Error('No dividend history is available for the selected ticker.');
  }

  const latestEvent = events.reduce((latest, current) => {
    const latestDate = latest ? new Date(latest.exDate) : null;
    const currentDate = current ? new Date(current.exDate) : null;
    if (!latestDate || Number.isNaN(latestDate.getTime())) {
      return current;
    }
    if (!currentDate || Number.isNaN(currentDate.getTime())) {
      return latest;
    }
    return currentDate > latestDate ? current : latest;
  }, events[0]);

  if (!latestEvent) {
    throw new Error('No dividend history is available for the selected ticker.');
  }

  const amountValue = Number.isFinite(latestEvent.dividendAmount) ? latestEvent.dividendAmount : null;
  const priceValue = Number.isFinite(latestEvent.exDatePrice) ? latestEvent.exDatePrice : null;

  return {
    ticker: normalisedTicker,
    companyName: tickerEntry.companyName || '',
    lastExDate: latestEvent.exDate,
    dividendAmount: amountValue !== null ? amountValue : null,
    dividendAmountLabel:
      amountValue !== null
        ? amountValue.toFixed(4)
        : (latestEvent.dividendAmountLabel !== undefined ? String(latestEvent.dividendAmountLabel).trim() : ''),
    exDatePrice: priceValue !== null ? priceValue : null,
    exDatePriceLabel:
      priceValue !== null
        ? priceValue.toFixed(4)
        : (latestEvent.exDatePriceLabel !== undefined ? String(latestEvent.exDatePriceLabel).trim() : ''),
  };
}

async function loadCsvRows(url) {
  if (url === YAHOO_JSON_URL && Array.isArray(yahooRowsCache)) {
    return yahooRowsCache;
  }

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load data from ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let rows = [];

  if (contentType.includes('application/json') || url.endsWith('.json')) {
    const jsonData = await response.json();
    rows = Array.isArray(jsonData) ? jsonData : [];
  } else {
    const text = await response.text();
    if (!text || !text.trim()) {
      return [];
    }
    rows = csvParse(text);
  }

  if (url === YAHOO_JSON_URL) {
    yahooRowsCache = rows;
  }
  return rows;
}

async function buildSnapshotFromCsv() {
  const [yahooRows, dashboardRows] = await Promise.all([
    loadCsvRows(YAHOO_JSON_URL),
    loadCsvRows(DASHBOARD_CSV_URL).catch((error) => {
      console.warn('Unable to load dashboard CSV data. Continuing without dashboard enrichment.', error);
      return [];
    }),
  ]);

  if (!Array.isArray(yahooRows) || yahooRows.length === 0) {
    throw new Error('Yahoo dividend dataset is empty.');
  }

  const dashboardUpcomingLookup = new Map();
  dashboardRows.forEach((row) => {
    const upcoming = parseDashboardUpcomingRow(row);
    if (upcoming) {
      dashboardUpcomingLookup.set(upcoming.ticker, upcoming);
    }
  });

  const tickerEntries = new Map();

  yahooRows.forEach((row) => {
    const get = createRowAccessor(row);
    const ticker = normaliseString(getRowValue(get, 'Ticker')).toUpperCase();
    if (!ticker) {
      return;
    }

    const companyName = normaliseString(getRowValue(get, 'Company Name'));
    const existing =
      tickerEntries.get(ticker) ||
      {
        ticker,
        companyName: companyName || '',
        events: [],
        upcoming: null,
      };

    if (!existing.companyName && companyName) {
      existing.companyName = companyName;
    }

    const exDate = normaliseString(getRowValue(get, 'Ex-Dividend Date', 'ex_dividend_date'));
    if (exDate) {
      const dividendAmount = parseAmountValue(getRowValue(get, 'Dividend Amount', 'dividend_amount'));
      const rawDividendLabel =
        normaliseString(getRowValue(get, 'Dividend Amount', 'dividend_amount')) || null;
      const exDatePrice = parseAmountValue(getRowValue(get, 'Ex-Date Price', 'ex_dividend_price'));
      const rawExPriceLabel =
        normaliseString(getRowValue(get, 'Ex-Date Price', 'ex_dividend_price')) || null;

      existing.events.push({
        exDate,
        dividendAmount: Number.isFinite(dividendAmount) ? dividendAmount : null,
        dividendAmountLabel: Number.isFinite(dividendAmount)
          ? dividendAmount.toFixed(4)
          : rawDividendLabel,
        exDatePrice: Number.isFinite(exDatePrice) ? exDatePrice : null,
        exDatePriceLabel: formatPriceLabel(exDatePrice) || rawExPriceLabel,
        prices: buildPriceMapFromRow(row),
      });
    }

    const upcomingFromRow = parseYahooUpcomingRow(row, existing.companyName, ticker);
    if (upcomingFromRow) {
      existing.upcoming = mergeUpcomingEntries(upcomingFromRow, existing.upcoming);
    }

    if (!tickerEntries.has(ticker)) {
      tickerEntries.set(ticker, existing);
    }
  });

  dashboardUpcomingLookup.forEach((upcoming, ticker) => {
    const entry = tickerEntries.get(ticker);
    if (!entry) {
      tickerEntries.set(ticker, {
        ticker,
        companyName: upcoming.companyName || '',
        events: [],
        upcoming,
      });
      return;
    }
    entry.upcoming = mergeUpcomingEntries(upcoming, entry.upcoming);
    if (!entry.companyName && upcoming.companyName) {
      entry.companyName = upcoming.companyName;
    }
  });

  const tickers = Array.from(tickerEntries.values()).map((entry) => {
    const events = Array.isArray(entry.events) ? entry.events.slice() : [];
    events.sort((a, b) => {
      const aDate = new Date(a.exDate);
      const bDate = new Date(b.exDate);
      if (Number.isNaN(aDate.getTime()) || Number.isNaN(bDate.getTime())) {
        return String(a.exDate || '').localeCompare(String(b.exDate || ''));
      }
      return aDate.getTime() - bDate.getTime();
    });
    return {
      ticker: entry.ticker,
      companyName: entry.companyName || '',
      events,
      upcoming: entry.upcoming || null,
    };
  });

  tickers.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    tickers,
  };
}

async function loadTickerEventsFromCsv(ticker) {
  const rows = await loadCsvRows(YAHOO_JSON_URL);
  const canonicalTicker = normaliseInputTicker(ticker);
  const events = [];
  let companyName = '';

  rows.forEach((row) => {
    const get = createRowAccessor(row);
    const rowTicker = normaliseString(getRowValue(get, 'Ticker', 'ticker')).toUpperCase();
    if (!rowTicker || rowTicker !== canonicalTicker) {
      return;
    }

    if (!companyName) {
      companyName = normaliseString(getRowValue(get, 'Company Name', 'company_name')) || '';
    }

    const exDate = normaliseString(getRowValue(get, 'Ex-Dividend Date', 'ex_dividend_date'));
    if (!exDate) {
      return;
    }

    const dividendAmount = parseAmountValue(getRowValue(get, 'Dividend Amount', 'dividend_amount'));
    const dividendAmountLabel =
      Number.isFinite(dividendAmount) && dividendAmount !== null
        ? dividendAmount.toFixed(4)
        : normaliseString(getRowValue(get, 'Dividend Amount', 'dividend_amount')) || null;
    const exDatePrice = parseAmountValue(getRowValue(get, 'Ex-Date Price', 'ex_dividend_price'));
    const exDatePriceLabel =
      Number.isFinite(exDatePrice) && exDatePrice !== null
        ? exDatePrice.toFixed(4)
        : normaliseString(getRowValue(get, 'Ex-Date Price', 'ex_dividend_price')) || null;

    events.push({
      exDate,
      dividendAmount: Number.isFinite(dividendAmount) ? dividendAmount : null,
      dividendAmountLabel,
      exDatePrice: Number.isFinite(exDatePrice) ? exDatePrice : null,
      exDatePriceLabel,
      prices: buildPriceMapFromRow(row),
    });
  });

  events.sort((a, b) => {
    const aDate = new Date(a.exDate);
    const bDate = new Date(b.exDate);
    if (Number.isNaN(aDate.getTime()) || Number.isNaN(bDate.getTime())) {
      return String(a.exDate || '').localeCompare(String(b.exDate || ''));
    }
    return aDate.getTime() - bDate.getTime();
  });

  return {
    ticker: canonicalTicker,
    companyName,
    events,
  };
}
