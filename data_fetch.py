#!/usr/bin/env python3
"""
Scrape dividend history for SGX tickers from Yahoo Finance.

Yahoo lists Singapore Exchange symbols with a ``.SI`` suffix. This script accepts
plain tickers (e.g. ``D05``) and automatically targets the corresponding Yahoo symbol.

Usage:
    python data_fetch.py D05
    python data_fetch.py --file tickers.txt --output public/yahoo_stock_data.csv

If no tickers are provided, a curated SGX list is used by default.
"""

from __future__ import annotations

import argparse
import bisect
import csv
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import requests

# Minimal headers keep us under Yahoo's rate limits for the crumb endpoint.
USER_AGENT = "Mozilla/5.0"
REQUEST_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "*/*",
}
PRE_EVENT_DAYS = 10
POST_EVENT_DAYS = 30
DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parent / "public" / "yahoo_stock_data.csv"

TickerListEntry = Tuple[str, str]
DEFAULT_TICKERS: List[TickerListEntry] = [
    ("D05", "DBS Group Holdings"),
    ("O39", "Oversea-Chinese Banking Corp (OCBC)"),
    ("Z74", "Singapore Telecommunications (Singtel)"),
    ("U11", "United Overseas Bank (UOB)"),
    ("S63", "Singapore Technologies Engineering (ST Engg)"),
    ("C6L", "Singapore Airlines (SIA)"),
    ("F34", "Wilmar International"),
    ("C38U", "CapitaLand Integrated Commercial Trust (CICT)"),
    ("S68", "Singapore Exchange (SGX)"),
    ("BN4", "Keppel"),
    ("9CI", "CapitaLand Investment (CLI)"),
    ("A17U", "CapitaLand Ascendas REIT"),
    ("BS6", "Yangzijiang Shipbuilding"),
    ("Y92", "Thai Beverage"),
    ("C07", "Jardine Cycle & Carriage"),
    ("U96", "Sembcorp Industries"),
    ("G13", "Genting Singapore"),
    ("N2IU", "Mapletree Pan Asia Commercial Trust (MPACT)"),
    ("G07", "Great Eastern Holdings"),
    ("5E2", "Seatrium"),
    ("U14", "UOL Group"),
    ("M44U", "Mapletree Logistics Trust (MLT)"),
    ("C09", "City Developments (CDL)"),
    ("ME8U", "Mapletree Industrial Trust (MIT)"),
    ("D01", "DFI Retail Group Holdings Limited"),
    ("AJBU", "Keppel DC REIT"),
    ("S58", "SATS Ltd."),
    ("J69U", "Frasers Centrepoint Trust"),
    ("U06", "Singapore Land Group Limited"),
    ("V03", "Venture Corporation Limited"),
    ("TQ5", "Frasers Property Limited"),
    ("K71U", "Keppel REIT"),
    ("T82U", "Suntec REIT"),
    ("S59", "SIA Engineering Company Limited"),
    ("CJLU", "NetLink NBN Trust"),
    ("VC2", "Olam Group Limited"),
    ("BUOU", "Frasers Logistics & Commercial Trust"),
    ("YF8", "Yangzijiang Financial Holding Ltd."),
    ("HMN", "CapitaLand Ascott Trust"),
    ("E5H", "Golden Agri-Resources Ltd"),
    ("H02", "Haw Par Corporation Limited"),
    ("OV8", "Sheng Siong Group"),
    ("C52", "ComfortDelGro"),
    ("A7RU", "Keppel Infrastructure Trust (KIT)"),
    ("C2PU", "Parkway Life REIT (PLife REIT)"),
    ("AIY", "iFAST Corporation"),
    ("S07", "Shangri-La Asia"),
    ("EB5", "First Resources"),
    ("H15", "Hotel Properties (HPL)"),
    ("M04", "Mandarin Oriental International Limited"),
    ("EMI", "Emperador Inc."),
    ("T14", "Tianjin Pharmaceutical Da Ren Tang Group Corporation Limited"),
    ("BEC", "BRC Asia Limited"),
    ("NEX", "Reclaims Global Limited"),
    ("CHJ", "Uni-Asia Group Limited"),
    ("LCC", "Lum Chang Creations"),
    ("T12", "Tat Seng Packaging Ltd"),
    ("W05", "Wing Tai Holdings Limited"),
    ("1B1", "HC Surgical Specialists Limited"),
    ("C33", "Chuan Hup Holdings Limited"),
]
DEFAULT_TICKER_NAMES: Dict[str, str] = {symbol: name for symbol, name in DEFAULT_TICKERS}


class YahooFinanceError(RuntimeError):
    """Raised when Yahoo Finance returns an error for a ticker."""


@dataclass
class DividendRecord:
    ticker: str
    symbol: str
    company_name: str
    ex_dividend_date: str
    ex_dividend_price: str
    dividend_amount: str
    dividend_yield: str
    currency: str
    record_date: str
    payment_date: str
    declaration_date: str
    price_offsets: Dict[int, Optional[float]]

    def asdict(self) -> Dict[str, str]:
        data = {
            "ticker": self.ticker,
            "symbol": self.symbol,
            "company_name": self.company_name,
            "ex_dividend_date": self.ex_dividend_date,
            "ex_dividend_price": self.ex_dividend_price,
            "dividend_amount": self.dividend_amount,
            "dividend_yield": self.dividend_yield,
            "currency": self.currency,
            "record_date": self.record_date,
            "payment_date": self.payment_date,
            "declaration_date": self.declaration_date,
        }
        for offset in range(1, PRE_EVENT_DAYS + 1):
            data[f"price_d_minus_{offset}"] = _format_price(self.price_offsets.get(-offset))
        for offset in range(1, POST_EVENT_DAYS + 1):
            data[f"price_d_plus_{offset}"] = _format_price(self.price_offsets.get(offset))
        return data


class YahooFinanceDividendScraper:
    COOKIE_URL = "https://fc.yahoo.com"
    CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"
    CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    CUTOFF_TIMESTAMP = int(datetime(2020, 1, 1, tzinfo=timezone.utc).timestamp())

    def __init__(self, session: Optional[requests.Session] = None) -> None:
        self.session = session or requests.Session()
        self.crumb: Optional[str] = None

    def refresh_crumb(self) -> None:
        """Obtain authentication cookies and the crumb token."""
        logging.debug("Refreshing Yahoo Finance crumb token")
        response = self.session.get(self.COOKIE_URL, headers=REQUEST_HEADERS, timeout=10)
        if response.status_code >= 500:
            response.raise_for_status()

        for attempt in range(5):
            response = self.session.get(self.CRUMB_URL, headers=REQUEST_HEADERS, timeout=10)
            if response.status_code == 429:
                wait_time = 1.5 * (attempt + 1)
                logging.debug("Crumb request throttled; retrying in %.1f seconds", wait_time)
                time.sleep(wait_time)
                continue

            response.raise_for_status()
            crumb = response.text.strip()
            if not crumb:
                raise YahooFinanceError("Failed to retrieve crumb token from Yahoo Finance")
            self.crumb = crumb
            return

        raise YahooFinanceError("Unable to obtain crumb token after repeated 429 responses")

    def fetch_dividends(self, ticker: str) -> List[DividendRecord]:
        symbol = self._normalise_symbol(ticker)

        for attempt in range(6):
            params = {
                "range": "10y",
                "interval": "1d",
                "events": "div",
            }
            if self.crumb:
                params["crumb"] = self.crumb

            logging.debug("Fetching dividend history for %s (attempt %d)", symbol, attempt + 1)
            response = self.session.get(
                self.CHART_URL.format(symbol=symbol),
                headers=REQUEST_HEADERS,
                params=params,
                timeout=20,
            )

            if response.status_code == 429:
                wait_time = 1.5 * (attempt + 1)
                logging.debug("Rate limited on %s; sleeping %.1f seconds", symbol, wait_time)
                time.sleep(wait_time)
                continue

            payload = _safe_json(response)
            chart = payload.get("chart") if payload else None

            if not chart:
                response.raise_for_status()
                raise YahooFinanceError(f"No chart data returned for {symbol}")

            error = chart.get("error")
            if error:
                code = str(error.get("code", "")).lower()
                description = error.get("description", "")
                if "invalid crumb" in code or "unauthorized" in code:
                    self.refresh_crumb()
                    continue
                raise YahooFinanceError(f"Yahoo error for {symbol}: {code} - {description}")

            result = chart.get("result")
            if not result:
                logging.info("No dividend data available for %s", ticker)
                return []

            return self._extract_records(ticker, result[0])

        raise YahooFinanceError(f"Failed to download dividends for {ticker} after retries")

    def _extract_records(self, ticker: str, chart_payload: Dict) -> List[DividendRecord]:
        meta = chart_payload.get("meta", {}) or {}
        company_name = meta.get("longName") or meta.get("shortName") or ""
        display_symbol = meta.get("symbol") or self._normalise_symbol(ticker)
        currency = meta.get("currency") or ""
        timestamps, prices = _extract_price_series(chart_payload)

        dividends = (chart_payload.get("events") or {}).get("dividends") or {}
        if not dividends:
            logging.info("No dividend events found for %s", ticker)
            return []

        records: List[DividendRecord] = []
        for event in sorted(dividends.values(), key=lambda item: item.get("date", 0), reverse=True):
            ts_raw = event.get("date")
            if not ts_raw or int(ts_raw) < self.CUTOFF_TIMESTAMP:
                continue
            event_date = _ts_to_date(ts_raw)
            if not event_date:
                continue
            amount = event.get("amount")
            offset_prices = _price_offsets(
                ts_raw,
                timestamps,
                prices,
                pre=PRE_EVENT_DAYS,
                post=POST_EVENT_DAYS,
            )
            _fill_missing_offsets(offset_prices, pre=PRE_EVENT_DAYS, post=POST_EVENT_DAYS)
            price = offset_prices.get(0)
            dividend_yield = None
            if amount is not None and price:
                try:
                    dividend_yield = (float(amount) / price) * 100.0
                except (TypeError, ValueError, ZeroDivisionError):
                    dividend_yield = None
            records.append(
                DividendRecord(
                    ticker=ticker,
                    symbol=display_symbol,
                    company_name=company_name,
                    ex_dividend_date=event_date,
                    ex_dividend_price=_format_price(price),
                    dividend_amount=_format_amount(amount),
                    dividend_yield=_format_percent(dividend_yield),
                    currency=event.get("currency") or currency,
                    record_date=_ts_to_date(event.get("recordDate")),
                    payment_date=_ts_to_date(event.get("paymentDate")),
                    declaration_date=_ts_to_date(event.get("declarationDate")),
                    price_offsets=offset_prices,
                )
            )

        return records

    @staticmethod
    def _normalise_symbol(ticker: str) -> str:
        token = ticker.strip().upper()
        if token.endswith(".SI"):
            return token
        if token.endswith(".SG"):
            return token
        return f"{token}.SI"


def _safe_json(response: requests.Response) -> Dict:
    try:
        return response.json()
    except ValueError as exc:
        raise YahooFinanceError(f"Failed to parse JSON response: {exc}") from exc


def _ts_to_date(value: Optional[int]) -> str:
    if value in (None, 0):
        return ""
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError):
        return ""


def _format_amount(value: Optional[float]) -> str:
    if value is None:
        return ""
    if abs(value) >= 1:
        return f"{value:.4f}"
    return f"{value:.6f}"


def _format_percent(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"{value:.2f}%"


def _format_price(value: Optional[float]) -> str:
    if value is None:
        return ""
    return f"{value:.4f}"


def _extract_price_series(chart_payload: Dict) -> Tuple[List[int], List[float]]:
    timestamps = chart_payload.get("timestamp") or []
    indicators = chart_payload.get("indicators") or {}
    quotes = indicators.get("quote") or []
    closes = quotes[0].get("close") if quotes else []
    ts_series: List[int] = []
    price_series: List[float] = []
    for ts_raw, close in zip(timestamps, closes):
        if ts_raw is None or close in (None, "null"):
            continue
        try:
            ts = int(ts_raw)
            price = float(close)
        except (TypeError, ValueError):
            continue
        ts_series.append(ts)
        price_series.append(price)
    combined = sorted(zip(ts_series, price_series), key=lambda item: item[0])
    if combined:
        ts_series, price_series = map(list, zip(*combined))
    else:
        ts_series, price_series = [], []
    return ts_series, price_series


def _price_offsets(
    timestamp: Optional[int],
    timestamps: Sequence[int],
    prices: Sequence[float],
    pre: int,
    post: int,
) -> Dict[int, float]:
    if timestamp in (None, 0) or not timestamps:
        return {}
    ts = int(timestamp)
    idx = bisect.bisect_right(timestamps, ts) - 1
    if idx < 0:
        return {}
    output: Dict[int, float] = {0: prices[idx]}
    for step in range(1, pre + 1):
        pos = idx - step
        if pos < 0:
            break
        output[-step] = prices[pos]
    for step in range(1, post + 1):
        pos = idx + step
        if pos >= len(prices):
            break
        output[step] = prices[pos]
    return output


def _fill_missing_offsets(offsets: Dict[int, float], pre: int, post: int) -> None:
    base = offsets.get(0)
    if base is None:
        return
    last = base
    for step in range(1, pre + 1):
        key = -step
        if key in offsets and offsets[key] is not None:
            last = offsets[key]
        else:
            offsets[key] = last
    last = base
    for step in range(1, post + 1):
        key = step
        if key in offsets and offsets[key] is not None:
            last = offsets[key]
        else:
            offsets[key] = last


def _read_tickers(
    args: argparse.Namespace, default_tickers: Sequence[TickerListEntry]
) -> List[str]:
    tickers: List[str] = []

    if args.file:
        path = Path(args.file)
        if not path.exists():
            raise FileNotFoundError(f"Ticker file not found: {path}")
        with path.open("r", encoding="utf-8") as fp:
            for line in fp:
                token = line.strip()
                if token and not token.startswith("#"):
                    tickers.append(token)

    if args.tickers:
        tickers.extend(args.tickers)

    normalised: List[str] = []
    for token in tickers:
        symbol = token.strip()
        if not symbol:
            continue
        normalised.append(symbol.upper())

    if not normalised:
        normalised = [symbol for symbol, _ in default_tickers]

    deduped: List[str] = []
    seen = set()
    for symbol in normalised:
        if symbol not in seen:
            seen.add(symbol)
            deduped.append(symbol)

    return deduped


def _write_csv(path: Path, rows: List[DividendRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].asdict().keys()))
        writer.writeheader()
        for row in rows:
            writer.writerow(row.asdict())


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download SGX dividend history from Yahoo Finance. Defaults to a curated SGX list when no tickers are supplied."
    )
    parser.add_argument("tickers", nargs="*", help="SGX tickers (e.g. D05).")
    parser.add_argument("-f", "--file", help="Text file with tickers (one per line).")
    parser.add_argument(
        "-o",
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help="CSV output path.",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose logging.")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> None:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    tickers = _read_tickers(args, DEFAULT_TICKERS)
    scraper = YahooFinanceDividendScraper()

    records: List[DividendRecord] = []
    for ticker in tickers:
        try:
            display_name = DEFAULT_TICKER_NAMES.get(ticker, "")
            if display_name:
                logging.info("Fetching dividends for %s (%s)", ticker, display_name)
            else:
                logging.info("Fetching dividends for %s", ticker)
            records.extend(scraper.fetch_dividends(ticker))
        except Exception as exc:  # noqa: BLE001 - provide context in logs
            logging.error("Failed to fetch %s: %s", ticker, exc)

    if not records:
        raise SystemExit("No dividend data downloaded. See log for details.")

    _write_csv(Path(args.output), records)
    logging.info("Saved %d dividend records to %s", len(records), args.output)


if __name__ == "__main__":
    main()
