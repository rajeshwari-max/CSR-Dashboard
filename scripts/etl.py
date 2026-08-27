#!/usr/bin/env python3
"""
CSR Dashboard — ETL (v2, multi-workbook / multi-year)
=====================================================

Reads every CSR workbook in `data/raw/` and emits two build artefacts consumed
by the Next.js server at runtime:

    data/dataset.json   dictionary-encoded fact table (server-side only)
    data/meta.json      filter options + headline summary + capability map

Adding future years
-------------------
Just drop the data in and re-run `npm run etl`. Both shapes work:

*   **New sheet in the existing workbook** — name it with the financial year
    (e.g. `FY 2023-24`, `2023 - 2024`, `Updated FY 2023-2024`). Any sheet whose
    name contains a financial year and whose columns match the fact-table shape
    is ingested.
*   **A new workbook per year** — drop `csr_fy2023_24.xlsx` into `data/raw/`.
    Every workbook in that folder is scanned.

The largest fact-shaped sheet in each workbook is always ingested (that is the
main register). Per-sector sheets (`Chemicals`, `Automobiles`, …) are *not*
ingested as facts — they duplicate the main register — but they are still read
to rebuild the company→sector lookup. Identical rows arriving from two sources
are de-duplicated and the count is reported.

Optional columns
----------------
The dashboard has panels for NGO/implementing-agency names, beneficiaries,
project status and project dates. None of those columns exist in the current
workbook, so those panels render an explicit "not available" state. Add a
column with any of the recognised header spellings (see OPTIONAL_COLUMNS) and
re-run the ETL — the capability flags flip to true and the panels light up with
no code change.

Usage
-----
    pip install -r scripts/requirements.txt
    python scripts/etl.py                          # scan data/raw/
    python scripts/etl.py --input path/to.xlsx     # one specific workbook
    python scripts/etl.py --sheets "FY 2023-24"    # force specific sheets
    python scripts/etl.py --exclude-sheets "Draft"
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "data"

# ---------------------------------------------------------------------------
# Column vocabulary
# ---------------------------------------------------------------------------

REQUIRED_COLUMNS = {
    "company": ["Company Name", "Company name", "Company"],
    "spent": ["Amount Spent (INR Cr.)", "Amount_Spent", "Amount Spent", "CSR Spent"],
}

CORE_COLUMNS = {
    "cin": ["Unnamed: 0", "CIN", "Corporate Identity Number"],
    "sector": ["BRSR", "Sector", "Industry"],
    "year": ["YEAR", "Year", "Financial Year", "FY"],
    "project": ["CSR Project(s)", "CSR Project", "CSR_project", "Project Name"],
    "theme": [
        "Thematic area", "Development_Sector", "Development Sector(s)",
        "Schedule VII", "Thematic Area",
    ],
    "state": ["State"],
    "district": ["District", "Aspirational District"],
    "outlay": ["Project Amount Outlay (INR Cr.)", "Project_Amount_Outlay", "Project Outlay"],
    "mode": ["Mode of Implementation", "Mode_of_Implementation"],
    "co_outlay": ["Total Amount Outlay(INR CR)", "Total Amount Outlay (INR Cr.)"],
    "co_spent": ["Total Amount Spent (INR CR)", "Total Amount Spent (INR Cr.)"],
    "obligation": ["Total CSR Obligation As CSR Report", "CSR Obligation"],
    "two_pct": ["2 % of Average Net Profit", "2 % Net Profit"],
    "avg_profit": ["Average Net Profit (INR Crores)", "Average Net Profit"],
    "policy": ["CSR POLICY", "CSR Policy"],
    "annual_report": ["Annual Report"],
    "brsr_report": ["BRSR Report"],
    "csr_report": ["CSR Report"],
    "esg_report": ["ESG report"],
    "head": ["CSR head", "HEAD OF THE COMMISSION"],
    "email": ["email id", "EMAIL-ID", "Email"],
    "phone": ["phone no", "CONTACT NUMBER", "Phone"],
    "listed": ["Listed/Unlisted"],
    "company_type": ["Company Type", "Class"],
}

# Not present in the current workbook. Add any of these headers and the matching
# dashboard panel switches itself on.
OPTIONAL_COLUMNS = {
    "ngo": [
        "NGO", "NGO Name", "Implementing Agency", "Implementing Agency Name",
        "Agency Name", "Partner", "Partner Name", "Executing Agency",
        "CSR Registration Number", "Implementing Entity",
    ],
    "beneficiaries": [
        "Beneficiaries", "Beneficiaries Reached", "No. of Beneficiaries",
        "Number of Beneficiaries", "Lives Impacted", "Persons Benefited",
    ],
    "status": ["Status", "Project Status", "Implementation Status"],
    "start_date": ["Start Date", "Project Start Date", "Commencement Date"],
    "end_date": ["End Date", "Project End Date", "Completion Date"],
    "sdg": ["SDG goals", "SDG", "SDG Goals", "SDG Mapping"],
    "duration": ["Project Duration", "Duration"],
}

NON_FACT_SHEET_HINTS = {
    "overview", "analysis", "total list of company", "startups but not irman leads al",
    "total graphs of all sectors", "updated fy 2023-2024",
}

# ---------------------------------------------------------------------------
# Canonical vocabularies
# ---------------------------------------------------------------------------

SECTOR_ALIASES = {
    "technology": "Technology", "technologies": "Technology", "tech": "Technology",
    "pharmaceuticals": "Biotechnology & Pharmaceuticals",
    "biotechnology & pharmaceuticals": "Biotechnology & Pharmaceuticals",
    "paper and forestry": "Forestry & Paper", "forestry & paper": "Forestry & Paper",
    "textiles": "Apparel & Textiles", "apparel & textiles": "Apparel & Textiles",
    "healthcare provider": "Health Care Providers",
    "health care provider": "Health Care Providers",
    "health care providers": "Health Care Providers",
    "health care retail": "Health Care Retail",
    "construction": "Construction Materials",
    "construction materials": "Construction Materials",
    "aviation": "Air Transportation", "air transportation": "Air Transportation",
    "manufacturing": "Industrials", "industrials": "Industrials",
    "semiconductor": "Semiconductors", "semiconductors": "Semiconductors",
    "resturants": "Restaurants", "restaurants": "Restaurants",
    "medical technology": "Medical Technology",
    "sector agnosic": "Sector Agnostic", "sector agnostic": "Sector Agnostic",
    "corporate and retail banking": "Corporate & Retail Banking",
    "corporate & retail banking": "Corporate & Retail Banking",
    "oil and gas": "Oil & Gas", "oil & gas": "Oil & Gas",
    "coal": "Coal", "insurance": "Insurance", "media": "Media",
    "utilities": "Utilities", "food": "Food", "beverages": "Beverages",
    "capital markets": "Capital Markets", "waste management": "Waste Management",
    "marine transportation": "Marine Transportation",
    "land transportation": "Land Transportation",
    "consumer service": "Consumer Services", "consumer services": "Consumer Services",
    "consumer goods retail": "Consumer Goods Retail",
    "consumer discretionary products": "Consumer Discretionary Products",
    "food & beverage retail": "Food & Beverage Retail",
    "internet media & services": "Internet Media & Services",
    "hospitality & recreation": "Hospitality & Recreation",
    "real estate": "Real Estate", "infrastructure": "Infrastructure",
    "alternative energy": "Alternative Energy", "chemicals": "Chemicals",
    "metals & mining": "Metals & Mining", "automobiles": "Automobiles",
    "telecommunications": "Telecommunications", "tobacco": "Tobacco",
    "education": "Unclassified", "unable to classify": "Unclassified",
}

STATE_ALIASES = {
    "orissa": "Odisha", "odisha": "Odisha",
    "uttaranchal": "Uttarakhand", "uttarakhand": "Uttarakhand",
    "pondicherry": "Puducherry", "puducherry": "Puducherry",
    "jammu and kashmir": "Jammu and Kashmir", "jammu & kashmir": "Jammu and Kashmir",
    "leh & ladakh": "Ladakh", "ladakh": "Ladakh", "leh and ladakh": "Ladakh",
    "andaman and nicobar": "Andaman and Nicobar Islands",
    "andaman & nicobar": "Andaman and Nicobar Islands",
    "andaman and nicobar islands": "Andaman and Nicobar Islands",
    "dadra and nagar haveli": "Dadra and Nagar Haveli",
    "dadra & nagar haveli": "Dadra and Nagar Haveli",
    "daman and diu": "Daman and Diu", "daman & diu": "Daman and Diu",
    "nct of delhi": "Delhi", "new delhi": "Delhi", "delhi": "Delhi",
    "tamilnadu": "Tamil Nadu", "tamil nadu": "Tamil Nadu",
    "pan india": "Pan India",
    "pan india (other centralised funds)": "Pan India",
    "pan india (other centralized funds)": "Pan India",
    "pan-india": "Pan India", "all india": "Pan India",
}

MODE_ALIASES = {
    "directly by company": "Directly by company",
    "other implementing agencies": "Other implementing agencies",
    "by trusts/societies/ section 8 company set up by company itself":
        "Trust / Society / Sec-8 company (own)",
    "by trusts/societies/section 8 company set up by company itself":
        "Trust / Society / Sec-8 company (own)",
    "by trusts/societies/section 8 company set up by central or state government or entities established":
        "Trust / Society / Sec-8 company (government)",
}

NOT_SPECIFIED = "Not Specified"
NULL_TOKENS = {
    "", "nan", "na", "n/a", "none", "null", "-", "--", "nil",
    "nec/ not mentioned", "nec/not mentioned", "nec / not mentioned",
    "not mentioned", "not applicable", "nec", "data unavailable",
}

FY_RE = re.compile(r"(20\d{2})\s*[-–/]\s*(20\d{2}|\d{2})")

SUFFIX_RE = re.compile(
    r"\b(private|pvt|public|limited|ltd|llp|inc|incorporated|corporation|corp|co|company|plc|the)\b",
    re.IGNORECASE,
)

ACRONYMS = {
    "ntpc", "ongc", "bhel", "sbi", "hdfc", "icici", "itc", "tcs", "hcl", "gail",
    "bpcl", "hpcl", "iocl", "nhpc", "sail", "rec", "pfc", "nmdc", "cesc", "jsw",
    "tvs", "mrf", "bel", "hal", "irctc", "lic", "idfc", "rbl", "upl", "nalco",
}


# ---------------------------------------------------------------------------
# Scalar cleaners
# ---------------------------------------------------------------------------

def clean_text(value) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = unicodedata.normalize("NFKC", str(value))
    text = text.replace(" ", " ").replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip().strip(",;|")
    if text.lower() in NULL_TOKENS:
        return None
    return text or None


def title_case(text: str | None) -> str | None:
    if text is None:
        return None
    if text.isupper() and len(text) > 4:
        text = text.title()
    return text


def normalise_year(value) -> str | None:
    text = clean_text(value)
    if text is None:
        return None
    text = re.sub(r"\(.*?\)", "", text)
    match = FY_RE.search(text.replace("FY", " "))
    if not match:
        return None
    return f"FY {match.group(1)}-{match.group(2)[-2:]}"


def normalise_state(value) -> str:
    text = clean_text(value)
    if text is None:
        return NOT_SPECIFIED
    key = re.sub(r"\s+", " ", text.lower().replace(".", "")).strip()
    if key in STATE_ALIASES:
        return STATE_ALIASES[key]
    if key.startswith("pan india"):
        return "Pan India"
    return title_case(text) or NOT_SPECIFIED


def normalise_sector(value) -> str | None:
    text = clean_text(value)
    if text is None:
        return None
    return SECTOR_ALIASES.get(text.lower(), title_case(text))


def normalise_mode(value) -> str:
    text = clean_text(value)
    if text is None:
        return NOT_SPECIFIED
    return MODE_ALIASES.get(text.lower(), title_case(text) or NOT_SPECIFIED)


def normalise_theme(value) -> str:
    text = clean_text(value)
    if text is None:
        return NOT_SPECIFIED
    fixed = title_case(text)
    return re.sub(r"\s*,\s*", ", ", fixed) if fixed else NOT_SPECIFIED


def to_amount(value) -> float | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = clean_text(value)
        if text is None:
            return None
        text = re.sub(r"[^0-9.\-]", "", text.replace(",", ""))
        if text in {"", "-", ".", "-."}:
            return None
        try:
            number = float(text)
        except ValueError:
            return None
    if not math.isfinite(number) or number < 0:
        return None
    return round(number, 4)


def to_int(value) -> int | None:
    amount = to_amount(value)
    return int(amount) if amount is not None else None


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "company"


def company_key(name: str) -> str:
    stripped = SUFFIX_RE.sub(" ", name)
    stripped = re.sub(r"[^A-Za-z0-9 ]+", " ", stripped)
    return slugify(re.sub(r"\s+", " ", stripped).strip() or name)


def display_name(name: str) -> str:
    letters = re.sub(r"[^A-Za-z]", "", name)
    if len(letters) > 4 and letters.isupper():
        titled = name.title()
        return re.sub(
            r"\b([A-Za-z]{2,5})\b",
            lambda m: m.group(1).upper() if m.group(1).lower() in ACRONYMS else m.group(1),
            titled,
        )
    return name


def norm_header(name) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


# ---------------------------------------------------------------------------
# Sheet discovery
# ---------------------------------------------------------------------------

def resolve_columns(columns, spec: dict[str, list[str]]) -> dict[str, object]:
    """Map logical name -> actual column, tolerating header drift."""
    lookup = {norm_header(c): c for c in columns}
    resolved: dict[str, object] = {}
    for key, candidates in spec.items():
        for candidate in candidates:
            needle = norm_header(candidate)
            if needle in lookup:
                resolved[key] = lookup[needle]
                break
            match = next((orig for nk, orig in lookup.items() if nk.startswith(needle) and needle), None)
            if match is not None:
                resolved[key] = match
                break
        else:
            resolved[key] = None
    return resolved


def is_fact_sheet(columns) -> bool:
    resolved = resolve_columns(columns, REQUIRED_COLUMNS)
    return all(resolved[key] is not None for key in REQUIRED_COLUMNS)


def pick_fact_sheets(xls: pd.ExcelFile, forced: set[str], excluded: set[str]) -> list[str]:
    """
    A sheet is ingested when it is fact-shaped AND either
      * its name contains a financial year (a new year's sheet), or
      * it is the largest fact-shaped sheet in the workbook (the main register).
    Per-sector sheets are skipped: they mirror rows already in the main register.
    """
    candidates: list[tuple[str, int]] = []
    for sheet in xls.sheet_names:
        if sheet in excluded:
            continue
        lowered = sheet.strip().lower()
        if not forced and any(lowered.startswith(hint) for hint in NON_FACT_SHEET_HINTS):
            continue
        try:
            head = pd.read_excel(xls, sheet_name=sheet, nrows=1)
        except Exception:
            continue
        if not is_fact_sheet(head.columns):
            continue
        try:
            size = xls.book[sheet].max_row if hasattr(xls.book, "__getitem__") else 0
        except Exception:
            size = 0
        candidates.append((sheet, size or 0))

    if forced:
        return [sheet for sheet, _ in candidates if sheet in forced]
    if not candidates:
        return []

    candidates.sort(key=lambda item: item[1], reverse=True)
    chosen = {candidates[0][0]}
    for sheet, _ in candidates:
        if FY_RE.search(sheet.replace("FY", " ")):
            chosen.add(sheet)
    return [sheet for sheet, _ in candidates if sheet in chosen]


def build_sector_lookup(workbooks: list[tuple[Path, pd.ExcelFile]], fact_sheets: dict[str, list[str]]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for path, xls in workbooks:
        ingested = set(fact_sheets.get(str(path), []))
        for sheet in xls.sheet_names:
            if sheet in ingested or re.fullmatch(r"Sheet\d+", sheet.strip()):
                continue
            sector = normalise_sector(sheet)
            if not sector or sector == "Unclassified" or len(sheet.strip()) < 3:
                continue
            if sector.lower() not in {v.lower() for v in SECTOR_ALIASES.values()}:
                continue
            try:
                frame = pd.read_excel(xls, sheet_name=sheet, usecols=lambda c: "company" in str(c).lower())
            except Exception:
                continue
            if frame.empty or not len(frame.columns):
                continue
            for raw in frame.iloc[:, 0].dropna().unique():
                name = clean_text(raw)
                if name and len(name) > 2:
                    lookup.setdefault(company_key(name), sector)
    return lookup


def build_aspirational_districts(workbooks: list[tuple[Path, pd.ExcelFile]]) -> set[str]:
    """The workbook ships a dedicated aspirational-districts sheet; use it as a flag."""
    districts: set[str] = set()
    for _, xls in workbooks:
        for sheet in xls.sheet_names:
            if "aspiration" not in sheet.lower():
                continue
            try:
                frame = pd.read_excel(xls, sheet_name=sheet)
            except Exception:
                continue
            resolved = resolve_columns(frame.columns, {"district": ["Aspirational District", "District"]})
            column = resolved.get("district")
            if column is None:
                continue
            for raw in frame[column].dropna().unique():
                name = clean_text(raw)
                if name:
                    districts.add(name.lower())
    return districts


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Clean CSR workbooks into JSON.")
    parser.add_argument("--input", action="append", help="Workbook path (repeatable). Default: every file in data/raw/")
    parser.add_argument("--sheets", help="Comma-separated sheet names to force-ingest")
    parser.add_argument("--exclude-sheets", help="Comma-separated sheet names to skip")
    parser.add_argument("--out", default=str(OUT_DIR))
    args = parser.parse_args()

    if args.input:
        sources = [Path(p) for p in args.input]
    else:
        patterns = ("*.xlsx", "*.xlsm", "*.XLSX")
        sources = sorted({Path(p) for pattern in patterns for p in glob.glob(str(RAW_DIR / pattern))})

    sources = [p for p in sources if p.exists() and not p.name.startswith("~$")]
    if not sources:
        print(f"[etl] ERROR: no workbooks found in {RAW_DIR}", file=sys.stderr)
        print("[etl] Drop your .xlsx there (or pass --input path/to.xlsx) and re-run.", file=sys.stderr)
        return 1

    forced = {s.strip() for s in args.sheets.split(",")} if args.sheets else set()
    excluded = {s.strip() for s in args.exclude_sheets.split(",")} if args.exclude_sheets else set()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    workbooks: list[tuple[Path, pd.ExcelFile]] = []
    fact_sheets: dict[str, list[str]] = {}
    for path in sources:
        print(f"[etl] reading {path.name}")
        xls = pd.ExcelFile(path)
        workbooks.append((path, xls))
        sheets = pick_fact_sheets(xls, forced, excluded)
        fact_sheets[str(path)] = sheets
        print(f"[etl]   fact sheets: {sheets or '(none)'}")

    if not any(fact_sheets.values()):
        print("[etl] ERROR: no fact-shaped sheet found (needs 'Company Name' + 'Amount Spent').", file=sys.stderr)
        return 1

    sector_lookup = build_sector_lookup(workbooks, fact_sheets)
    aspirational = build_aspirational_districts(workbooks)
    print(f"[etl] sector lookup: {len(sector_lookup):,} companies · aspirational districts: {len(aspirational)}")

    companies: dict[str, dict] = {}
    tables: dict[str, dict[str, int]] = {
        "years": {}, "sectors": {}, "states": {}, "themes": {},
        "modes": {}, "districts": {}, "ngos": {}, "statuses": {}, "sdgs": {},
    }
    rows: list[list] = []
    seen: set[tuple] = set()
    # An optional column only counts as "available" if it is actually populated:
    # the workbook ships empty `Status` / `SDG goals` columns, and an empty
    # column powering a panel is worse than an honest "not available" state.
    column_present = {key: False for key in OPTIONAL_COLUMNS}
    column_filled = {key: 0 for key in OPTIONAL_COLUMNS}

    stats = {
        "workbooks": len(sources), "raw_rows": 0, "dropped_no_company": 0,
        "dropped_empty": 0, "duplicates_removed": 0, "missing_year": 0,
        "missing_spend": 0, "sector_backfilled": 0, "sector_unknown": 0,
        "negative_amounts": 0, "aspirational_rows": 0,
    }

    def intern(table: str, value: str) -> int:
        store = tables[table]
        if value not in store:
            store[value] = len(store)
        return store[value]

    for path, xls in workbooks:
        for sheet in fact_sheets[str(path)]:
            frame = pd.read_excel(xls, sheet_name=sheet)
            stats["raw_rows"] += len(frame)
            core = resolve_columns(frame.columns, {**CORE_COLUMNS, **REQUIRED_COLUMNS})
            optional = resolve_columns(frame.columns, OPTIONAL_COLUMNS)
            for key, column in optional.items():
                if column is not None:
                    column_present[key] = True
            sheet_year = normalise_year(sheet)
            print(f"[etl]   ingesting '{sheet}' ({len(frame):,} rows)")

            def cell(record, key):
                column = core.get(key) or optional.get(key)
                return record.get(column) if column is not None else None

            for record in frame.to_dict("records"):
                name = clean_text(cell(record, "company"))
                if not name or len(re.findall(r"[A-Za-z]", name)) < 3:
                    stats["dropped_no_company"] += 1
                    continue

                spent = to_amount(cell(record, "spent"))
                outlay = to_amount(cell(record, "outlay"))
                project = clean_text(cell(record, "project"))
                if spent is None and outlay is None and project is None:
                    stats["dropped_empty"] += 1
                    continue

                raw_spent = cell(record, "spent")
                if isinstance(raw_spent, (int, float)) and not math.isnan(raw_spent) and raw_spent < 0:
                    stats["negative_amounts"] += 1
                if spent is None:
                    stats["missing_spend"] += 1

                # Year priority: the row's own value, else the sheet name.
                year = normalise_year(cell(record, "year")) or sheet_year
                if year is None:
                    stats["missing_year"] += 1

                cid = company_key(name)
                cin = clean_text(cell(record, "cin"))
                if cin and not re.fullmatch(r"[A-Za-z0-9]{15,25}", cin):
                    cin = None

                sector = normalise_sector(cell(record, "sector"))
                if not sector:
                    sector = sector_lookup.get(cid)
                    if sector:
                        stats["sector_backfilled"] += 1
                if not sector:
                    sector = "Unclassified"
                    stats["sector_unknown"] += 1

                entry = companies.get(cid)
                if entry is None:
                    entry = {
                        "id": cid, "name": display_name(name), "cin": cin, "sector": sector,
                        "index": len(companies), "csrObligation": None, "twoPercentNetProfit": None,
                        "averageNetProfit": None, "totalOutlay": None, "reportedSpend": None,
                        "policyUrl": None, "annualReportUrl": None, "brsrReportUrl": None,
                        "csrReportUrl": None, "esgReportUrl": None, "contactName": None,
                        "contactEmail": None, "contactPhone": None, "listed": None, "companyType": None,
                    }
                    companies[cid] = entry
                else:
                    if entry["sector"] == "Unclassified" and sector != "Unclassified":
                        entry["sector"] = sector
                    if entry["cin"] is None and cin:
                        entry["cin"] = cin
                    candidate = display_name(name)
                    if len(candidate) > len(entry["name"]):
                        entry["name"] = candidate

                for field, key, caster in (
                    ("csrObligation", "obligation", to_amount),
                    ("twoPercentNetProfit", "two_pct", to_amount),
                    ("averageNetProfit", "avg_profit", to_amount),
                    ("totalOutlay", "co_outlay", to_amount),
                    ("reportedSpend", "co_spent", to_amount),
                    ("policyUrl", "policy", clean_text),
                    ("annualReportUrl", "annual_report", clean_text),
                    ("brsrReportUrl", "brsr_report", clean_text),
                    ("csrReportUrl", "csr_report", clean_text),
                    ("esgReportUrl", "esg_report", clean_text),
                    ("contactName", "head", clean_text),
                    ("contactEmail", "email", clean_text),
                    ("contactPhone", "phone", clean_text),
                    ("listed", "listed", clean_text),
                    ("companyType", "company_type", clean_text),
                ):
                    if entry[field] is None:
                        value = caster(cell(record, key))
                        if value is not None:
                            entry[field] = value

                state = normalise_state(cell(record, "state"))
                district = title_case(clean_text(cell(record, "district")))
                theme = normalise_theme(cell(record, "theme"))
                mode = normalise_mode(cell(record, "mode"))

                fingerprint = (
                    entry["index"], year, (project or "").lower()[:120], state,
                    (district or "").lower(), spent, outlay, theme,
                )
                if fingerprint in seen:
                    stats["duplicates_removed"] += 1
                    continue
                seen.add(fingerprint)

                is_aspirational = bool(district and district.lower() in aspirational)
                if is_aspirational:
                    stats["aspirational_rows"] += 1

                ngo = clean_text(cell(record, "ngo"))
                status = clean_text(cell(record, "status"))
                sdg = clean_text(cell(record, "sdg"))
                beneficiaries = to_int(cell(record, "beneficiaries"))
                for key, value in (
                    ("ngo", ngo), ("status", status), ("sdg", sdg),
                    ("beneficiaries", beneficiaries),
                    ("start_date", clean_text(cell(record, "start_date"))),
                    ("end_date", clean_text(cell(record, "end_date"))),
                    ("duration", clean_text(cell(record, "duration"))),
                ):
                    if value is not None:
                        column_filled[key] += 1

                rows.append([
                    entry["index"],
                    intern("years", year) if year else -1,
                    intern("sectors", sector),
                    intern("states", state),
                    intern("themes", theme),
                    intern("modes", mode),
                    intern("districts", district) if district else -1,
                    outlay,
                    spent,
                    project,
                    intern("ngos", ngo) if ngo else -1,
                    beneficiaries,
                    intern("statuses", status) if status else -1,
                    intern("sdgs", sdg) if sdg else -1,
                    1 if is_aspirational else 0,
                ])

    # Require both presence and meaningful coverage before advertising a column.
    min_rows = max(25, int(len(rows) * 0.01))
    capabilities = {
        key: bool(column_present[key] and column_filled[key] >= min_rows)
        for key in OPTIONAL_COLUMNS
    }
    coverage = {
        key: {
            "present": column_present[key],
            "filled": column_filled[key],
            "coveragePct": round(100 * column_filled[key] / len(rows), 2) if rows else 0.0,
            "available": capabilities[key],
        }
        for key in OPTIONAL_COLUMNS
    }

    def table_list(name: str) -> list[str]:
        return [key for key, _ in sorted(tables[name].items(), key=lambda kv: kv[1])]

    year_list = table_list("years")
    company_list = [
        {k: v for k, v in company.items() if k != "index"}
        for company in sorted(companies.values(), key=lambda c: c["index"])
    ]

    dataset = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": [
            {"file": path.name, "sheets": fact_sheets[str(path)]} for path, _ in workbooks
        ],
        "currency": "INR Crore",
        "schema": [
            "companyIdx", "yearIdx", "sectorIdx", "stateIdx", "themeIdx", "modeIdx",
            "districtIdx", "outlay", "spent", "project", "ngoIdx", "beneficiaries",
            "statusIdx", "sdgIdx", "aspirational",
        ],
        "capabilities": capabilities,
        "columnCoverage": coverage,
        "dictionaries": {
            "companies": company_list,
            "years": year_list,
            "sectors": table_list("sectors"),
            "states": table_list("states"),
            "themes": table_list("themes"),
            "modes": table_list("modes"),
            "districts": table_list("districts"),
            "ngos": table_list("ngos"),
            "statuses": table_list("statuses"),
            "sdgs": table_list("sdgs"),
        },
        "rows": rows,
        "stats": stats,
    }

    dataset_path = out_dir / "dataset.json"
    with dataset_path.open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(dataset, fh, ensure_ascii=False, separators=(",", ":"))

    total_spend = sum(r[8] or 0 for r in rows)
    by_year: dict[str, float] = {}
    for r in rows:
        if r[1] >= 0:
            by_year[year_list[r[1]]] = by_year.get(year_list[r[1]], 0.0) + (r[8] or 0)

    meta = {
        "generatedAt": dataset["generatedAt"],
        "sources": dataset["sources"],
        "currency": "INR Crore",
        "capabilities": capabilities,
        "columnCoverage": coverage,
        "rowCount": len(rows),
        "companyCount": len(company_list),
        "totalSpend": round(total_spend, 2),
        "years": sorted(year_list),
        "sectors": sorted(table_list("sectors")),
        "states": sorted(table_list("states")),
        "themes": sorted(table_list("themes")),
        "modes": sorted(table_list("modes")),
        "districts": sorted(table_list("districts")),
        "ngos": sorted(table_list("ngos")),
        "statuses": sorted(table_list("statuses")),
        "companies": sorted(
            ({"id": c["id"], "name": c["name"], "sector": c["sector"]} for c in company_list),
            key=lambda c: c["name"],
        ),
        "spendByYear": {k: round(v, 2) for k, v in sorted(by_year.items())},
        "stats": stats,
    }
    with (out_dir / "meta.json").open("w", encoding="utf-8", newline="\n") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

    size_mb = dataset_path.stat().st_size / 1_048_576
    print("[etl] ------------------------------------------------------------")
    print(f"[etl] workbooks           : {stats['workbooks']}")
    print(f"[etl] rows kept           : {len(rows):,} of {stats['raw_rows']:,} read")
    print(f"[etl] duplicates removed  : {stats['duplicates_removed']:,}")
    print(f"[etl] companies           : {len(company_list):,}")
    print(f"[etl] years               : {', '.join(sorted(year_list))}")
    print(f"[etl] sectors/states/dist : {len(tables['sectors'])} / {len(tables['states'])} / {len(tables['districts'])}")
    print(f"[etl] total spend         : Rs {total_spend:,.2f} Cr")
    print(f"[etl] aspirational rows   : {stats['aspirational_rows']:,}")
    print("[etl] optional columns    : " + (
        ", ".join(f"{k} ({coverage[k]['coveragePct']}%)" for k, v in capabilities.items() if v)
        or "none available"
    ))
    thin = [k for k in OPTIONAL_COLUMNS if column_present[k] and not capabilities[k]]
    if thin:
        print("[etl] present but too sparse to use: " + ", ".join(
            f"{k} ({column_filled[k]} rows)" for k in thin
        ))
    print(f"[etl] wrote data/dataset.json ({size_mb:.1f} MB) + data/meta.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
