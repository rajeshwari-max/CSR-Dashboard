# CSR Intelligence Dashboard Handbook

This handbook explains the source data, filtering rules, formulas, charts, and update workflow used by the dashboard. Monetary values are stored and calculated in INR crore.

## 1. Data model and supported columns

The ETL reads CSR workbooks from `data/raw/` and generates `data/dataset.json` and `data/meta.json`. One normalized fact row represents one disclosed CSR project line.

The dashboard currently uses these fields:

| Field | Purpose |
| --- | --- |
| Company and company ID | Company filters, counts, rankings, comparison, drill-down |
| Financial year | Trends, latest-year metrics, year-on-year calculations |
| BRSR sector | Sector filters, share, trajectories, rankings |
| State and district | Map, geographic tables, project location filters |
| Schedule VII category/theme | Thematic distribution and funding-flow analysis |
| Implementation mode | Direct/agency implementation analysis |
| Project name | Search and project register |
| Project amount outlay | Row-level display only; not summed because it is duplicated in part of the source |
| Amount spent | All CSR-spend totals, shares, rankings, averages, and trends |
| Aspirational-district flag | Aspirational spend and share |
| CSR obligation | Company-level compliance calculation |

The current data does not have sufficiently populated NGO name, beneficiary, project status, start/end date, SDG, or duration fields. The dashboard does not estimate them, and unsupported filter chips have been removed.

## 2. Filter logic

All filters are combined with AND logic. Multiple values inside one filter are combined with OR logic. For example, selecting Goa and Kerala plus Technology means `(Goa OR Kerala) AND Technology`.

The free-text search is case-insensitive and searches company, project name, Schedule VII category, state, and district. Amount filters compare against each project's `Amount Spent` value. Rows without a disclosed amount are excluded when an amount range is active.

The preset amount bands are:

| Band | Applied condition |
| --- | --- |
| ₹0–1 Cr | `spent >= 0 AND spent <= 1` |
| ₹1–5 Cr | `spent >= 1 AND spent <= 5` |
| ₹5–10 Cr | `spent >= 5 AND spent <= 10` |
| More than ₹10 Cr | `spent >= 10` |

The manual minimum and maximum inputs remain available for custom ranges. Filters are serialized into the URL, so a filtered view can be bookmarked or shared.

## 3. KPI formulas

Let `R` be the rows remaining after filters and let `spent(r)` be zero when a row has no disclosed spend unless otherwise stated.

| Metric | Formula |
| --- | --- |
| Total CSR Spend | `sum(spent(r)) for r in R` |
| Companies Reporting | Count of distinct company IDs in `R` |
| Projects | Count of rows in `R`; one disclosed project line is one project |
| Average Spend per Company | `Total CSR Spend / distinct companies in R` |
| Median Spend per Company | Median of company-level spend totals, excluding companies whose filtered rows contain no disclosed amount |
| Average Project Size | `Total CSR Spend / rows in R with a disclosed spend` |
| Latest-year Spend | Sum of spend for the chronologically latest financial year in view |
| Year-on-Year Growth | `((latest spend - previous spend) / previous spend) * 100` |
| Districts Reached | Count of distinct populated districts in `R` |
| States with Spend | Count of distinct mapped state labels, excluding `Pan India` and `Not Specified` where the page explicitly describes mapped coverage |
| Aspirational Spend | Sum of spend on rows marked as aspirational district |
| Aspirational Share | `Aspirational Spend / Total CSR Spend` |
| Top-10 Company Share | `sum(spend of ten highest-spending companies) / Total CSR Spend` |

### Compliance rate

CSR obligation is a whole-company value, so state or sector filters are not used to reduce the national spend compared with the obligation. For the latest available financial year:

1. Find each company's national spend.
2. Keep only companies with a positive disclosed obligation.
3. Mark a company compliant when `national latest-year spend >= obligation * 0.95`.
4. Calculate `compliant companies / companies with obligation * 100`.

The 95% threshold allows for rounding in source filings. Companies without an obligation are excluded from both numerator and denominator.

## 4. Breakdown and table formulas

For company, state, district, sector, category, implementation mode, and year breakdowns, rows are grouped by the selected dimension.

For each group:

- Spend = sum of disclosed spend in the group.
- Projects = row count in the group.
- Companies = distinct company count in the group.
- Share = group spend divided by the sum of spend across the same dimension.
- Latest = group spend in the latest financial year in view.
- Previous = group spend in the preceding financial year.
- YoY = `((Latest - Previous) / Previous) * 100`; unavailable when Previous is zero.

District shares use district-attributed spend as the denominator, not total CSR spend, because many rows have no district. The UI labels this as share of the shown/attributed dimension.

## 5. How charts are plotted

| Chart | X/Category | Y/Value | Plotting rule |
| --- | --- | --- | --- |
| CSR spending trend | Financial year | Sum of spend | One point per year after filters |
| Sector donut | Sector | Sector spend share | Sectors ranked by spend; percentages use total sector spend in view |
| Company bars/ranks | Company | Sum of spend | Companies sorted descending by spend |
| India choropleth | State shape | State spend | `Pan India` and `Not Specified` cannot be mapped; colour intensity uses square-root scaling to reduce domination by very large states |
| Annual CSR spend across leading states | State | Spend in INR crore | Grouped bars for the top eight mapped states; one colour per financial year |
| Sector trajectories | Financial year | Sector spend | Lines for the six highest-spending sectors in the current view |
| Sector YoY growth | Sector | YoY percentage | Prior-year base must be at least ₹5 Cr; positive and negative bars use different semantic colours |
| Funding flow | Schedule VII category | Spend and share | Categories ranked by spend; bar width is category spend divided by total category spend |
| Sparklines | Financial year | KPI value | Compact trend without axes, using the same filtered yearly aggregation |
| Project register | Project rows | Existing source columns | Server-side pagination and sorting; no derived or invented columns |

Tooltips format monetary values in crore and show the financial year/series name. Legends map each colour to a year or category. Project registers are included on company, state, and sector pages so clicking those filters immediately exposes the underlying rows.

## 6. Forecast, anomaly, and concentration formulas

The forecast is an ordinary least-squares linear regression on annual CSR-spend totals. With year index `x` and spend `y`, the dashboard calculates slope and intercept, projects the next `x`, and reports R-squared. The confidence band is `prediction +/- 1.96 * residual standard deviation`. With fewer than four years it is explicitly described as directional.

Anomalies are based on year-on-year proportional change for each company and state:

1. `delta = (current - previous) / previous`.
2. Calculate the mean and population standard deviation of comparable deltas.
3. `z = (delta - mean) / standard deviation`.
4. Flag observations where `abs(z) >= 2`.

The Herfindahl concentration index is `sum((group spend / total spend)^2)`. The dashboard also shows the more intuitive top-10 share.

## 7. Important source-data caveats

- `Pan India` and `Not Specified` spend remains in national totals but is excluded from map geometry.
- Project outlay is not aggregated because a company-level outlay is repeated across many project rows in part of FY 2020-21.
- Rows with no disclosed spend still count as project disclosures and contribute zero to spend totals.
- Reporting-company coverage changes by year, so changes in annual totals are not perfectly like-for-like.
- `Unclassified` is retained where sector resolution is impossible and excluded only when a panel explicitly states that it reports classified sectors.
- Counts should be described as coverage across India, not as a claim that India has a particular number of states.

## 8. Updating the dashboard data

1. Put the new `.xlsx` workbook in `data/raw/`. A new year can be a new workbook or a new year-named sheet.
2. From the project folder, install dependencies if needed and rebuild the generated dataset.
3. Run the checks and production build.
4. Deploy using the command for the target host.

```powershell
cd E:\DownloadFolder\csr-dashboard
npm install
npm run etl
npm run typecheck
npm run build
npm run dev
```

For local production mode:

```powershell
cd E:\DownloadFolder\csr-dashboard
npm run build
$env:PORT=3000
npm start
```

For Vercel, after authenticating the Vercel CLI:

```powershell
cd E:\DownloadFolder\csr-dashboard
vercel --prod
```

After an ETL rebuild, verify `data/meta.json` for row count, years, total spend, capabilities, and source names. Then compare a filtered dashboard view with its CSV or Excel export: project count and summed spend must match.

## 9. Code map for audit and maintenance

| Concern | Main implementation |
| --- | --- |
| Workbook ingestion and column recognition | `scripts/etl.py`, `src/lib/etl/` |
| Filtering and all KPI/grouped calculations | `src/lib/dataset.ts` |
| URL filter conversion | `src/lib/query.ts` |
| Forecasts, anomalies, concentration, recommendations | `src/lib/insights.ts` |
| Currency, number, and percentage display | `src/lib/format.ts` |
| Shared filters and spend presets | `src/components/dashboard/filter-bar.tsx` |
| Project register | `src/components/dashboard/projects-table.tsx` |
| Charts and page composition | `src/components/pages/`, `src/components/charts/` |
| PDF, Excel, PowerPoint, and CSV reports | `src/lib/reports/builders.ts` |

The formulas in this handbook describe the live code paths. They should be updated whenever a metric, filter, source field, or chart rule changes.
