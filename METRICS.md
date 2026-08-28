# Dashboard metric reference

The canonical, detailed functionality and calculation reference is [DASHBOARD_HANDBOOK.md](DASHBOARD_HANDBOOK.md). This file records the compact audit baseline for the dataset generated on 27 August 2026.

## Validated reporting scope

| Financial year | CSR spend (INR Cr) |
| --- | ---: |
| FY 2020-21 | 13,851.47 |
| FY 2021-22 | 12,357.24 |
| FY 2022-23 | 13,502.86 |
| FY 2023-24 | 13,404.62 |
| FY 2024-25 | 15,549.26 |
| **Total** | **68,665.45** |

The reporting window begins at FY 2020-21. Later financial years are discovered automatically from each uploaded dataset.

## Current unfiltered KPI baseline

| KPI | Validated value | Rule |
| --- | ---: | --- |
| Total CSR spend | ₹68,665.45 Cr | Sum of disclosed `Amount Spent` values in reporting scope |
| Projects reported | 60,228 | Count of normalized project rows, including 289 without a disclosed spend |
| Companies reporting | 1,262 | Distinct company IDs in reporting scope |
| Average spend/company | ₹54.41 Cr | Total spend / companies |
| Median spend/company | ₹7.83 Cr | Median of positive company-level totals |
| Latest-year YoY | +16.00% | FY 2024-25 versus FY 2023-24 |
| Compliance | 36% (318 / 886) | Latest-year national spend at least 95% of disclosed obligation |

## Automated checks

Run these before release or after every data upload:

```powershell
npm test
npm run validate
npm run typecheck
npm run build
```

`npm test` independently checks annual and dimension reconciliation, KPI arithmetic, project-size bands, compliance, YoY, forecasting constraints, and dictionary integrity. `npm run validate` prints the current data baseline and warnings. Values in this file are a dated audit snapshot; generated pages and APIs always calculate from the latest uploaded dataset.
