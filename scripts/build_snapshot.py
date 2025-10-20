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


def _key_variants(key: str) -> List[str]:
    if key is None:
        return []
    text = str(key)
    variants = set()
    queue = [text]
    while queue:
        current = queue.pop(0)
        if not current or current in variants:
            continue
        variants.add(current)

        lower = current.lower()
        if lower not in variants:
            queue.append(lower)

        plus_word = lower.replace("+", " plus ").replace("-", " minus ")
        if plus_word not in variants:
            queue.append(plus_word)

        plus_underscore = lower.replace("+", "_plus_").replace("-", "_minus_")
        if plus_underscore not in variants:
            queue.append(plus_underscore)

        replaced = lower.replace("-", " ").replace("/", " ")
        if replaced not in variants:
            queue.append(replaced)

        no_spaces = replaced.replace(" ", "")
        if no_spaces not in variants:
            queue.append(no_spaces)

        underscores = replaced.replace(" ", "_")
        if underscores not in variants:
            queue.append(underscores)

        stripped = "".join(ch for ch in replaced if ch.isalnum())
        if stripped not in variants:
            queue.append(stripped)

    return list(variants)


def get_row_value(row: Dict[str, Optional[str]], *keys: str) -> Optional[str]:
    for key in keys:
        if key is None:
            continue
        variants = _key_variants(key)
        for variant in variants:
            if variant in row:
                return row[variant]
    return None


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

    ex_price = parse_amount(get_row_value(row, "Ex-Date Price", "ex_dividend_price"))
    formatted_ex_price = format_price(ex_price)
    prices["D+0"] = formatted_ex_price
    prices["D0"] = formatted_ex_price

    for offset in OFFSETS:
        if offset == 0:
            continue
        column = f"Price D{offset:+d}".replace("+0", "+0")
        modern_column = f"price_d_{'plus' if offset >= 0 else 'minus'}_{abs(offset)}"
        price_value = parse_amount(get_row_value(row, column, modern_column))
        key = build_price_key(offset)
        prices[key] = format_price(price_value)

    return prices


def load_upcoming_rows() -> Dict[str, Dict[str, Optional[str]]]:
    dashboard_path = next((path for path in _DASHBOARD_CSV_CANDIDATES if path.exists()), _DASHBOARD_CSV_CANDIDATES[0])
    upcoming: Dict[str, Dict[str, Optional[str]]] = {}
    with dashboard_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            ticker = normalise_string(get_row_value(row, "Ticker")).upper()
            if not ticker:
                continue

            amount_label = normalise_string(get_row_value(row, "dividend amount")) or None
            yield_label = normalise_string(get_row_value(row, "dividend yield")) or None
            pay_date = normalise_string(get_row_value(row, "dividend payment date")) or None
            ex_date = normalise_string(get_row_value(row, "Upcoming Dividend Ex Date")) or None

            upcoming[ticker] = {
                "ticker": ticker,
                "companyName": normalise_string(get_row_value(row, "Company Name")) or None,
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
            ticker = normalise_string(get_row_value(row, "Ticker")).upper()
            if not ticker:
                continue

            entry = ticker_entries.setdefault(
                ticker,
                {
                    "ticker": ticker,
                    "companyName": normalise_string(get_row_value(row, "Company Name")),
                    "events": [],
                    "upcoming": None,
                },
            )

            if not entry["companyName"]:
                company_name = get_row_value(row, "Company Name", "company_name")
                if company_name:
                    entry["companyName"] = normalise_string(company_name)

            ex_date = normalise_string(get_row_value(row, "Ex-Dividend Date", "ex_dividend_date"))
            if ex_date:
                dividend_amount = parse_amount(get_row_value(row, "Dividend Amount", "dividend_amount"))
                event = {
                    "exDate": ex_date,
                    "dividendAmount": dividend_amount,
                    "dividendAmountLabel": (
                        f"{dividend_amount:.4f}"
                        if dividend_amount is not None
                        else normalise_string(get_row_value(row, "Dividend Amount", "dividend_amount")) or None
                    ),
                    "exDatePrice": parse_amount(get_row_value(row, "Ex-Date Price", "ex_dividend_price")),
                    "exDatePriceLabel": format_price(parse_amount(get_row_value(row, "Ex-Date Price", "ex_dividend_price"))),
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
