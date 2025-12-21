#!/usr/bin/env python3
"""Enrich the yahoo_stock_data.json file with dividend history fetched from Yahoo Finance.

This helper script targets tickers you pass on the command line, refreshes their dividend
events using Yahoo's public endpoints, and rewrites the JSON with the new rows while leaving
other tickers intact.

Usage:
    ./scripts/yahoo_enricher.py BEC NEX CHJ

Notes:
    • Requires outbound network access so it should be run on your machine (not inside
      the Codex sandbox).
    • Updates are applied in-place to public/yahoo_stock_data.json; take a backup if needed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

from data_fetch import DEFAULT_TICKER_NAMES, YahooFinanceDividendScraper, YahooFinanceError


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MASTER_JSON_PATH = PROJECT_ROOT / "public" / "yahoo_stock_data.json"


def _load_master_json(path: Path) -> List[Dict[str, str]]:
    """Return all existing rows from the master JSON dataset."""
    if not path.exists():
        raise FileNotFoundError(f"Master dataset not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected JSON shape in {path}")
    return data


def _write_master_json(path: Path, rows: Iterable[Dict[str, str]]) -> None:
    """Persist rows back to the master JSON dataset."""
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = list(rows)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def refresh_ticker_rows(
    ticker: str,
    scraper: YahooFinanceDividendScraper,
) -> List[Dict[str, str]]:
    """Fetch dividend events for a ticker and return JSON rows matching the master schema."""
    token = ticker.strip().upper()
    if not token:
        return []

    records = scraper.fetch_dividends(token)
    if not records:
        return []

    rows: List[Dict[str, str]] = []
    for record in records:
        record_map = record.asdict()
        record_map.setdefault("ticker", token)
        if not record_map.get("company_name"):
            record_map["company_name"] = DEFAULT_TICKER_NAMES.get(token, "")
        rows.append(record_map)

    # Stable sort by ex-date descending so the most recent event is first
    rows.sort(key=lambda item: item.get("ex_dividend_date") or "", reverse=True)
    return rows


def enrich_master_json(tickers: Sequence[str]) -> None:
    if not tickers:
        print("No tickers supplied; nothing to do.")
        return

    existing_rows = _load_master_json(MASTER_JSON_PATH)

    # Remove rows for target tickers so we can replace them with fresh data
    tickers_upper = {ticker.strip().upper() for ticker in tickers if ticker.strip()}
    retained_rows = [row for row in existing_rows if row.get("ticker", "").upper() not in tickers_upper]

    refreshed_rows: List[Dict[str, str]] = []
    missing_tickers: List[str] = []
    scraper = YahooFinanceDividendScraper()

    for ticker in sorted(tickers_upper):
        try:
            new_rows = refresh_ticker_rows(ticker, scraper)
        except YahooFinanceError as exc:
            print(f"[WARN] Failed to refresh {ticker}: {exc}")
            missing_tickers.append(ticker)
            continue
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] Unexpected error refreshing {ticker}: {exc}")
            missing_tickers.append(ticker)
            continue

        if not new_rows:
            print(f"[INFO] No dividend events found for {ticker}.")
            missing_tickers.append(ticker)
            continue

        refreshed_rows.extend(new_rows)
        print(f"[OK] Refreshed {ticker} with {len(new_rows)} dividend events.")

    updated_rows = retained_rows + refreshed_rows
    _write_master_json(MASTER_JSON_PATH, updated_rows)

    print(f"\nUpdated {MASTER_JSON_PATH} with {len(refreshed_rows)} new rows.")
    if missing_tickers:
        print("The following tickers returned no data (left unchanged):")
        for ticker in missing_tickers:
            print(f"  - {ticker}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich yahoo_stock_data.json using Yahoo Finance dividend history.")
    parser.add_argument(
        "tickers",
        nargs="+",
        help="Ticker symbols to refresh (e.g. BEC NEX CHJ). Symbols are uppercased automatically.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    enrich_master_json(args.tickers)


if __name__ == "__main__":
    main()
