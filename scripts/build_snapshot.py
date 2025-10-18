#!/usr/bin/env python3
"""Build a consolidated SGX dividend snapshot JSON from existing CSV sources."""

from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parents[1]
_DASHBOARD_CSV_CANDIDATES = [
    REPO_ROOT / "public" / "dashboard_data.csv",
    REPO_ROOT / "dashboard_data.csv",
]
YAHOO_CSV_PATH = REPO_ROOT / "public" / "yahoo_stock_data.csv"
OUTPUT_JSON_PATH = REPO_ROOT / "public" / "sgx_snapshot.json"

OFFSETS = list(range(-10, 31))  # -10 .. +30 inclusive


def normalise_string(value: Optional[str]) -> str:
    if value is None:
        return ""
    return str(value).strip()


def parse_amount(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    cleaned = str(value).replace(",", "").strip()
    if not cleaned:
        return None
    match = re.search(r"-?\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    try:
        return float(match.group(0))
    except (TypeError, ValueError):
        return None


def parse_percentage(value: Optional[str]) -> Optional[float]:
    if value is None:
        return None
    cleaned = (
        str(value)
        .replace("%", "")
        .replace(",", "")
        .replace("\u2212", "-")  # handle unicode minus
        .strip()
    )
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except (TypeError, ValueError):
        return None


def format_price(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    return f"{value:.2f}"


def build_price_key(offset: int) -> str:
    sign = "+" if offset >= 0 else ""
    return f"D{sign}{offset}"


def build_price_map(row: Dict[str, str]) -> Dict[str, Optional[str]]:
    prices: Dict[str, Optional[str]] = {}

    ex_price = parse_amount(row.get("Ex-Date Price"))
    formatted_ex_price = format_price(ex_price)
    prices["D+0"] = formatted_ex_price
    prices["D0"] = formatted_ex_price

    for offset in OFFSETS:
        if offset == 0:
            continue
        column = f"Price D{offset:+d}".replace("+0", "+0")
        price_value = parse_amount(row.get(column))
        key = build_price_key(offset)
        prices[key] = format_price(price_value)

    return prices


def load_upcoming_rows() -> Dict[str, Dict[str, Optional[str]]]:
    dashboard_path = next((path for path in _DASHBOARD_CSV_CANDIDATES if path.exists()), _DASHBOARD_CSV_CANDIDATES[0])
    upcoming: Dict[str, Dict[str, Optional[str]]] = {}
    with dashboard_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            ticker = normalise_string(row.get("Ticker")).upper()
            if not ticker:
                continue

            amount_label = normalise_string(row.get("dividend amount")) or None
            yield_label = normalise_string(row.get("dividend yield")) or None
            pay_date = normalise_string(row.get("dividend payment date")) or None
            ex_date = normalise_string(row.get("Upcoming Dividend Ex Date")) or None

            upcoming[ticker] = {
                "ticker": ticker,
                "companyName": normalise_string(row.get("Company Name")) or None,
                "exDate": ex_date or None,
                "payDate": pay_date or None,
                "amountLabel": amount_label,
                "amountValue": parse_amount(amount_label),
                "yieldLabel": yield_label,
                "yieldValue": parse_percentage(yield_label),
            }
    return upcoming


def build_snapshot() -> Dict[str, object]:
    upcoming_lookup = load_upcoming_rows()
    ticker_entries: Dict[str, Dict[str, object]] = {}

    with YAHOO_CSV_PATH.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            ticker = normalise_string(row.get("Ticker")).upper()
            if not ticker:
                continue

            entry = ticker_entries.setdefault(
                ticker,
                {
                    "ticker": ticker,
                    "companyName": normalise_string(row.get("Company Name")),
                    "events": [],
                    "upcoming": None,
                },
            )

            if not entry["companyName"] and row.get("Company Name"):
                entry["companyName"] = normalise_string(row.get("Company Name"))

            ex_date = normalise_string(row.get("Ex-Dividend Date"))
            if ex_date:
                dividend_amount = parse_amount(row.get("Dividend Amount"))
                event = {
                    "exDate": ex_date,
                    "dividendAmount": dividend_amount,
                    "dividendAmountLabel": (
                        f"{dividend_amount:.4f}"
                        if dividend_amount is not None
                        else normalise_string(row.get("Dividend Amount")) or None
                    ),
                    "exDatePrice": parse_amount(row.get("Ex-Date Price")),
                    "exDatePriceLabel": format_price(parse_amount(row.get("Ex-Date Price"))),
                    "prices": build_price_map(row),
                }
                entry["events"].append(event)

    # Ensure every ticker referenced in upcoming data exists in the snapshot.
    for ticker, info in upcoming_lookup.items():
        entry = ticker_entries.setdefault(
            ticker,
            {
                "ticker": ticker,
                "companyName": info.get("companyName") or "",
                "events": [],
                "upcoming": None,
            },
        )
        if not entry["companyName"] and info.get("companyName"):
            entry["companyName"] = info["companyName"]
        entry["upcoming"] = info

    # Attach upcoming info for tickers derived from the CSV dataset if not already set.
    for ticker, entry in ticker_entries.items():
        if entry.get("upcoming") is None:
            entry["upcoming"] = upcoming_lookup.get(ticker)
        events = entry.get("events") or []
        events.sort(key=lambda item: item["exDate"])  # ascending chronological order

    tickers_payload = sorted(ticker_entries.values(), key=lambda item: item["ticker"])

    snapshot = {
        "version": 1,
        "generatedAt": datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        "tickers": tickers_payload,
    }
    return snapshot


def main() -> None:
    snapshot = build_snapshot()
    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON_PATH.open("w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, indent=2, sort_keys=False)
        handle.write("\n")
    print(f"Wrote snapshot to {OUTPUT_JSON_PATH}")


if __name__ == "__main__":
    main()
