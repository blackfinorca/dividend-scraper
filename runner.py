#!/usr/bin/env python3
"""
Utility runner to refresh local data files used by the frontend.

- Scrapes live upcoming dividends from https://www.dividends.sg/dividend/coming and
  saves them to ``public/dividends_upcoming.json``.
- Uses the Yahoo Finance scraper in ``data_fetch.py`` to regenerate
  ``public/yahoo_stock_data.json`` (including tickers from the upcoming feed).
"""

from __future__ import annotations

import json
import logging
import re
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Sequence

import requests

from data_fetch import DEFAULT_TICKERS, YahooFinanceDividendScraper

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
YAHOO_DATA_PATH = PUBLIC_DIR / "yahoo_stock_data.json"
UPCOMING_JSON_PATH = PUBLIC_DIR / "dividends_upcoming.json"
DIVIDENDS_SG_URL = "https://www.dividends.sg/dividend/coming"
USER_AGENT = "Mozilla/5.0"


class _FirstTableParser(HTMLParser):
    """Extract the first table's rows (header + body) as plain text cells."""

    def __init__(self) -> None:
        super().__init__()
        self.in_table = False
        self.in_cell = False
        self.current_row: List[str] = []
        self.rows: List[List[str]] = []
        self.cell_buffer: List[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "table" and not self.in_table:
            self.in_table = True
        if self.in_table and tag in ("td", "th"):
            self.in_cell = True
            self.cell_buffer = []

    def handle_endtag(self, tag):
        if not self.in_table:
            return
        if tag in ("td", "th") and self.in_cell:
            text = unescape("".join(self.cell_buffer)).strip()
            self.current_row.append(re.sub(r"\s+", " ", text))
            self.in_cell = False
        elif tag == "tr":
            if self.current_row:
                self.rows.append(self.current_row)
            self.current_row = []
        elif tag == "table":
            self.in_table = False

    def handle_data(self, data):
        if self.in_cell:
            self.cell_buffer.append(data)


def _normalise_header(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", text.lower()).strip()


def scrape_dividends_sg() -> List[Dict[str, str]]:
    """Scrape upcoming dividends from dividends.sg and return normalized rows."""
    logging.info("Scraping upcoming dividends from %s", DIVIDENDS_SG_URL)
    resp = requests.get(DIVIDENDS_SG_URL, headers={"User-Agent": USER_AGENT}, timeout=20)
    resp.raise_for_status()

    parser = _FirstTableParser()
    parser.feed(resp.text)
    rows = parser.rows
    if not rows:
        raise RuntimeError("No table rows found on dividends.sg page")

    header = rows[0]
    body = rows[1:] if len(rows) > 1 else []
    header_map: Dict[str, int] = {}
    for idx, text in enumerate(header):
        key = _normalise_header(text)
        if "company" in key:
            header_map["company"] = idx
        if "ticker" in key or "symbol" in key:
            header_map["ticker"] = idx
        if "price" in key:
            header_map["price"] = idx
        if "yield" in key:
            header_map["yield"] = idx
        if ("pay" in key and "date" in key) or "payment" in key:
            header_map["payDate"] = idx
        if "next" in key or "ex" in key:
            header_map["nextDividend"] = idx
        elif "amount" in key:
            header_map["amount"] = idx

    def get_cell(row: List[str], key: str) -> str:
        idx = header_map.get(key)
        return row[idx].strip() if idx is not None and idx < len(row) else ""

    def is_date_like(text: str) -> bool:
        return bool(re.search(r"\d{4}[-/]\d{2}[-/]\d{2}", text))

    def is_amount_like(text: str) -> bool:
        return bool(re.search(r"[A-Za-z]{3}\\s*\\d", text)) or (
            bool(re.search(r"\\d", text)) and not is_date_like(text)
        )

    cleaned: List[Dict[str, str]] = []
    for row in body:
        company = get_cell(row, "company")
        ticker = get_cell(row, "ticker").upper()
        price = get_cell(row, "price")
        yield_field = get_cell(row, "yield")
        amount = get_cell(row, "amount")
        next_div = get_cell(row, "nextDividend")
        pay_date = get_cell(row, "payDate")

        if is_amount_like(next_div) and is_date_like(amount):
            amount, next_div = next_div, amount
        if not is_date_like(next_div):
            for cell in row:
                if is_date_like(cell):
                    next_div = cell
                    break
        if not amount and is_amount_like(next_div):
            amount, next_div = next_div, next_div if is_date_like(amount) else next_div
        if not ticker or not next_div:
            continue

        cleaned.append(
            {
                "company": company,
                "ticker": ticker,
                "price": price,
                "yield": yield_field,
                "amount": amount,
                "nextDividend": next_div,
                "payDate": pay_date if is_date_like(pay_date) else "",
            }
        )

    if not cleaned:
        raise RuntimeError("Parsed 0 upcoming dividend rows from dividends.sg")
    return cleaned


def _load_upcoming_rows() -> List[Dict]:
    if not UPCOMING_JSON_PATH.exists():
        return []
    try:
        with UPCOMING_JSON_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, list) else []
    except Exception as exc:  # noqa: BLE001
        logging.warning("Unable to read upcoming dividends JSON: %s", exc)
        return []


def _merge_upcoming_tickers(
    base_tickers: Sequence[tuple], upcoming_rows: List[Dict]
) -> List[tuple]:
    merged = list(base_tickers)
    seen = {symbol for symbol, _ in base_tickers}
    for row in upcoming_rows:
        ticker = (row.get("ticker") or "").strip().upper()
        if ticker and ticker not in seen:
            merged.append((ticker, row.get("company") or ""))
            seen.add(ticker)
    return merged


def refresh_upcoming_json(scraped_rows: List[Dict]) -> None:
    """Persist scraped upcoming dividends."""
    UPCOMING_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with UPCOMING_JSON_PATH.open("w", encoding="utf-8") as handle:
        json.dump(scraped_rows, handle, ensure_ascii=False, indent=2)
    logging.info("Saved %d upcoming records to %s", len(scraped_rows), UPCOMING_JSON_PATH)


def refresh_yahoo_json(upcoming_rows: List[Dict] | None = None) -> None:
    """Refresh yahoo_stock_data.json using the YahooFinanceDividendScraper."""
    scraper = YahooFinanceDividendScraper()
    rows = upcoming_rows if upcoming_rows is not None else _load_upcoming_rows()
    merged_tickers = _merge_upcoming_tickers(DEFAULT_TICKERS, rows)

    records = []
    for ticker, name in merged_tickers:
        try:
            label = name or ticker
            logging.info("Fetching Yahoo dividends for %s", label)
            records.extend(scraper.fetch_dividends(ticker))
        except Exception as exc:  # noqa: BLE001
            logging.error("Failed to fetch %s: %s", ticker, exc)

    if not records:
        raise RuntimeError("No Yahoo Finance records downloaded.")

    YAHOO_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = [record.asdict() for record in records]
    with YAHOO_DATA_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    logging.info("Saved %d dividend records to %s", len(records), YAHOO_DATA_PATH)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    upcoming_data = scrape_dividends_sg()
    refresh_upcoming_json(upcoming_data)
    refresh_yahoo_json(upcoming_data)


if __name__ == "__main__":
    main()
