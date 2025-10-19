#!/usr/bin/env python3
"""Enrich the yahoo_stock_data.csv file with dividend history fetched from Yahoo Finance.

This helper script targets tickers you pass on the command line, refreshes their dividend
events using Yahoo's public endpoints, and rewrites the CSV with the new rows while leaving
other tickers intact.

Usage:
    ./scripts/yahoo_enricher.py BEC NEX CHJ

Notes:
    • Requires outbound network access so it should be run on your machine (not inside
      the Codex sandbox).
    • Updates are applied in-place to public/yahoo_stock_data.csv; take a backup if needed.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Dict, Iterable, List, Sequence

import data_fetch


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MASTER_CSV_PATH = PROJECT_ROOT / "public" / "yahoo_stock_data.csv"
PRICE_HEADER_PREFIX = "Price "


def _load_master_csv(path: Path) -> tuple[List[str], List[Dict[str, str]]]:
    """Return the header and all existing rows from the master CSV."""
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        header = reader.fieldnames or []
        rows = list(reader)
    return header, rows


def _write_master_csv(path: Path, header: Sequence[str], rows: Iterable[Dict[str, str]]) -> None:
    """Persist rows back to the master CSV with the provided header."""
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(header))
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _build_price_lookup_from_header(header: Sequence[str]) -> List[tuple[str, str]]:
    """Construct a lookup list mapping CSV column names to Yahoo price keys."""
    lookups: List[tuple[str, str]] = []
    for column in header:
        if not column.startswith(PRICE_HEADER_PREFIX):
            continue
        offset = column[len(PRICE_HEADER_PREFIX) :].strip()
        if not offset:
            continue
        lookups.append((column, offset))
    return lookups


def _format_float(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.4f}"


def _format_price(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.2f}"


def refresh_ticker_rows(
    ticker: str,
    header: Sequence[str],
    price_lookup: Sequence[tuple[str, str]],
) -> List[Dict[str, str]]:
    """Fetch dividend events for a ticker and return CSV rows matching the master schema."""
    info = data_fetch.lookup_ticker(ticker)
    if not info.yahoo_symbol:
        raise RuntimeError(f"Unable to resolve Yahoo Finance symbol for {ticker}")

    events = data_fetch.fetch_dividend_events(info.yahoo_symbol)
    if not events:
        return []

    upcoming_info = data_fetch._compile_upcoming_info(info.yahoo_symbol, info.ticker, events)  # type: ignore[attr-defined]

    rows: List[Dict[str, str]] = []
    for event in events:
        row: Dict[str, str] = {column: "" for column in header}
        row["Ticker"] = info.ticker
        row["Company Name"] = info.company_name or ""
        row["Ex-Dividend Date"] = event.ex_date
        row["Dividend Amount"] = _format_float(event.amount)

        if upcoming_info:
            row["Upcoming Ex-Date"] = (upcoming_info.get("date") or "")[:10]
            row["Upcoming Dividend Pay Date"] = (upcoming_info.get("payDate") or "")[:10]
            row["Upcoming Dividend Yield"] = upcoming_info.get("yieldLabel") or ""
            row["Upcoming Dividend Amount"] = upcoming_info.get("amountLabel") or ""

        row["Ex-Date Price"] = _format_price(event.prices.get(0))

        for column, offset_key in price_lookup:
            price_value = event.prices.get(offset_key)
            row[column] = _format_price(price_value)

        rows.append(row)

    # Stable sort by ex-date descending so the most recent event is first
    rows.sort(key=lambda item: item.get("Ex-Dividend Date") or "", reverse=True)
    return rows


def enrich_master_csv(tickers: Sequence[str]) -> None:
    if not tickers:
        print("No tickers supplied; nothing to do.")
        return

    header, existing_rows = _load_master_csv(MASTER_CSV_PATH)
    if not header:
        raise RuntimeError("Unable to read header from master CSV; aborting.")

    price_lookup = _build_price_lookup_from_header(header)

    # Remove rows for target tickers so we can replace them with fresh data
    tickers_upper = {ticker.strip().upper() for ticker in tickers if ticker.strip()}
    retained_rows = [row for row in existing_rows if row.get("Ticker", "").upper() not in tickers_upper]

    refreshed_rows: List[Dict[str, str]] = []
    missing_tickers: List[str] = []

    for ticker in sorted(tickers_upper):
        try:
            new_rows = refresh_ticker_rows(ticker, header, price_lookup)
        except Exception as exc:  # noqa: BLE001
            print(f"[WARN] Failed to refresh {ticker}: {exc}")
            missing_tickers.append(ticker)
            continue

        if not new_rows:
            print(f"[INFO] No dividend events found for {ticker}.")
            missing_tickers.append(ticker)
            continue

        refreshed_rows.extend(new_rows)
        print(f"[OK] Refreshed {ticker} with {len(new_rows)} dividend events.")

    updated_rows = retained_rows + refreshed_rows
    _write_master_csv(MASTER_CSV_PATH, header, updated_rows)

    print(f"\nUpdated {MASTER_CSV_PATH} with {len(refreshed_rows)} new rows.")
    if missing_tickers:
        print("The following tickers returned no data (left unchanged):")
        for ticker in missing_tickers:
            print(f"  - {ticker}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Enrich yahoo_stock_data.csv using Yahoo Finance dividend history.")
    parser.add_argument(
        "tickers",
        nargs="+",
        help="Ticker symbols to refresh (e.g. BEC NEX CHJ). Symbols are uppercased automatically.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    enrich_master_csv(args.tickers)


if __name__ == "__main__":
    main()
