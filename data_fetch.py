"""Fetch company names from Yahoo Finance and write them to a CSV file."""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib import error, parse, request

from scripts.build_snapshot import OUTPUT_JSON_PATH, build_snapshot


OVERRIDE_UPCOMING_INFO: Dict[str, Dict[str, str]] = {
    "1F2": {"date": "2025-10-14", "yield": "1.23%", "amount": "SGD 0.005"},
    "1F2.SI": {"date": "2025-10-14", "yield": "1.23%", "amount": "SGD 0.005"},
    "BBW": {"date": "2025-10-14", "yield": "4.31%", "amount": "HKD 3.900"},
    "BBW.SI": {"date": "2025-10-14", "yield": "4.31%", "amount": "HKD 3.900"},
    "EH5": {"date": "2025-10-15", "yield": "0.78%", "amount": "AUD 0.005"},
    "EH5.SI": {"date": "2025-10-15", "yield": "0.78%", "amount": "AUD 0.005"},
    "5WG": {"date": "2025-10-15", "yield": "4.24%", "amount": "SGD 0.003"},
    "5WG.SI": {"date": "2025-10-15", "yield": "4.24%", "amount": "SGD 0.003"},
    "K71U": {"date": "2025-10-15", "yield": "0.82%", "amount": "SGD 0.008"},
    "K71U.SI": {"date": "2025-10-15", "yield": "0.82%", "amount": "SGD 0.008"},
    "S68": {"date": "2025-10-16", "yield": "0.60%", "amount": "SGD 0.105"},
    "S68.SI": {"date": "2025-10-16", "yield": "0.60%", "amount": "SGD 0.105"},
    "D07": {"date": "2025-10-16", "yield": "0.00%", "amount": "0.000"},
    "D07.SI": {"date": "2025-10-16", "yield": "0.00%", "amount": "0.000"},
    "BEC": {"date": "2025-10-22", "payDate": "2025-11-14", "yield": "1.41%", "amount": "SGD 0.060"},
    "BEC.SI": {"date": "2025-10-22", "payDate": "2025-11-14", "yield": "1.41%", "amount": "SGD 0.060"},
    "NEX": {"date": "2025-10-22", "payDate": "2025-10-30", "yield": "1.24%", "amount": "SGD 0.005"},
    "NEX.SI": {"date": "2025-10-22", "payDate": "2025-10-30", "yield": "1.24%", "amount": "SGD 0.005"},
    "CHJ": {"date": "2025-10-23", "payDate": "2025-11-07", "yield": "1.18%", "amount": "SGD 0.010"},
    "CHJ.SI": {"date": "2025-10-23", "payDate": "2025-11-07", "yield": "1.18%", "amount": "SGD 0.010"},
    "T12": {"date": "2025-10-30", "payDate": "2025-11-12", "yield": "1.16%", "amount": "SGD 0.010"},
    "T12.SI": {"date": "2025-10-30", "payDate": "2025-11-12", "yield": "1.16%", "amount": "SGD 0.010"},
    "W05": {"date": "2025-10-30", "payDate": "2025-11-17", "yield": "2.08%", "amount": "SGD 0.030"},
    "W05.SI": {"date": "2025-10-30", "payDate": "2025-11-17", "yield": "2.08%", "amount": "SGD 0.030"},
    "LCC": {"date": "2025-10-30", "payDate": "2025-11-14", "yield": "4.23%", "amount": "SGD 0.022"},
    "LCC.SI": {"date": "2025-10-30", "payDate": "2025-11-14", "yield": "4.23%", "amount": "SGD 0.022"},
    "MIJ": {"date": "2025-10-31", "payDate": "2025-11-14", "yield": "0.77%", "amount": "SGD 0.001"},
    "MIJ.SI": {"date": "2025-10-31", "payDate": "2025-11-14", "yield": "0.77%", "amount": "SGD 0.001"},
    "1B1": {"date": "2025-10-31", "payDate": "2025-11-13", "yield": "3.33%", "amount": "SGD 0.012"},
    "1B1.SI": {"date": "2025-10-31", "payDate": "2025-11-13", "yield": "3.33%", "amount": "SGD 0.012"},
    "C33": {"date": "2025-10-31", "payDate": "2025-11-13", "yield": "3.26%", "amount": "SGD 0.007"},
    "C33.SI": {"date": "2025-10-31", "payDate": "2025-11-13", "yield": "3.26%", "amount": "SGD 0.007"},
    "O08": {"date": "2025-10-31", "yield": "4.10%", "amount": "SGD 0.007"},
    "O08.SI": {"date": "2025-10-31", "yield": "4.10%", "amount": "SGD 0.007"},
    "F17": {"date": "2025-11-04", "yield": "3.42%", "amount": "SGD 0.070"},
    "F17.SI": {"date": "2025-11-04", "yield": "3.42%", "amount": "SGD 0.070"},
    "K29": {"date": "2025-11-04", "yield": "2.36%", "amount": "HKD 0.039"},
    "K29.SI": {"date": "2025-11-04", "yield": "2.36%", "amount": "HKD 0.039"},
    "BQM": {"date": "2025-11-04", "yield": "2.22%", "amount": "SGD 0.018"},
    "BQM.SI": {"date": "2025-11-04", "yield": "2.22%", "amount": "SGD 0.018"},
    "564": {"date": "2025-11-05", "yield": "1.41%", "amount": "SGD 0.020"},
    "564.SI": {"date": "2025-11-05", "yield": "1.41%", "amount": "SGD 0.020"},
    "5WF": {"date": "2025-11-05", "yield": "0.98%", "amount": "SGD 0.001"},
    "5WF.SI": {"date": "2025-11-05", "yield": "0.98%", "amount": "SGD 0.001"},
    "L19": {"date": "2025-11-05", "yield": "2.17%", "amount": "SGD 0.010"},
    "L19.SI": {"date": "2025-11-05", "yield": "2.17%", "amount": "SGD 0.010"},
    "DM0": {"date": "2025-11-06", "yield": "0.51%", "amount": "SGD 0.002"},
    "DM0.SI": {"date": "2025-11-06", "yield": "0.51%", "amount": "SGD 0.002"},
    "1R6": {"date": "2025-11-06", "yield": "1.22%", "amount": "SGD 0.003"},
    "1R6.SI": {"date": "2025-11-06", "yield": "1.22%", "amount": "SGD 0.003"},
    "5DD": {"date": "2025-11-06", "yield": "1.69%", "amount": "SGD 0.030"},
    "5DD.SI": {"date": "2025-11-06", "yield": "1.69%", "amount": "SGD 0.030"},
    "UUK": {"date": "2025-11-06", "yield": "2.61%", "amount": "SGD 0.002"},
    "UUK.SI": {"date": "2025-11-06", "yield": "2.61%", "amount": "SGD 0.002"},
    "G50": {"date": "2025-11-06", "yield": "1.46%", "amount": "SGD 0.010"},
    "G50.SI": {"date": "2025-11-06", "yield": "1.46%", "amount": "SGD 0.010"},
    "A04": {"date": "2025-11-14", "yield": "0.93%", "amount": "SGD 0.002"},
    "A04.SI": {"date": "2025-11-14", "yield": "0.93%", "amount": "SGD 0.002"},
    "500": {"date": "2025-11-20", "yield": "2.54%", "amount": "SGD 0.016"},
    "500.SI": {"date": "2025-11-20", "yield": "2.54%", "amount": "SGD 0.016"},
    "BVA": {"date": "2025-11-24", "yield": "0.69%", "amount": "MYR 0.005"},
    "BVA.SI": {"date": "2025-11-24", "yield": "0.69%", "amount": "MYR 0.005"},
    "S71": {"date": "2025-11-25", "yield": "0.89%", "amount": "SGD 0.002"},
    "S71.SI": {"date": "2025-11-25", "yield": "0.89%", "amount": "SGD 0.002"},
    "K03": {"date": "2025-12-03", "yield": "1.16%", "amount": "SGD 0.010"},
    "K03.SI": {"date": "2025-12-03", "yield": "1.16%", "amount": "SGD 0.010"},
    "S3N": {"date": "2025-12-11", "yield": "1.48%", "amount": "SGD 0.001"},
    "S3N.SI": {"date": "2025-12-11", "yield": "1.48%", "amount": "SGD 0.001"},
}

# --- Configuration -----------------------------------------------------
TICKERS: Tuple[str, ...] = (
    "D05",
    "O39",
    "Z74",
    "U11",
    "S63",
    "J36",
    "C6L",
    "S68",
    "F34",
    "H78",
    "BN4",
    "9CI",
    "BS6",
    "Y92",
    "U96",
    "C07",
    "G13",
    "5E2",
    "G07",
    "U14",
    "C09",
    "D01",
    "S58",
    "U06",
    "V03",
    "TQ5",
    "YF8",
    "S59",
    "M04",
    "E5H",
    "LCC",
    "1B1",
    "C33",
    "O08",
    "C52",
    "F17",
    "BEC",
    "NEX",
    "CHJ",
    "T12",
    "W05",
    "MIJ",
)
OUTPUT_PATH = Path(__file__).resolve().parent / "public" / "yahoo_stock_data.csv"
DASHBOARD_PATH = Path(__file__).resolve().parent / "public" / "dashboard_data.csv"
YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
TIMEOUT_SECONDS = 15
USER_AGENT = "Mozilla/5.0 (compatible; CodexBot/1.0; +https://openai.com)"
DIVIDEND_START = datetime(2020, 1, 1, tzinfo=timezone.utc)
DIVIDEND_END = datetime(2025, 12, 31, tzinfo=timezone.utc)
BACKWARD_OFFSETS: Tuple[int, ...] = tuple(range(1, 11))
FORWARD_OFFSETS: Tuple[int, ...] = tuple(range(1, 31))
# ----------------------------------------------------------------------


@dataclass(frozen=True)
class TickerInfo:
    ticker: str
    company_name: Optional[str]
    yahoo_symbol: Optional[str]


@dataclass(frozen=True)
class DividendEvent:
    ex_date: str
    amount: float
    prices: Dict[int, Optional[float]]
    pay_date: Optional[str] = None


def build_symbol_candidates(ticker: str) -> Tuple[str, ...]:
    """Return possible Yahoo Finance symbol variants for a SGX ticker."""
    base = ticker.strip().upper()
    if not base:
        return ()
    # Yahoo commonly stores SGX listings with a .SI suffix.
    if base.endswith(".SI"):
        return (base,)
    return (f"{base}.SI", base)


def fetch_company_name(symbol: str, candidates: Tuple[str, ...]) -> Tuple[Optional[str], Optional[str]]:
    """Fetch the company name for a Yahoo Finance symbol using the search endpoint."""
    query = parse.urlencode({"q": symbol})
    url = f"{YAHOO_SEARCH_URL}?{query}"
    req = request.Request(url, headers={"User-Agent": USER_AGENT})
    with request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        payload = json.load(resp)

    quotes = payload.get("quotes", [])
    if not quotes:
        return None, None

    # First look for exact matches with our candidate symbols.
    for candidate in candidates:
        for entry in quotes:
            symbol_name = entry.get("symbol", "").upper()
            if symbol_name != candidate:
                continue
            company = entry.get("longname") or entry.get("shortname")
            if company:
                return company, symbol_name

    # Fallback: pick the first quote whose symbol starts with the base ticker.
    base = symbol.upper()
    for entry in quotes:
        symbol_name = entry.get("symbol", "").upper()
        if symbol_name.startswith(base):
            company = entry.get("longname") or entry.get("shortname")
            if company:
                return company, symbol_name

    return None, None


def _build_price_map(result: Dict) -> Dict[str, float]:
    timestamps = result.get("timestamp", [])
    indicators = result.get("indicators", {})
    adjclose_series = indicators.get("adjclose", [])
    close_series = indicators.get("close", [])

    values: List[Optional[float]] = []
    if adjclose_series:
        values = adjclose_series[0].get("adjclose", [])
    elif close_series:
        values = close_series[0].get("close", [])

    price_map: Dict[str, float] = {}
    for ts, price in zip(timestamps, values):
        if price is None:
            continue
        try:
            date_key = datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d")
        except (TypeError, ValueError, OSError):
            continue
        try:
            price_map[date_key] = float(price)
        except (TypeError, ValueError):
            continue
    return price_map


def _price_on_or_before(price_map: Dict[str, float], date_obj: datetime, max_lookback: int = 7) -> Optional[float]:
    current = date_obj
    for _ in range(max_lookback + 1):
        key = current.strftime("%Y-%m-%d")
        price = price_map.get(key)
        if price is not None:
            return price
        current -= timedelta(days=1)
    return None


def _price_on_or_after(price_map: Dict[str, float], date_obj: datetime, max_lookahead: int = 7) -> Optional[float]:
    current = date_obj
    for _ in range(max_lookahead + 1):
        key = current.strftime("%Y-%m-%d")
        price = price_map.get(key)
        if price is not None:
            return price
        current += timedelta(days=1)
    return None


def _format_price(value: Optional[float]) -> str:
    return f"{value:.4f}" if value is not None else ""


def _normalise_pay_date(value: Optional[object]) -> Optional[str]:
    if value in (None, "", "null"):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(int(value), tz=timezone.utc).strftime("%Y-%m-%d")
        except (ValueError, OSError, TypeError):
            return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "")).date().strftime("%Y-%m-%d")
        except ValueError:
            return None
    return None


def _parse_percentage_label(label: Optional[str]) -> Optional[float]:
    if label is None:
        return None
    if isinstance(label, (int, float)):
        return float(label)
    cleaned = str(label).replace("%", "").replace("−", "-").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_amount_label(label: Optional[str]) -> Optional[float]:
    if label is None:
        return None
    if isinstance(label, (int, float)):
        return float(label)
    cleaned = str(label).replace(",", "").strip()
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _get_override_upcoming(symbol: Optional[str], ticker: str) -> Optional[Dict[str, str]]:
    candidates: List[str] = []
    if symbol:
        candidates.append(symbol)
        if symbol.endswith('.SI'):
            candidates.append(symbol[:-3])
    if ticker:
        candidates.append(ticker)
    for candidate in candidates:
        info = OVERRIDE_UPCOMING_INFO.get(candidate)
        if info:
            return info
    return None

def fetch_upcoming_ex_date(symbol: str) -> Optional[str]:
    endpoints = [
        f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=calendarEvents",
        f"https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}?modules=calendarEvents",
    ]
    for url in endpoints:
        try:
            req = request.Request(url, headers={"User-Agent": USER_AGENT})
            with request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
                payload = json.load(resp)
        except error.URLError:
            continue

        result = (payload.get("quoteSummary") or {}).get("result") or []
        if not result:
            continue

        events = result[0].get("calendarEvents") or {}
        for key in ("exDividendDate", "dividendDate"):
            value = events.get(key)
            if isinstance(value, dict):
                raw_timestamp = value.get("raw")
                if raw_timestamp:
                    try:
                        dt_obj = datetime.fromtimestamp(int(raw_timestamp), tz=timezone.utc)
                        return dt_obj.strftime("%Y-%m-%d")
                    except (ValueError, OSError, TypeError):
                        continue

        upcoming = events.get("upcomingEvents") or events.get("events")
        if isinstance(upcoming, dict):
            dividends = upcoming.get("dividends")
            if isinstance(dividends, list):
                for entry in dividends:
                    raw = entry.get("date") or entry.get("exDate")
                    if raw:
                        try:
                            dt_obj = datetime.fromtimestamp(int(raw), tz=timezone.utc)
                            return dt_obj.strftime("%Y-%m-%d")
                        except (ValueError, OSError, TypeError):
                            continue

    return None

def _compile_upcoming_info(symbol: Optional[str], ticker: str, dividends: List[DividendEvent]) -> Optional[Dict[str, Optional[str]]]:
    info: Dict[str, Optional[str]] = {}

    computed_date = _next_ex_date_from_events(dividends)
    upcoming_event: Optional[DividendEvent] = None

    if computed_date:
        info['date'] = computed_date
        upcoming_event = next((event for event in dividends if event.ex_date == computed_date), None)
    elif dividends:
        upcoming_event = dividends[0]
        info['date'] = upcoming_event.ex_date

    if upcoming_event:
        if upcoming_event.pay_date:
            info['payDate'] = upcoming_event.pay_date
        info['amountValue'] = upcoming_event.amount
        info['amountLabel'] = f"{upcoming_event.amount:.4f}"
        ex_price = upcoming_event.prices.get(0)
        if ex_price is not None and ex_price > 0:
            yield_value = (upcoming_event.amount / ex_price) * 100
            info['yieldValue'] = yield_value
            info['yieldLabel'] = f"{yield_value:.2f}%"

    override = _get_override_upcoming(symbol, ticker)
    if override:
        if not info.get('date') and override.get('date'):
            info['date'] = override['date']
        if not info.get('payDate') and override.get('payDate'):
            info['payDate'] = override['payDate']
        if override.get('yield'):
            info['yieldLabel'] = override['yield']
            parsed_yield = _parse_percentage_label(override.get('yield'))
            if parsed_yield is not None:
                info['yieldValue'] = parsed_yield
        if override.get('amount'):
            info['amountLabel'] = override['amount']
            parsed_amount = _parse_amount_label(override.get('amount'))
            if parsed_amount is not None:
                info['amountValue'] = parsed_amount

    if not info.get('date') and symbol:
        fetched_date = fetch_upcoming_ex_date(symbol)
        if fetched_date:
            info['date'] = fetched_date

    return info or None

def _next_ex_date_from_events(dividends: List[DividendEvent]) -> Optional[str]:
    today = datetime.now(tz=timezone.utc).date()
    upcoming_dates: List[datetime] = []
    all_dates: List[datetime] = []
    for event in dividends:
        try:
            ex_date_obj = datetime.strptime(event.ex_date, "%Y-%m-%d").date()
        except ValueError:
            continue
        all_dates.append(ex_date_obj)
        if ex_date_obj >= today:
            upcoming_dates.append(ex_date_obj)
    if upcoming_dates:
        return min(upcoming_dates).strftime("%Y-%m-%d")
    if all_dates:
        return max(all_dates).strftime("%Y-%m-%d")
    return None

def fetch_dividend_events(symbol: str) -> List[DividendEvent]:
    """Fetch dividend events for a Yahoo Finance symbol."""
    params = parse.urlencode({
        "range": "10y",
        "interval": "1d",
        "events": "div",
        "includeAdjustedClose": "true",
    })
    encoded_symbol = parse.quote(symbol)
    url = f"{YAHOO_CHART_URL.format(symbol=encoded_symbol)}?{params}"
    req = request.Request(url, headers={"User-Agent": USER_AGENT})

    with request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        payload = json.load(resp)

    results = payload.get("chart", {}).get("result", [])
    if not results:
        return []

    result = results[0]
    price_map = _build_price_map(result)

    events = result.get("events", {}).get("dividends", {})
    dividends: List[DividendEvent] = []
    for entry in events.values():
        amount = entry.get("amount")
        timestamp = entry.get("date") or entry.get("exDate")
        if amount is None or timestamp is None:
            continue
        try:
            amount_val = float(amount)
        except (TypeError, ValueError):
            continue
        try:
            ex_datetime = datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            continue
        if ex_datetime < DIVIDEND_START or ex_datetime > DIVIDEND_END:
            continue

        prices: Dict[int, Optional[float]] = {}
        prices[0] = _price_on_or_before(price_map, ex_datetime)

        for offset in BACKWARD_OFFSETS:
            target = ex_datetime - timedelta(days=offset)
            prices[-offset] = _price_on_or_before(price_map, target)

        for offset in FORWARD_OFFSETS:
            target = ex_datetime + timedelta(days=offset)
            prices[offset] = _price_on_or_after(price_map, target)

        pay_date = _normalise_pay_date(
            entry.get("paymentDate")
            or entry.get("payDate")
            or entry.get("payment_date")
            or entry.get("paymentdate")
        )

        dividends.append(
            DividendEvent(
                ex_date=ex_datetime.strftime("%Y-%m-%d"),
                amount=amount_val,
                prices=prices,
                pay_date=pay_date,
            )
        )

    return sorted(dividends, key=lambda item: item.ex_date, reverse=True)


def lookup_ticker(ticker: str) -> TickerInfo:
    """Return ticker info using Yahoo Finance search results."""
    base_ticker = ticker.strip().upper()
    candidates = build_symbol_candidates(base_ticker)
    for candidate in candidates:
        try:
            company_name, matched_symbol = fetch_company_name(candidate, candidates)
        except error.URLError as exc:
            print(f"Network error for {candidate}: {exc}")
            continue

        if company_name:
            return TickerInfo(ticker=base_ticker, company_name=company_name, yahoo_symbol=matched_symbol)

    print(f"Unable to resolve Yahoo Finance listing for {base_ticker}")
    return TickerInfo(ticker=base_ticker, company_name=None, yahoo_symbol=None)


def gather_ticker_data(tickers: Iterable[str]) -> List[TickerInfo]:
    """Collect ticker info for all supplied tickers."""
    results: List[TickerInfo] = []
    for ticker in tickers:
        info = lookup_ticker(ticker)
        results.append(info)
    return results


def write_csv(rows: Iterable[TickerInfo], output_path: Path = OUTPUT_PATH) -> List[Dict[str, Optional[str]]]:
    """Write ticker information and dividend events to a CSV."""
    dashboard_rows: Dict[str, Dict[str, Optional[str]]] = {}

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        backward_headers = [f"Price D-{offset}" for offset in reversed(BACKWARD_OFFSETS)]
        forward_headers = [f"Price D+{offset}" for offset in FORWARD_OFFSETS]
        header = [
            "Ticker",
            "Company Name",
            "Ex-Dividend Date",
            "Dividend Amount",
            "Upcoming Ex-Date",
            "Upcoming Dividend Pay Date",
            "Upcoming Dividend Yield",
            "Upcoming Dividend Amount",
            "Ex-Date Price",
            *backward_headers,
            *forward_headers,
        ]
        writer.writerow(header)
        upcoming_cache: Dict[str, Optional[Dict[str, Optional[str]]]] = {}

        for row in rows:
            symbol_key = row.yahoo_symbol or row.ticker
            dividends: List[DividendEvent] = []
            if row.yahoo_symbol:
                try:
                    dividends = fetch_dividend_events(row.yahoo_symbol)
                except error.URLError as exc:
                    print(f"Unable to retrieve dividends for {row.yahoo_symbol}: {exc}")

            info = upcoming_cache.get(symbol_key)
            if info is None:
                info = _compile_upcoming_info(row.yahoo_symbol, row.ticker, dividends)
                if info is None:
                    info = _get_override_upcoming(row.yahoo_symbol, row.ticker)
                if info is None and row.yahoo_symbol:
                    fetched = fetch_upcoming_ex_date(row.yahoo_symbol)
                    if fetched:
                        info = {"date": fetched}
                upcoming_cache[symbol_key] = info

            upcoming_date = info.get('date') if info else ''
            upcoming_pay_date = info.get('payDate') if info else ''
            upcoming_yield = info.get('yieldLabel') or info.get('yield') if info else ''
            if not upcoming_yield and info:
                value = info.get('yieldValue')
                if value is not None:
                    upcoming_yield = f"{float(value):.2f}%"
            upcoming_amount = info.get('amountLabel') or info.get('amount') if info else ''
            if not upcoming_amount and info:
                value = info.get('amountValue')
                if value is not None:
                    upcoming_amount = f"{float(value):.4f}"

            if not dividends:
                empty_row = [
                    row.ticker,
                    row.company_name or "",
                    "",
                    "",
                    upcoming_date,
                    upcoming_pay_date,
                    upcoming_yield,
                    upcoming_amount,
                    "",
                ]
                empty_row.extend([""] * (len(backward_headers) + len(forward_headers)))
                writer.writerow(empty_row)
            else:
                for event in dividends:
                    ex_price = _format_price(event.prices.get(0))
                    backward_values = [
                        _format_price(event.prices.get(-offset)) for offset in reversed(BACKWARD_OFFSETS)
                    ]
                    forward_values = [
                        _format_price(event.prices.get(offset)) for offset in FORWARD_OFFSETS
                    ]
                    pay_date = event.pay_date or upcoming_pay_date or ''
                    row_values = [
                        row.ticker,
                        row.company_name or "",
                        event.ex_date,
                        f"{event.amount:.4f}",
                        upcoming_date,
                        pay_date,
                        upcoming_yield,
                        upcoming_amount,
                        ex_price,
                        *backward_values,
                        *forward_values,
                    ]
                    writer.writerow(row_values)

            dashboard_rows[row.ticker.upper()] = {
                "ticker": row.ticker.upper(),
                "company": row.company_name or "",
                "exDate": upcoming_date,
                "payDate": upcoming_pay_date,
                "dividendAmount": upcoming_amount,
                "dividendYield": upcoming_yield,
            }

    print(f"Wrote Yahoo Finance data to {output_path}")
    return list(dashboard_rows.values())


def write_dashboard_csv(rows: Iterable[TickerInfo], output_path: Path = DASHBOARD_PATH) -> None:
    """Write unique ticker records for dashboard usage."""
    seen: Dict[str, str] = {}
    for row in rows:
        ticker = row.ticker.upper()
        if ticker not in seen:
            seen[ticker] = row.company_name or ""

    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Ticker", "Company Name"])
        for ticker, company_name in seen.items():
            writer.writerow([ticker, company_name])

    print(f"Wrote dashboard data to {output_path}")


def main() -> None:
    ticker_data = gather_ticker_data(TICKERS)
    write_csv(ticker_data)
    write_dashboard_csv(ticker_data)
    snapshot = build_snapshot()
    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON_PATH.open("w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, indent=2, sort_keys=False)
        handle.write("\n")
    print(f"Wrote consolidated snapshot to {OUTPUT_JSON_PATH}")


if __name__ == "__main__":
    main()
