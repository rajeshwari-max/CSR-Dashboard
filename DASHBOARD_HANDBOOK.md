# CSR Intelligence Dashboard Handbook

This handbook explains the source data, filtering rules, formulas, charts, and update workflow used by the dashboard. Monetary values are stored and calculated in INR crore.

## 1. Data model and supported columns

The ETL reads CSR workbooks from `data/raw/` and generates `data/dataset.json` and `data/meta.json`. One normalized fact row represents one disclosed CSR project line.

If more than one workbook contains the same financial year, the ETL selects one canonical workbook for that whole year: the source with the widest distinct-company coverage, followed by row count and file name as deterministic tie-breakers. It does not add overlapping annual registers together. This rule prevents duplicate projects with slightly different district or classification text from inflating totals.

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

The CSR Amount control accepts a manual minimum and/or maximum in INR crore. Filters are serialized into the URL, so a filtered view can be bookmarked or shared. The same Zustand filter store is mounted above every analytical page: navigating through the sidebar retains the selection, and each destination page writes that same scope into its URL. An explicitly filtered bookmarked URL remains authoritative when opened.

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
| Executive spend/project trend | Financial year | Spend on the left axis; project rows on the right axis | Two series make changes in money distinguishable from changes in reporting volume |
| Sector donut | Sector | Sector spend share | Sectors ranked by spend; percentages use total sector spend in view |
| Company bars/ranks | Company | Sum of spend | Companies sorted descending by spend |
| India choropleth | State shape | State spend | `Pan India` and `Not Specified` cannot be mapped; colour intensity uses square-root scaling to reduce domination by very large states |
| Annual CSR spend across leading states | State | Spend in INR crore | Grouped bars for the top eight mapped states; one colour per financial year |
| Sector trajectories | Financial year | Sector spend | Lines for the six highest-spending sectors in the current view |
| Sector YoY growth | Sector | YoY percentage | Prior-year base must be at least ₹5 Cr; positive and negative bars use different semantic colours |
| Funding flow | Schedule VII category | Spend and share | Categories ranked by spend; bar width is category spend divided by total category spend |
| Project size distribution | Spend band | Count of disclosed project rows | Six non-overlapping bands from below ₹10 lakh through above ₹25 crore; clicking a bar applies the amount range globally |
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
- Overlapping source workbooks are resolved to one canonical source per financial year; the skipped-overlap count is recorded in ETL statistics.
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
npm test
npm run validate
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

The in-app Merge mode accepts genuinely new financial years only. It blocks a year already present in the dataset rather than risk double counting. To revise an existing financial year, rebuild the complete canonical dataset from `data/raw/`, validate it, and deploy or upload it in Replace mode.

## 9. Code map for audit and maintenance

| Concern | Main implementation |
| --- | --- |
| Workbook ingestion and column recognition | `scripts/etl.py`, `src/lib/etl/` |
| Filtering and all KPI/grouped calculations | `src/lib/dataset.ts` |
| URL filter conversion | `src/lib/query.ts` |
| Forecasts, anomalies, concentration, recommendations | `src/lib/insights.ts` |
| Currency, number, and percentage display | `src/lib/format.ts` |
| Shared cross-page filters | `src/components/shell/filter-bar.tsx`, `src/components/shared/use-dashboard-filters.ts`, `src/store/filters.ts` |
| Project register | `src/components/dashboard/projects-table.tsx` |
| Charts and page composition | `src/components/pages/`, `src/components/charts/` |
| PDF, Excel, PowerPoint, and CSV reports | `src/lib/reports/builders.ts` |
| Login and session protection | `src/middleware.ts`, `src/app/login/`, `src/app/api/auth/` |
| Automated validation | `tests/dashboard-calculations.test.mjs`, `scripts/validate-dashboard.mjs` |

The formulas in this handbook describe the live code paths. They should be updated whenever a metric, filter, source field, or chart rule changes.

## 10. Application architecture and request flow

The application is built with Next.js 15, React 19, TypeScript, Recharts, Zustand, and Tailwind CSS. The checked-in JSON dataset is dictionary encoded: repeated labels are stored once and project rows contain integer indexes. On the first server request, `src/lib/dataset.ts` loads those rows into typed arrays and caches the decoded structure for later API calls.

The normal request flow is:

1. A page reads the shared filter store.
2. `useDashboardFilters` converts the filter object into URL parameters.
3. Data hooks request `/api/summary`, `/api/breakdown`, `/api/projects`, or `/api/insights` with that exact query.
4. `paramsToFilters` validates and caps list inputs.
5. `selectRows` scans the typed arrays once and enforces FY 2020-21 as the earliest visible year.
6. Summary, grouping, insight, report, and export builders work only on the selected row indexes.
7. The page renders the response and keeps the same filter scope when the user navigates elsewhere.

API responses are cached by dataset generation timestamp plus query string. Uploading and rebuilding a dataset changes that timestamp, so new requests do not reuse old analytical results.

## 11. Page-by-page functionality

| Page | Functionality |
| --- | --- |
| Executive Dashboard | Six KPI cards, spend/project trend, top states, top sectors, India map, leading companies, and four decision-relevant automated insights |
| Company Analysis | Search, select up to four filers, annual comparison, benchmark table, sector mix, source-document links, and filtered project register |
| State Analysis | Choropleth, mapped/unmapped coverage, fastest-growing states, annual state comparison, state table, districts, and source rows |
| Sector Analysis | Spend-share donut, six-sector trajectories, positive/negative YoY movements, Schedule VII funding flow, full sector table, and source rows |
| Implementation Analysis | Direct versus agency/trust delivery modes, mode table, state presence, and Schedule VII focus areas |
| Project Analytics | Project KPIs, six-band project-size histogram with click-to-filter, district ranking, amount-filter status, and sortable paginated register |
| Trend Analysis | Annual totals, growth, CAGR, reporting coverage, forecast, and comparable yearly table |
| Reports | PDF, Excel, PowerPoint, and CSV generated from the active filters; recent downloads are remembered in the browser |
| AI Insights | Deterministic executive summary, grounded insight cards, projection, anomaly table, recommendations, data-quality checks, and natural-language queries |
| Data Explorer | Filtered tabular exploration and export |
| Data Upload | Workbook upload, column detection, ETL rebuild, and capability refresh |

## 12. How AI Insights are produced

No model is trained on this dashboard and no model is allowed to calculate KPI values. The default insight system is deterministic TypeScript code in `src/lib/insights.ts`:

1. It calls the same `buildSummary` and `selectRows` functions used by the visible pages.
2. It calculates YoY movement, reporting participation, company/state/category concentration, geographic attribution gaps, aspirational share, sector movers, forecast, anomalies, and data-quality counts.
3. Each insight stores evidence values alongside its title and explanation.
4. The executive card selects one trend, anomaly, concentration, and gap item where available.
5. The built-in natural-language engine in `src/lib/nlq.ts` parses supported questions and computes the answer from the current filter selection.

An external LLM is optional. When `LLM_API_KEY` is configured, it receives a compact fact pack that has already been calculated. Its system prompt requires it to use only supplied figures and to state when a requested fact is absent. It can narrate the findings or answer broader questions, but it cannot modify data or become the source of a number. If no key is configured, narration controls are hidden while deterministic insights and supported natural-language queries continue to work.

The forecast is not AI training. It is ordinary least-squares regression over the visible annual totals. “Projected” means an estimated next-year value, not a reported amount. R² describes how closely the straight line fits the observed totals; a low value means the projection should receive little weight.

## 13. Login and access control

Set `APP_PASSWORD` in the deployment environment to enable the login window. When it is set:

- Middleware protects pages, APIs, uploads, and downloads.
- An unauthenticated page request redirects to `/login` and preserves the intended destination.
- The sign-in tab accepts either a registered email/password pair or the administrator `APP_PASSWORD` with the email left blank.
- The register tab requires name, email, and a password of the user's choice with at least 10 characters. `APP_PASSWORD` is not requested during registration.
- Registered passwords are salted and hashed with scrypt. Accounts are stored in `users.json` on `CSR_DATA_DIR` (or `AUTH_DATA_DIR` when explicitly set), so the Render persistent disk preserves them across deployments.
- A successful sign-in or registration creates a secure, HTTP-only, same-site session cookie valid for 12 hours.
- API calls without the session return HTTP 401 rather than HTML.
- Sign out deletes the session cookie and uses a relative `/login` redirect so a reverse proxy cannot expose its internal localhost address.
- Static Next.js assets and the login/register endpoints remain public so the window can load.

Leaving `APP_PASSWORD` empty disables authentication for local development. The password must be configured in the host environment and must never be committed to the repository.

## 14. Professional visual system and accessibility

The interface uses one fixed professional palette: navy/blue for financial series and primary actions, teal for operational comparison, and slate for neutral context. KPI cards share the same white surface and navy icon treatment; rankings use one consistent blue rather than rotating colours. Green, amber, and red are reserved strictly for positive, warning, and risk states. Colour is never the only carrier of meaning: legends, labels, signs, text, and tooltips accompany it. Charts share the same six-token blue/teal/slate palette and tooltip treatment through `src/components/charts/chart-theme.ts`.

KPI cards switch from six columns to three at laptop widths and two on small screens. Labels reserve space for the icon, long values expose their full value as a title, and figures use tabular numerals. Empty charts render an explicit empty state instead of a blank plotting area.

## 15. Capability-based hiding

The ETL records whether optional columns are present and sufficiently populated. Features without source support are not fabricated:

- Named NGO/partner panels are hidden because NGO name coverage is absent; implementation-mode analysis remains because that field exists.
- Beneficiary, project status, dates, SDGs, duration, monthly, and quarterly controls remain hidden while their columns are unavailable.
- External-model narration is hidden when no LLM key is configured.
- Unsupported notices and placeholder cards are removed from analytical pages; supported underlying data remains visible.
- Project outlay remains visible per row but aggregate utilization is withheld because FY 2020-21 contains repeated company-level outlay values.

## 16. Test, validation, and release checklist

`npm test` independently recomputes the reporting-year boundary, annual reconciliation, dimension reconciliation, project-size buckets, YoY, dictionary indexes, company averages/median, compliance, and linear-fit constraints from `data/dataset.json`.

`npm run validate` performs a dataset-wide audit and prints the included years, rows, companies, disclosed-spend rows, total, annual totals, warnings, and errors. `npm run typecheck` validates TypeScript contracts, and `npm run build` performs the production compilation and route generation.

Before release, all four commands must pass. Then verify in a rendered build that:

1. KPI labels and values do not collide with icons at desktop, laptop, and mobile widths.
2. A filter selected on the Executive Dashboard remains active after navigating to State, Sector, Project, Reports, and AI pages.
3. Reset clears the same shared scope.
4. The year filter begins at FY 2020-21 and automatically includes later uploaded years.
5. A CSV export reconciles to the filtered project count and spend total.
6. With `APP_PASSWORD` set, protected pages redirect to login, a valid sign-in returns to the requested page, and sign-out removes access.

## 17. Current limitations and work remaining

The requested functionality is implemented. What remains depends on new source data or deployment configuration rather than missing dashboard code:

- Populate NGO names to enable named-partner rankings and profiles.
- Populate beneficiary, project status, date, SDG, and duration columns to enable those analyses.
- Supply consistently project-level outlay values before enabling aggregate budget utilization.
- Set `APP_PASSWORD` on the deployment host for the login window.
- Set an optional `LLM_API_KEY`, provider, and model only if external narration is wanted; deterministic insights do not require it.
- Review the 289 current rows with no disclosed spend and the remaining Unclassified sector rows as data-quality remediation.
