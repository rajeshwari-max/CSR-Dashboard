# CMS · CSR Intelligence Dashboard

Nine-page dashboard over project-level **Corporate Social Responsibility** disclosures by Indian
companies, built with Next.js 15 (App Router), Tailwind CSS, shadcn/ui-style primitives and Recharts.

Verified against the current workbooks: **101,327 CSR projects · 1,347 companies · ₹141,976.53 Cr ·
771 districts**, FY 2014-15 → FY 2024-25.

---

## 1. Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

The dataset is pre-generated, so nothing else is needed on first run.

```bash
npm run build && npm start     # production
npm run typecheck              # tsc --noEmit
npm run etl                    # rebuild data/*.json from data/raw/
```

> **Windows tip:** if the first compile takes minutes, add the project folder to Windows Defender's
> exclusion list. Defender scanning `node_modules` on every read is the usual cause.

---

## 2. Adding future years — the important bit

Drop the data in and run `npm run etl`. **Both shapes work:**

| Shape | What to do |
| --- | --- |
| New sheet in the existing workbook | Name it with the financial year — `FY 2023-24`, `2023 - 2024`, `Updated FY 2023-2024`. Any fact-shaped sheet whose name contains a year is ingested. |
| New workbook per year | Drop `csr_fy2023_24.xlsx` into `data/raw/`. Every workbook in that folder is scanned. |

The ETL also:

- always ingests the **largest fact-shaped sheet** in each workbook (the main register);
- **skips per-sector sheets** (`Chemicals`, `Automobiles`, …) as facts — they mirror rows already in
  the main register and would double-count — while still reading them to rebuild the company→sector
  lookup;
- **de-duplicates** identical rows across sources (700 removed from the current file) and reports the
  count;
- derives years from the row, falling back to the sheet name;
- needs no code change for new years — every chart, filter and forecast reads the year list from the
  data.

```bash
python scripts/etl.py                          # scan data/raw/
python scripts/etl.py --input path/to.xlsx     # one workbook
python scripts/etl.py --sheets "FY 2023-24"    # force specific sheets
python scripts/etl.py --exclude-sheets "Draft"
```

### Columns that switch panels on

Four panels the design calls for have no backing column in the current workbook, so they render an
explicit "not available" state that names the column it wants. Add a column with any recognised
header, re-run the ETL, and the panel switches itself on — **no code change**:

| Panel | Add a column named (any of) |
| --- | --- |
| NGO / partner analysis | `NGO Name`, `Implementing Agency`, `Agency Name`, `Partner Name`, `CSR Registration Number` |
| Beneficiaries & impact | `Beneficiaries`, `Beneficiaries Reached`, `No. of Beneficiaries`, `Lives Impacted` |
| Project status | `Status`, `Project Status`, `Implementation Status` |
| Timeline | `Start Date`, `End Date`, `Project Duration` |

A column only counts as available once it is **actually populated** (≥1% of rows). Your workbook has
empty `Status` and `SDG goals` columns; the ETL reports them as "present but too sparse to use"
rather than lighting up an empty chart.

---

## 3. Pages

| Page | What it does |
| --- | --- |
| **Executive Dashboard** | 4 KPI cards with sparklines, spend trend, sector donut, top-12 companies, Schedule VII categories, India choropleth, top states, paginated project register. |
| **Company Analysis** | One searchable company list, up to 4-company comparison, spend by year, YoY, obligation utilisation, sector distribution, disclosure links, and the filtered project register. |
| **State Analysis** | Choropleth + coverage panel, fastest-growing states, readable multi-year state comparison, state and district tables, and the filtered project register. |
| **Sector Analysis** | Sector share, 6-sector trajectories, YoY growth, funding flow into Schedule VII categories, full sector table, and the filtered project register. |
| **NGO Analysis** | Mode-of-implementation breakdown (direct vs. own trust vs. government trust vs. external agency), state presence, focus areas — plus an honest panel explaining that partner *names* aren't in the data. |
| **AI Insights** | Executive summary, ~10 insight cards with evidence chips, forecast chart with confidence band, anomaly table, recommendations, data-quality panel, and a chat box. |
| **Reports** | PDF / Excel / PowerPoint / CSV generation from the current filters, with a per-format contents list and a re-downloadable history. |
| **Data Explorer** | Raw register with a column chooser, sorting, page sizes to 200, and named **saved views** stored in the browser. |

Plus `/companies/[id]` — per-company drill-down with national rank, sector rank, obligation
utilisation, thematic mix, state coverage, peers and largest projects.

Filters (year, company, state, district, sector, Schedule VII category, implementation mode, amount
range (including 0–1, 1–5, 5–10 and >10 Cr presets), aspirational-only, free text) are shared across
every page and mirrored into the URL, so any view is a shareable link. Unsupported Quarter, Month,
NGO and Status filter chips are not shown.

---

## 4. AI Insights — how it actually works

Everything on that page is **computed from the fact table**, not generated by a model:

- **Trend & participation** — YoY change, plus a warning when reporting coverage changes enough to
  make years non-comparable.
- **Concentration** — top-10 share, Herfindahl index, state and category concentration.
- **Gaps** — spend that can't be mapped, thin aspirational-district coverage.
- **Forecast** — ordinary least squares over annual totals, with a 95% band from the residual SD, an
  R² so you can see how much to trust it, and an explicit caveat when there are fewer than 4 years.
- **Anomalies** — z-scores on year-on-year change per company and per state; anything ≥2σ is flagged
  with its before/after figures.

Each card carries **evidence chips** — the raw numbers the sentence was built from — so nothing is
unverifiable, and it all runs in ~35 ms.

**Optional LLM layer.** Set a key in `.env.local` and two extras appear: a narration button on the
executive summary, and the chat box. The model only ever receives a pre-computed fact pack and is
instructed not to invent figures. Without a key the page is fully functional and the chat box says so.

```bash
LLM_PROVIDER=anthropic       # or openai
LLM_API_KEY=sk-...
LLM_MODEL=claude-sonnet-5
```

---

## 5. Reports

| Format | Contents | Typical time |
| --- | --- | --- |
| **PDF** | Cover with filter scope, 10 KPIs, executive summary, trend table, four vector bar charts, analysis cards, anomaly table, data-quality notes | ~0.3 s |
| **Excel** | 9 sheets: Summary, Trend, Companies, States, Sectors, Categories, Implementation, Districts, Anomalies + full filtered register with autofilter | ~2–7 s |
| **PowerPoint** | 8 slides: title, KPI cards, trend, four ranked charts, findings + recommendations | ~0.1 s |
| **CSV** | Flat register, 12 columns, UTF-8 BOM so Excel renders ₹ correctly | ~0.02 s |

All four honour the current filters and are built from the same payloads the screen renders — a
downloaded report can't disagree with the dashboard. The PDF is drawn with `pdf-lib` (vector, no
headless browser), so it works unchanged on serverless.

Endpoints are plain GETs, so any scheduler (cron, GitHub Actions, Vercel Cron) can fetch and email
them:

```
/api/report/pdf?years=FY%202022-23&sectors=Technology
```

---

## 6. Performance

`dataset.json` is dictionary-encoded and decoded once into `Int32Array`/`Float64Array` columns cached
on `globalThis`; every query is a single linear scan. Measured on this dataset:

| Operation | Time |
| --- | --- |
| `/api/breakdown` (any dimension) | 6–9 ms |
| `/api/insights` (full engine) | 35 ms |
| `/api/projects` (paginated) | 20 ms |
| `/api/summary` | 8–220 ms (cold) |
| CSV export, 32k rows | 130 ms |

No database, no query cache, no client-side data dump.

---

## 7. API

Filters are shared query params on every endpoint: `years`, `sectors`, `states`, `districts`,
`themes`, `companies`, `modes` (pipe-separated, e.g. `states=Goa|Kerala`), plus `search`, `minSpend`,
`maxSpend`, `aspirational=1`.

| Route | Purpose |
| --- | --- |
| `GET /api/meta` | Filter vocabularies, company list, capability map, dataset totals |
| `GET /api/summary` | KPIs, trend, top companies, sector/state/category/mode/district breakdowns |
| `GET /api/breakdown?dimension=` | Generic group-by (`company\|sector\|state\|district\|theme\|mode\|year`) with per-year series and YoY |
| `GET /api/projects` | Server-side paginated, sorted, searched rows |
| `GET /api/companies/:id` | Company drill-down |
| `GET /api/compare?companies=a\|b` | Side-by-side benchmarking (max 6) |
| `GET /api/insights` | Deterministic insight engine (`&narrate=1` adds LLM narration) |
| `POST /api/chat` | Grounded Q&A over a computed fact pack |
| `GET /api/report/{pdf\|xlsx\|pptx\|csv}` | Documents from the current filters |
| `GET /api/export` | CSV (legacy alias) |

Errors return `{ error, detail }`. A missing `data/dataset.json` returns **503** and the UI shows a
"run the ETL" screen instead of crashing.

---

## 8. Data caveats surfaced in the UI

These are properties of the source workbook, shown to the user rather than hidden:

1. **Project outlay is not summable.** For part of FY 2020-21 the workbook repeats a company-level
   outlay on every project row (HDFC's ₹407.74 Cr on ~200 rows). Aggregate outlay and any
   budget-utilisation ratio derived from it are therefore *not* charted; the per-project value is
   still shown in project registers as disclosed; aggregate utilisation is intentionally omitted.
2. **~33% of FY 2022-23 spend is filed as "Pan India"** and can't be mapped. It appears as a chip
   beside the choropleth and as a "gap" insight rather than being dropped.
3. **1,088 rows have no resolvable sector** even after backfilling from the per-sector sheets; they
   are grouped as `Unclassified` and flagged in Data Quality.
4. **292 rows disclose a project but no amount** — counted as projects, contributing ₹0.
5. **Reporting coverage varies by year** (982 → 830 companies), so year-on-year totals aren't strictly
   like-for-like. The insight engine says so explicitly.
6. **Obligation utilisation** compares the *latest year's* spend to the disclosed 2%-of-average-net-
   profit obligation, since the obligation is a single-year figure.

---

## 9. Folder structure

```
csr-dashboard/
├── data/
│   ├── raw/                     ← drop workbooks here (any number)
│   ├── dataset.json             ← generated: dictionary-encoded fact table
│   └── meta.json                ← generated: filter vocabularies + capabilities
├── scripts/etl.py               ← multi-workbook ETL
├── src/
│   ├── app/
│   │   ├── page.tsx             ← Executive Dashboard
│   │   ├── company-analysis/ state-analysis/ sector-analysis/ ngo-analysis/
│   │   ├── project-analytics/ ai-insights/ reports/ data-explorer/
│   │   ├── companies/[id]/      ← drill-down
│   │   └── api/                 ← meta, summary, breakdown, projects, compare,
│   │                              insights, chat, report/[format], export
│   ├── components/
│   │   ├── ui/                  ← button, card, table, select, popover, multi-select…
│   │   ├── layout/              ← sidebar, topbar, app-shell, theme toggle
│   │   ├── charts/              ← trend, company bar, sector pie, rank list, India map
│   │   ├── shared/              ← page frame, filter hook, breakdown table, export menu,
│   │   │                          "unavailable" panel
│   │   ├── dashboard/ company/ pages/
│   ├── lib/
│   │   ├── dataset.ts           ← query engine (typed arrays, all aggregations)
│   │   ├── insights.ts          ← forecast + anomaly + concentration engine
│   │   ├── llm.ts               ← optional narration / chat
│   │   ├── reports/builders.ts  ← PDF, Excel, PPTX generators
│   │   └── query.ts format.ts api.ts utils.ts
│   ├── store/filters.ts         ← Zustand filter store
│   └── types/index.ts
└── next.config.mjs · tailwind.config.ts · vercel.json · .env.example
```

---

## 10. Deployment

**Vercel**

```bash
vercel --prod
```

`next.config.mjs` sets `outputFileTracingIncludes` so `data/*.json` ships with the serverless
functions. Commit `data/dataset.json` (3.7 MB) or generate it in a build step; the raw `.xlsx` isn't
needed at runtime. Report routes declare `maxDuration` (60 s) for large Excel exports.

**Render / Railway / any Node host**

```
Build:  npm install && npm run build
Start:  npm start
Node:   20 or 22
```

Set `LLM_API_KEY` in the host's environment if you want the AI narration and chat.
