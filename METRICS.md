# How every number is calculated

Written for the conversation where a partner asks "where does that figure come from?".
Every metric below is computed at request time from `data/dataset.json`, which is built
from your CSR workbook. Nothing is hard-coded, cached from a spreadsheet, or estimated.

Figures shown are the **unfiltered** dataset (FY 2020-21 → FY 2022-23) and were verified
by recomputing them independently from the raw data.

---

## KPI cards

| Card | Formula | Unfiltered value |
| --- | --- | --- |
| **Total CSR Spend** | Sum of `Amount Spent (INR Cr.)` over every row in view | ₹39,712 Cr |
| **Companies Reporting** | Distinct companies with at least one project row | 1,116 |
| **Active Projects** | Row count (one row = one disclosed project line) | 32,761 |
| **Districts Reached** | Distinct districts with at least one project | 682 |
| **Compliance Rate** | Companies whose **national** spend in the latest year ≥ 95% of their disclosed obligation, ÷ companies that disclose an obligation | 38% (333 of 887) |
| **Avg. Spend / Company** | Total spend ÷ distinct companies | ₹35.58 Cr |

The card subtitle for Avg. Spend shows the **median (₹5.97 Cr)** alongside it. The gap
between mean and median is large because spend is heavily concentrated — quote the median
when describing a "typical" filer.

### Compliance Rate — the detail worth knowing

A CSR obligation (2% of average net profit) is a **whole-company** figure. So compliance
is measured against each company's **national** spend for the year, even when you have a
state or sector filter applied. Measuring filtered spend against a whole-company
obligation would make every company look non-compliant the moment you filtered.

Companies that disclose no obligation are excluded from **both** sides of the ratio —
229 of your 1,116 companies. The denominator is always shown on the card.

| Year | Compliant |
| --- | --- |
| FY 2020-21 | 526 / 887 — 59% |
| FY 2021-22 | 318 / 887 — 36% |
| FY 2022-23 | 333 / 887 — 38% |

The 5% tolerance absorbs rounding in the source filings.

---

## Charts

| Panel | Formula |
| --- | --- |
| **CSR Spending Trend** | Spend summed per financial year. The dashed continuation is ordinary least squares over the annual totals, with a 95% band from the residual standard deviation. R² is shown so you can judge the fit — currently **0.05**, i.e. weak, and labelled as directional. |
| **Top States** | Spend per state. "Pan India" and "Not Specified" are excluded — they are filing conventions, not places. |
| **Top Sectors** | Percentages are share of total spend in view; they sum to 100%. |
| **State-wise map** | Colour is a sqrt scale of spend, because the distribution is heavily right-skewed. |
| **Growth rate** (Trend Analysis) | (this year − last year) ÷ last year, per year |
| **CAGR** | (last ÷ first)^(1 ÷ years−1) − 1 |
| **Anomalies** (AI Insights) | z-score on year-on-year change per company and per state; ≥ 2σ is flagged |

---

## Counting rules

- **States: 37.** "Pan India" and "Not Specified" are excluded from the count.
- **Sectors: 39.** "Unclassified" is excluded from the count.
- **Median spend** is taken over companies that disclosed an amount. 152 companies file
  projects with no figure; counting them as ₹0 would drag the median down about 28%. They
  still count as reporting companies — they did report.
- **"Share of shown"** columns are shares within that dimension. Only 44.7% of spend
  carries a district, so a district's share is of district-attributed spend, not of the
  ₹39,712 Cr total. The column is named accordingly.

---

## Known limits of the source data

Say these before a partner finds them.

1. **"Pan India" is 40.7% of all spend** — ₹16,171 Cr, larger than any single state. It
   cannot be placed on a map, so state-level analysis covers under 60% of the money.
2. **Project outlay is not summable.** For part of FY 2020-21 the workbook repeats a
   company-level outlay on every project row (HDFC's ₹407.74 Cr appears on ~200 rows).
   Aggregate outlay and any budget-utilisation ratio derived from it are therefore not
   charted. The per-project figure is still shown in the register as disclosed.
3. **Reporting coverage varies by year** — 982 companies in FY 2020-21, 830 in FY 2022-23.
   Year-on-year totals are not strictly like-for-like; part of any change is disclosure
   capture rather than behaviour.
4. **289 rows disclose a project but no amount.** They count as projects and contribute ₹0.
5. **No beneficiary, NGO-name, project-status or date columns** exist in the source. Those
   panels state so explicitly rather than estimating. Add any recognised column header and
   re-upload — they populate themselves.

---

## Verifying it yourself

Every figure on screen can be reproduced from the exported data:

1. Apply any filter combination
2. **Download → CSV** — the row count and the sum of the "Amount Spent" column will match
   the KPI cards exactly
3. **Download → Excel** — the Summary sheet carries the same KPIs, and the Project
   Register sheet the underlying rows

This was tested: filtered to FY 2022-23 + Technology, the API, the CSV and the Excel
Summary sheet all reported **₹1,237.94 Cr across 1,068 rows**.
