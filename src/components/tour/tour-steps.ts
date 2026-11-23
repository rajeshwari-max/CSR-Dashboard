import { selectFilters, useFilterStore, type ListKey } from "@/store/filters";
import type { Filters } from "@/types";

/**
 * Guided-tour script.
 *
 * The tour is made of small lessons the visitor can pick from a menu:
 *  - a filter lesson: open the filter, pick something yourself, see what
 *    changed, then keep it or clear it;
 *  - a page lesson: the pointer clicks the page in the sidebar, then points
 *    out the main parts of that page (any filter you kept stays on).
 * "Quick start" is one filter + one page. "Full tour" strings everything
 * together with checkpoints, so the visitor can stop whenever they have seen
 * enough.
 *
 * Targets use `data-tour` attributes (filter bar), sidebar links, and visible
 * card titles. A step whose target is missing still shows, centred.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TourChoice {
  label: string;
  primary?: boolean;
  run?: () => void | Promise<void>;
  /** Where to go after `run`: next step, back one step, the menu, or close. */
  go: "next" | "back" | "menu" | "end";
}

export interface TourStep {
  id: string;
  /** Short label shown at the top of the card (e.g. "Financial Year"). */
  section: string;
  /** Page this step belongs to; the tour navigates there first. */
  route?: string;
  /** What to spotlight. No target = centred card with a dimmed page. */
  target?: string | (() => Element | null);
  title: string;
  body: string | (() => string);
  /** Small highlighted line for live demos / instructions. */
  watch?: string | (() => string);
  placement?: "auto" | "bottom" | "top" | "right" | "left";
  block?: ScrollLogicalPosition;
  /** Runs before the element is looked up (open a popup, close one...). */
  before?: () => void | Promise<void>;
  /** Element the pointer moves to and clicks (a real click unless `action`). */
  click?: string | (() => Element | null);
  /** Replaces the real click (used when the click should be idempotent). */
  action?: () => void;
  /** After the click, wait until the browser is on this page. */
  awaitRoute?: string;
  settle?: number;
  /**
   * The visitor does something themselves. The spotlight becomes clickable,
   * Next unlocks once `done` is true, and "help" does it for them.
   */
  interactive?: {
    done: (start: Filters, now: Filters) => boolean;
    helpLabel?: string;
    help?: () => void | Promise<void>;
    autoNext?: boolean;
  };
  /** Buttons that replace Next (keep / clear / change...). */
  choices?: TourChoice[];
  /** Show the "Filters on: ..." strip on the card. */
  showFilters?: boolean;
}

export interface Lesson {
  id: string;
  label: string;
  hint: string;
  steps: TourStep[];
}

/* ------------------------------------------------------------------ */
/* Finders & helpers                                                   */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const store = () => useFilterStore.getState();
export const currentFilters = () => selectFilters(useFilterStore.getState());

const chip = (key: string) => `[data-tour="filter-${key}"]`;
const chipButton = (key: string) => `${chip(key)} > button`;
const popover = (key: string) => `${chip(key)} [data-tour="filter-popover"]`;
const nav = (href: string) => `.sidebar a.nav-item[href="${href}"]`;

/** Smallest element inside the page whose own text starts with `text`. */
export function findText(text: string): HTMLElement | null {
  const scope = document.querySelector(".content") ?? document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const needle = text.toLowerCase();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue?.replace(/\s+/g, " ").trim().toLowerCase();
    if (value && value.startsWith(needle)) {
      const element = node.parentElement;
      if (element && element.getBoundingClientRect().width > 0) return element;
    }
  }
  return null;
}

/** The card (or section) that has this title. */
function card(title: string) {
  return () => {
    // Prefer real card titles (section labels can repeat the same words).
    const needle = title.toLowerCase();
    const headings = Array.from(document.querySelectorAll<HTMLElement>(".content h1, .content h2, .content h3, .content .metric-title"));
    const heading =
      headings.find((el) => el.textContent?.replace(/\s+/g, " ").trim().toLowerCase().startsWith(needle) && el.getBoundingClientRect().width > 0) ??
      findText(title);
    return (heading?.closest(".card-surface, .card") as HTMLElement | null) ?? heading;
  };
}

/** A button or link by its visible text. */
function control(text: string) {
  return () => {
    const needle = text.toLowerCase();
    const items = Array.from(document.querySelectorAll<HTMLElement>(".content button, .content a"));
    return items.find((item) => item.textContent?.replace(/\s+/g, " ").trim().toLowerCase().startsWith(needle)) ?? null;
  };
}

const pageHead = () => document.querySelector(".content .page-head");
const kpis = () => document.querySelector(".content .kpi-row");

/** Close every open filter popup (they close on any outside mousedown). */
export function closePopups() {
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}

async function openPopup(key: string) {
  if (document.querySelector(popover(key))) return;
  closePopups();
  await sleep(60);
  (document.querySelector(chipButton(key)) as HTMLButtonElement | null)?.click();
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

/** Did anything in the filters change since the step started? */
export function filtersChanged(a: Filters, b: Filters) {
  return (
    !sameList(a.years, b.years) ||
    !sameList(a.states, b.states) ||
    !sameList(a.districts, b.districts) ||
    !sameList(a.sectors, b.sectors) ||
    !sameList(a.companies, b.companies) ||
    !sameList(a.themes, b.themes) ||
    !sameList(a.modes, b.modes) ||
    !sameList(a.ownership, b.ownership) ||
    a.search !== b.search ||
    a.minSpend !== b.minSpend ||
    a.maxSpend !== b.maxSpend
  );
}

/** "FY 2024-25 · Maharashtra · 2 companies" — short summary for the card. */
export function describeFilters(f: Filters): string {
  const parts: string[] = [];
  const list = (values: string[], noun: string) =>
    values.length === 1 ? values[0] : values.length > 1 ? `${values.length} ${noun}` : null;
  const push = (value: string | null) => value && parts.push(value);
  push(list(f.years, "years"));
  push(f.districts.length ? list(f.districts, "districts") : list(f.states, "states"));
  push(list(f.sectors, "sectors"));
  push(f.companies.length ? (f.companies.length === 1 ? "1 company" : `${f.companies.length} companies`) : null);
  push(list(f.themes, "Schedule VII areas"));
  push(list(f.modes, "agency types"));
  push(list(f.ownership, "ownership types"));
  if (f.minSpend !== null || f.maxSpend !== null)
    push(f.maxSpend === null ? `Projects over ₹${f.minSpend} Cr` : `Projects ₹${f.minSpend ?? 0}–${f.maxSpend} Cr`);
  if (f.search) push(`“${f.search}”`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Filter lessons                                                      */
/* ------------------------------------------------------------------ */

interface FilterDef {
  id: string;
  key: string; // data-tour key
  label: string;
  what: string;
  pickText: string;
  /** Does the filter (still) hold a value? */
  has: (f: Filters) => boolean;
  clear: () => void;
  /** Pick a sample value for the visitor ("Do it for me"). */
  sample: () => void | Promise<void>;
}

function firstOption(key: string, skip: (text: string) => boolean = () => false) {
  const options = Array.from(document.querySelectorAll<HTMLElement>(`${popover(key)} [data-value]`));
  return options.find((option) => !skip(option.textContent ?? "")) ?? null;
}

function latestYearOption(): HTMLElement | null {
  const options = Array.from(document.querySelectorAll<HTMLElement>(`${popover("years")} [data-value]`)).filter(
    (option) => !option.textContent?.includes("Earlier year"),
  );
  return options.sort((a, b) => (b.dataset.value ?? "").localeCompare(a.dataset.value ?? ""))[0] ?? null;
}

const listFilter = (key: ListKey) => ({
  has: (f: Filters) => f[key].length > 0,
  clear: () => store().clearKey(key),
});

const FILTERS: FilterDef[] = [
  {
    id: "years",
    key: "years",
    label: "Financial Year",
    what: "Shows CSR for the years you pick. By default you see all five years added together.",
    pickText: "Tick one or more years in the list. The numbers update as soon as you tick.",
    ...listFilter("years"),
    sample: async () => {
      await openPopup("years");
      await sleep(200);
      const value = latestYearOption()?.dataset.value;
      if (value) store().setValues("years", [value]);
    },
  },
  {
    id: "geography",
    key: "geography",
    label: "Geography",
    what: "Shows only projects in the state you pick. After choosing a state you can narrow it to one district.",
    pickText: "Type or scroll to a state and click it. A list of its districts appears if you want to go further.",
    has: (f) => f.states.length > 0 || f.districts.length > 0,
    clear: () => {
      store().clearKey("states");
      store().clearKey("districts");
    },
    sample: () => {
      store().setValues("states", ["Maharashtra"]);
      store().setValues("districts", []);
    },
  },
  {
    id: "sectors",
    key: "sectors",
    label: "Sector",
    what: "The industry a company belongs to, such as Banking, Oil & Gas or Technology.",
    pickText: "Tick one or more sectors. Use the search box at the top of the list to find one quickly.",
    ...listFilter("sectors"),
    sample: async () => {
      await openPopup("sectors");
      await sleep(200);
      const value = firstOption("sectors")?.dataset.value;
      if (value) store().setValues("sectors", [value]);
    },
  },
  {
    id: "companies",
    key: "companies",
    label: "Company Name",
    what: "Follow one company, or a few, across the whole dashboard.",
    pickText: "Type part of a company's name, then tick it. You can tick several to compare them.",
    ...listFilter("companies"),
    sample: async () => {
      await openPopup("companies");
      await sleep(200);
      const value = firstOption("companies")?.dataset.value;
      if (value) store().setValues("companies", [value]);
    },
  },
  {
    id: "themes",
    key: "themes",
    label: "Domain (Schedule VII area)",
    what: "What the money was spent on: education, health care, environment, rural development and so on.",
    pickText: "Tick one or more areas. The link next to this filter explains Schedule VII.",
    ...listFilter("themes"),
    sample: async () => {
      await openPopup("themes");
      await sleep(200);
      const value = firstOption("themes")?.dataset.value;
      if (value) store().setValues("themes", [value]);
    },
  },
  {
    id: "modes",
    key: "modes",
    label: "Implementing Agency",
    what: "Who carried out the project: the company itself, or an outside agency such as an NGO or the company's foundation.",
    pickText: "Tick 'Direct' or 'Implementing agency' (or both).",
    ...listFilter("modes"),
    sample: async () => {
      await openPopup("modes");
      await sleep(200);
      const value = firstOption("modes")?.dataset.value;
      if (value) store().setValues("modes", [value]);
    },
  },
  {
    id: "ownership",
    key: "ownership",
    label: "Company Ownership",
    what: "Private companies, public sector companies (PSUs), public sector banks and insurers.",
    pickText: "Tick one type, for example 'Central PSU', to see only government-owned companies.",
    ...listFilter("ownership"),
    sample: async () => {
      await openPopup("ownership");
      await sleep(200);
      const value = firstOption("ownership")?.dataset.value;
      if (value) store().setValues("ownership", [value]);
    },
  },
  {
    id: "amount",
    key: "amount",
    label: "CSR Spending Range",
    what: "Shows only projects of a certain size, for example projects of more than ₹10 crore.",
    pickText: "Click one of the ranges. Click the same range again to remove it.",
    has: (f) => f.minSpend !== null || f.maxSpend !== null,
    clear: () => store().setRange(null, null),
    sample: () => store().setRange(10, null),
  },
];

/** Three steps per filter: open it, pick something, see the result and decide. */
function filterLesson(def: FilterDef, route = "/"): TourStep[] {
  const isAmount = def.key === "amount";
  const button = isAmount ? '[data-tour="filter-amount"] > button' : chipButton(def.key);
  return [
    {
      id: `${def.id}-open`,
      section: def.label,
      route,
      target: chip(def.key),
      before: closePopups,
      title: `Click “${def.label}”`,
      body: def.what,
      watch: "Click the highlighted button to open it.",
      interactive: {
        done: () => Boolean(document.querySelector(popover(def.key))),
        helpLabel: "Open it for me",
        help: () => (document.querySelector(button) as HTMLButtonElement | null)?.click(),
        autoNext: true,
      },
    },
    {
      id: `${def.id}-pick`,
      section: def.label,
      route,
      target: popover(def.key),
      before: () => openPopup(def.key),
      placement: "right",
      title: "Now choose an option",
      body: def.pickText,
      watch: "Pick anything you like; you can change or clear it in the next step.",
      interactive: {
        done: (start, now) => filtersChanged(start, now) && def.has(now),
        helpLabel: "Pick one for me",
        help: def.sample,
      },
    },
    {
      id: `${def.id}-result`,
      section: def.label,
      route,
      target: route === "/" ? kpis : pageHead,
      before: closePopups,
      title: "See what changed",
      body: () => {
        const summary = describeFilters(currentFilters());
        return `${summary ? `Now showing only: ${summary}. ` : ""}Every card, chart and table updated to match, and this filter stays on when you open other pages. The filter button turns purple while it is in use.`;
      },
      watch: "Keep it to see it on the next page, or clear it to go back to all data.",
      showFilters: true,
      choices: [
        { label: "Change selection", go: "back" },
        { label: "Clear & continue", run: def.clear, go: "next" },
        { label: "Keep & continue", primary: true, go: "next" },
      ],
    },
  ];
}

function searchLesson(): TourStep[] {
  return [
    {
      id: "search-try",
      section: "Search",
      route: "/",
      target: '[data-tour="filter-search"]',
      before: closePopups,
      title: "Search for anything",
      body: "Type a company, state, district or topic (for example 'water' or 'Tata'), then click a suggestion to apply it as a filter.",
      watch: "Click the search box and try it.",
      interactive: {
        done: (start, now) => filtersChanged(start, now),
        helpLabel: "Search for me",
        help: () => store().setSearch("education"),
      },
    },
    {
      id: "search-result",
      section: "Search",
      route: "/",
      target: kpis,
      title: "See what changed",
      body: () => {
        const summary = describeFilters(currentFilters());
        return `${summary ? `Now showing only: ${summary}. ` : ""}The whole dashboard now follows your search.`;
      },
      showFilters: true,
      choices: [
        { label: "Clear & continue", run: () => store().setSearch(""), go: "next" },
        { label: "Keep & continue", primary: true, go: "next" },
      ],
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Page lessons                                                        */
/* ------------------------------------------------------------------ */

interface PageDef {
  id: string;
  href: string;
  label: string;
  hint: string;
  intro: string;
  steps: Omit<TourStep, "section" | "route">[];
}

const PAGES: PageDef[] = [
  {
    id: "overview",
    href: "/",
    label: "Overview",
    hint: "The big picture in one screen",
    intro: "A one-screen summary of India's CSR: headline numbers, the five-year trend, and the top states and sectors.",
    steps: [
      {
        id: "ov-kpis",
        target: kpis,
        title: "Key numbers",
        body: "Six headline numbers for your current filters. Click any card to open the page with the detail behind it, and hover over ⓘ for a plain explanation.",
      },
      {
        id: "ov-trend",
        target: card("CSR Expenditure and Project Trends"),
        title: "Five-year trend",
        body: "Purple is the money spent each year; green is the number of projects. Hover over a point for the exact figures.",
      },
      {
        id: "ov-download",
        target: control("Download Data"),
        block: "start",
        title: "Download what you see",
        body: "Export the current selection as Excel, CSV, PDF or PowerPoint.",
      },
    ],
  },
  {
    id: "insights",
    href: "/company-analysis",
    label: "CSR Insights",
    hint: "Top companies, comparisons, unspent CSR",
    intro: "Everything about companies: who spends the most, how they compare, and what they were required to spend but left unspent.",
    steps: [
      {
        id: "ins-table",
        target: card("Top Companies by CSR Expenditure"),
        block: "start",
        title: "Top companies",
        body: "Companies ranked by CSR spent, with their share of all CSR, projects, latest-year spending, change from last year and unspent CSR. Click a column name to sort, or a row to open that company's profile.",
      },
      {
        id: "ins-compare",
        target: () => findText("Company comparison"),
        title: "Compare companies",
        body: "Add up to five companies to compare their spending year by year, the states they reach and their main focus areas.",
      },
      {
        id: "ins-unspent",
        target: card("Required, Spent and Unspent CSR by Year"),
        title: "Required, spent and unspent",
        body: "From company CSR reports: how much companies had to spend (2% of average profit), how much they spent, and how much was left unspent.",
      },
    ],
  },
  {
    id: "geography",
    href: "/state-analysis",
    label: "CSR by Geography",
    hint: "India map, states and districts",
    intro: "Where CSR money is spent, state by state and district by district.",
    steps: [
      {
        id: "geo-map",
        target: card("State-wise Total CSR Spent"),
        title: "The India map",
        body: "Darker states received more CSR money. Hover over a state for its figures, or click it to filter the whole dashboard to that state.",
      },
      {
        id: "geo-districts",
        target: card("Districts Ranked"),
        title: "Districts",
        body: "Districts ranked by CSR spent. Many projects do not name a district, so use this for comparison rather than totals.",
      },
    ],
  },
  {
    id: "sectors",
    href: "/sector-analysis",
    label: "CSR by Sector",
    hint: "Industries and Schedule VII areas",
    intro: "How spending splits by the company's industry, and by what the money was spent on.",
    steps: [
      {
        id: "sec-share",
        target: card("CSR Spent Share by Sector"),
        title: "Which industries give the most",
        body: "Each industry's share of total CSR spent. Click a sector to filter the dashboard to it.",
      },
      {
        id: "sec-themes",
        target: card("CSR Expenditure Across Schedule VII"),
        title: "What the money was spent on",
        body: "Each box is a Schedule VII area; bigger boxes received more money.",
      },
    ],
  },
  {
    id: "aspirational",
    href: "/aspirational-districts",
    label: "Aspirational Districts",
    hint: "CSR in India's 112 most backward districts",
    intro: "NITI Aayog has named 112 districts that lag furthest behind on health, education, farming and basic services. This page shows how much CSR reaches them.",
    steps: [
      {
        id: "asp-cards",
        target: () => findText("CSR Spent in Aspirational Districts")?.closest(".grid") ?? null,
        title: "How much reaches them",
        body: "CSR spent in these districts, the companies funding them, how many of the 112 got at least one project, and the biggest contributor.",
      },
      {
        id: "asp-pick",
        target: control("All aspirational districts"),
        title: "Look at one district",
        body: "Pick a single aspirational district here to see its own figures. This choice only affects this page.",
      },
    ],
  },
  {
    id: "trends",
    href: "/trend-analysis",
    label: "Trends & Comparisons",
    hint: "Growth, change from last year, rising and falling sectors",
    intro: "How CSR spending has grown, and which sectors spent more or less than last year.",
    steps: [
      {
        id: "tr-kpis",
        target: kpis,
        block: "start",
        title: "Growth at a glance",
        body: "The latest year's spending, the change from last year, the average yearly growth and a projection for next year.",
      },
      {
        id: "tr-sectors",
        target: card("Sectors with Increased CSR Spending"),
        title: "Sectors that changed most",
        body: "Sectors that spent more than last year, and next to it, sectors that spent less. Each row shows both years and the % change.",
      },
    ],
  },
  {
    id: "ai",
    href: "/ai-insights",
    label: "AI-powered Insights",
    hint: "Automatic findings and questions in plain words",
    intro: "Automatic findings about your current selection, and a box where you can ask questions in everyday words.",
    steps: [
      {
        id: "ai-ask",
        target: card("Natural Language Search"),
        title: "Ask a question",
        body: "For example: 'Which companies spent most on education in Karnataka?'. The answer comes straight from the data.",
      },
    ],
  },
  {
    id: "reports",
    href: "/reports",
    label: "Reports & Downloads",
    hint: "PDF, Excel, PowerPoint, CSV",
    intro: "Ready-made reports built from your current filters. Set the filters first, then download.",
    steps: [],
  },
  {
    id: "data",
    href: "/data-explorer",
    label: "CSR Data",
    hint: "Every reported project in one table",
    intro: "The complete list of reported CSR projects for your filters.",
    steps: [
      {
        id: "data-columns",
        target: control("Columns"),
        title: "Choose columns and export",
        body: "Show or hide columns such as district or implementing agency. 'Export' downloads exactly what you see.",
      },
    ],
  },
  {
    id: "glossary",
    href: "/glossary",
    label: "Glossary",
    hint: "CSR terms in simple words",
    intro: "Unspent CSR, Schedule VII, implementing agency and other terms explained simply.",
    steps: [],
  },
];

/** Pointer clicks the page in the sidebar, then the page's own steps. */
function pageLesson(page: PageDef): TourStep[] {
  return [
    {
      id: `${page.id}-nav`,
      section: page.label,
      target: nav(page.href),
      click: nav(page.href),
      awaitRoute: page.href,
      placement: "right",
      title: `Opening ${page.label}`,
      body: page.intro,
      watch: "The pointer clicked this page in the menu for you.",
      showFilters: true,
    },
    ...page.steps.map((step) => ({ ...step, section: page.label, route: page.href, showFilters: true })),
  ];
}

/* ------------------------------------------------------------------ */
/* Intro, checkpoints and the menu                                     */
/* ------------------------------------------------------------------ */

const INTRO: TourStep[] = [
  {
    id: "welcome",
    section: "Getting started",
    route: "/",
    before: closePopups,
    title: "Let's take a quick tour",
    body: "You will try a filter yourself and see one page. The pointer shows you where to click; you do the clicking.",
    watch: "Use → / ← or the buttons to move. Esc stops the tour.",
  },
  {
    id: "filterbar",
    section: "Getting started",
    route: "/",
    target: ".filterbar",
    block: "start",
    before: closePopups,
    title: "Filters work on every page",
    body: "Pick a filter once and every chart, card and table updates, on this page and on every other page you open.",
  },
];

const checkpoint = (id: string, title: string, body: string): TourStep => ({
  id,
  section: "Checkpoint",
  before: closePopups,
  title,
  body,
  showFilters: true,
  choices: [
    { label: "I'm done", go: "end" },
    { label: "Back to menu", go: "menu" },
    { label: "Continue", primary: true, go: "next" },
  ],
});

const OTHER_FILTERS_GLANCE: TourStep[] = FILTERS.filter((def) => def.id !== "years").map((def) => ({
  id: `${def.id}-glance`,
  section: "Other filters",
  route: "/",
  target: chip(def.key),
  before: closePopups,
  title: def.label,
  body: `${def.what} You can try it yourself from the tour menu.`,
}));

const FINISH: TourStep = {
  id: "finish",
  section: "All done",
  target: '[data-tour="tour-button"]',
  before: closePopups,
  title: "You're ready to explore",
  body: "Open this Tour button any time to try another filter or page. Filters you kept are still on; use Clear All Filters to remove them.",
  showFilters: true,
  choices: [
    { label: "Back to menu", go: "menu" },
    { label: "Finish", primary: true, go: "end" },
  ],
};

export const FILTER_LESSONS: Lesson[] = [
  ...FILTERS.map((def) => ({ id: `filter-${def.id}`, label: def.label, hint: def.what.split(".")[0], steps: filterLesson(def) })),
  { id: "filter-search", label: "Search", hint: "Find a company, place or topic by typing", steps: searchLesson() },
];

export const PAGE_LESSONS: Lesson[] = PAGES.map((page) => ({
  id: `page-${page.id}`,
  label: page.label,
  hint: page.hint,
  steps: pageLesson(page),
}));

const yearsLesson = FILTER_LESSONS.find((lesson) => lesson.id === "filter-years")!.steps;
const insightsLesson = PAGE_LESSONS.find((lesson) => lesson.id === "page-insights")!.steps;

/** One filter you try yourself + one page. About two minutes. */
export const QUICK_START: TourStep[] = [...INTRO, ...yearsLesson, ...insightsLesson, FINISH];

/** Everything, with checkpoints so the visitor can stop at any point. */
export const FULL_TOUR: TourStep[] = [
  ...INTRO,
  ...yearsLesson,
  checkpoint("cp-filters", "Want a quick look at the other filters?", "Next: one short step for each of the other filters. You can stop here or go back to the menu."),
  ...OTHER_FILTERS_GLANCE,
  ...PAGE_LESSONS.flatMap((lesson, index) =>
    index === 0
      ? lesson.steps
      : [checkpoint(`cp-${lesson.id}`, `Next: ${lesson.label}`, `${PAGES[index].intro}`), ...lesson.steps],
  ),
  FINISH,
];
