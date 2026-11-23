import { useFilterStore } from "@/store/filters";

/**
 * Guided-tour script. Each step points at one thing on screen, optionally
 * prepares the page first (`before`) and can "click" something with the
 * animated pointer (`click` + optional `action`).
 *
 * Targets are found with `data-tour` attributes on the filter bar, the sidebar
 * links, and — for page content — by the visible card title, so a renamed card
 * only needs its title updated here. A step whose target is missing still
 * shows, centred, so the tour never gets stuck.
 */

export type ChapterId =
  | "intro"
  | "filters"
  | "overview"
  | "insights"
  | "geography"
  | "sectors"
  | "aspirational"
  | "trends"
  | "ai"
  | "reports"
  | "data"
  | "glossary"
  | "finish";

export interface TourStep {
  id: string;
  chapter: ChapterId;
  /** Page this step belongs to; the tour navigates there first. */
  route?: string;
  /** What to spotlight. No target = centred card with a dimmed page. */
  target?: string | (() => Element | null);
  title: string;
  body: string;
  /** Small "watch this" line under the text, for live demos. */
  watch?: string;
  placement?: "auto" | "bottom" | "top" | "right" | "left";
  block?: ScrollLogicalPosition;
  /** Runs before the element is looked up (open a popup, close one...). */
  before?: () => void | Promise<void>;
  /** Element the pointer moves to and clicks. */
  click?: string | (() => Element | null);
  /** Replaces the real click (used when the click should be idempotent). */
  action?: () => void;
  /** Wait after the click before measuring again (ms). */
  settle?: number;
}

export const TOUR_CHAPTERS: Record<ChapterId, { label: string }> = {
  intro: { label: "Getting started" },
  filters: { label: "Filters" },
  overview: { label: "Overview" },
  insights: { label: "CSR Insights" },
  geography: { label: "CSR by Geography" },
  sectors: { label: "CSR by Sector" },
  aspirational: { label: "Aspirational Districts" },
  trends: { label: "Trends & Comparisons" },
  ai: { label: "AI-powered Insights" },
  reports: { label: "Reports & Downloads" },
  data: { label: "CSR Data" },
  glossary: { label: "Glossary" },
  finish: { label: "All done" },
};

/* ------------------------------------------------------------------ */
/* Finders                                                             */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const chip = (key: string) => `[data-tour="filter-${key}"]`;
const chipButton = (key: string) => `${chip(key)} > button`;
const popover = (key: string) => `${chip(key)} [data-tour="filter-popover"]`;
const nav = (href: string) => `.sidebar a.nav-item[href="${href}"]`;

/** Smallest element inside the page whose own text starts with `text`. */
function findText(text: string, root: ParentNode = document): HTMLElement | null {
  const scope = (root as Element).querySelector?.(".content") ?? root;
  const walker = document.createTreeWalker(scope as Node, NodeFilter.SHOW_TEXT);
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
    const heading = findText(title);
    return (heading?.closest(".card-surface, .card") as HTMLElement | null) ?? heading;
  };
}

/** A button or link by its visible text. */
function control(text: string, within?: string) {
  return () => {
    const root = within ? document.querySelector(within) : document;
    if (!root) return null;
    const needle = text.toLowerCase();
    const items = Array.from(root.querySelectorAll<HTMLElement>("button, a"));
    return items.find((item) => item.textContent?.replace(/\s+/g, " ").trim().toLowerCase().startsWith(needle)) ?? null;
  };
}

const pageHead = () => document.querySelector(".content .page-head");

/** Close every open filter popup (they close on any outside mousedown). */
function closePopups() {
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}

/** Make sure one filter popup is open, and only that one. */
async function openPopup(key: string) {
  if (document.querySelector(popover(key))) return;
  closePopups();
  await sleep(60);
  (document.querySelector(chipButton(key)) as HTMLButtonElement | null)?.click();
}

/** Latest regular financial year in the Financial Year popup. */
function latestYearOption(): HTMLElement | null {
  const options = Array.from(document.querySelectorAll<HTMLElement>(`${popover("years")} [data-value]`)).filter(
    (option) => !option.textContent?.includes("Earlier year"),
  );
  return options.sort((a, b) => (b.dataset.value ?? "").localeCompare(a.dataset.value ?? ""))[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Script                                                              */
/* ------------------------------------------------------------------ */

export const TOUR_STEPS: TourStep[] = [
  /* ---------- Getting started ---------- */
  {
    id: "welcome",
    chapter: "intro",
    route: "/",
    title: "Let's take a quick tour",
    body: "This dashboard brings together the CSR spending reported by Indian companies over the last five financial years. The purple pointer will show you where to click, and it will even use the filters for you so you can see what changes.",
    watch: "Press → or Next to move on. Press Esc to stop at any time.",
    before: closePopups,
  },
  {
    id: "sidebar",
    chapter: "intro",
    route: "/",
    target: ".sidebar .sidebar-scroll",
    placement: "right",
    title: "Pages are on the left",
    body: "Explore pages show where CSR money goes: by company, state, sector and aspirational district. Analyse pages show trends and AI findings. Resources has downloads, the full CSR data table and a glossary. Hover over any page name to see what it contains.",
  },

  /* ---------- Filters ---------- */
  {
    id: "filterbar",
    chapter: "filters",
    route: "/",
    target: ".filterbar",
    placement: "bottom",
    block: "start",
    title: "Filters work on every page",
    body: "Pick a filter once and every chart, card and table updates to match. Your selection stays the same when you move to another page, so you can follow one company, state or year across the whole dashboard.",
    before: closePopups,
  },
  {
    id: "geo",
    chapter: "filters",
    route: "/",
    target: chip("geography"),
    title: "Geography",
    body: "Choose a state to see only projects in that state. After picking a state you can narrow it down further to one district.",
  },
  {
    id: "geo-open",
    chapter: "filters",
    route: "/",
    target: popover("geography"),
    click: chipButton("geography"),
    action: () => {
      if (!document.querySelector(popover("geography"))) (document.querySelector(chipButton("geography")) as HTMLButtonElement | null)?.click();
    },
    title: "Search or scroll the list",
    body: "Type a few letters to find a state quickly, then click it. A second list of that state's districts appears. 'Pan India' means projects spread across the whole country.",
    watch: "The pointer opened the Geography filter for you.",
  },
  {
    id: "years",
    chapter: "filters",
    route: "/",
    target: chip("years"),
    before: closePopups,
    title: "Financial Year",
    body: "By default you see all five years together. Let's pick one year and watch the numbers change.",
  },
  {
    id: "years-open",
    chapter: "filters",
    route: "/",
    target: popover("years"),
    click: chipButton("years"),
    action: () => {
      if (!document.querySelector(popover("years"))) (document.querySelector(chipButton("years")) as HTMLButtonElement | null)?.click();
    },
    title: "Tick one or more years",
    body: "You can tick a single year or several. Years before FY 2020-21 are listed at the bottom but are not part of the default view.",
  },
  {
    id: "years-pick",
    chapter: "filters",
    route: "/",
    target: popover("years"),
    before: () => openPopup("years"),
    click: latestYearOption,
    action: () => {
      const option = latestYearOption();
      const value = option?.dataset.value;
      if (value) useFilterStore.getState().setValues("years", [value]);
    },
    settle: 700,
    title: "Selecting the latest year",
    body: "The pointer has ticked the latest financial year. The filter button turns purple to show it is in use.",
    watch: "Selected: the latest financial year.",
  },
  {
    id: "years-result",
    chapter: "filters",
    route: "/",
    target: ".content .kpi-row",
    before: closePopups,
    block: "center",
    title: "Every number has updated",
    body: "The cards now show that one year only: total CSR spent, companies, projects, districts, unspent CSR and aspirational districts. Charts and tables on every page follow the same filter.",
    watch: "Compare these numbers with the 5-year totals you saw before.",
  },
  {
    id: "clear",
    chapter: "filters",
    route: "/",
    target: '[data-tour="filter-clear"]',
    click: '[data-tour="filter-clear"]',
    action: () => useFilterStore.getState().clearAll(),
    title: "Clear All Filters",
    body: "One click removes every filter and takes you back to the full five-year picture. The number in brackets tells you how many filters are switched on.",
    watch: "The pointer just cleared the year filter.",
  },
  {
    id: "sector",
    chapter: "filters",
    route: "/",
    target: chip("sectors"),
    title: "Sector",
    body: "The industry the company belongs to, such as Banking, Oil & Gas or Technology. Use it to compare how much different industries spend on CSR.",
  },
  {
    id: "company",
    chapter: "filters",
    route: "/",
    target: chip("companies"),
    title: "Company Name",
    body: "Start typing a company's name to find it. Pick one company to see its own CSR story everywhere, or pick a few to compare them.",
  },
  {
    id: "domain",
    chapter: "filters",
    route: "/",
    target: chip("themes"),
    title: "Domain (Schedule VII area)",
    body: "What the CSR money was spent on: education, health care, environment, rural development and so on. These areas are set out in Schedule VII of the Companies Act.",
  },
  {
    id: "schedule7",
    chapter: "filters",
    route: "/",
    target: '[data-tour="filter-schedule7"]',
    title: "Not sure what Schedule VII is?",
    body: "This link opens a short official Government of India explainer in a new tab.",
  },
  {
    id: "agency",
    chapter: "filters",
    route: "/",
    target: chip("modes"),
    title: "Implementing Agency",
    body: "Who carried out the project: the company itself (direct), or an outside agency such as an NGO, trust or the company's own foundation.",
  },
  {
    id: "ownership",
    chapter: "filters",
    route: "/",
    target: chip("ownership"),
    title: "Company Ownership",
    body: "Private companies, central and state public sector companies (PSUs), public sector banks and insurers. Useful to compare government-owned and private CSR.",
  },
  {
    id: "amount",
    chapter: "filters",
    route: "/",
    target: popover("amount"),
    click: '[data-tour="filter-amount"] > button',
    action: () => {
      if (!document.querySelector(popover("amount"))) (document.querySelector('[data-tour="filter-amount"] > button') as HTMLButtonElement | null)?.click();
    },
    title: "CSR Spending Range",
    body: "Show only projects of a certain size, for example projects of more than ₹10 crore. Click a range again to remove it.",
    watch: "The pointer opened the spending ranges.",
  },
  {
    id: "search",
    chapter: "filters",
    route: "/",
    target: '[data-tour="filter-search"]',
    before: closePopups,
    title: "Search",
    body: "Type any word: a company, state, district or topic such as 'water' or 'schools'. Suggestions appear as you type; pick one to apply it as a filter.",
  },

  /* ---------- Overview ---------- */
  {
    id: "ov-head",
    chapter: "overview",
    route: "/",
    target: pageHead,
    block: "start",
    title: "Overview: the big picture",
    body: "This page sums up India's CSR at a glance. The buttons on the right refresh the data, download it, or open the trends page.",
  },
  {
    id: "ov-kpis",
    chapter: "overview",
    route: "/",
    target: ".content .kpi-row",
    title: "Key numbers",
    body: "Six headline numbers for your current filters. Click any card to open the page with the full detail behind it. Hover over the ⓘ icon for a plain explanation.",
  },
  {
    id: "ov-trend",
    chapter: "overview",
    route: "/",
    target: card("CSR Expenditure and Project Trends"),
    title: "Five-year trend",
    body: "The purple line is the money spent each year and the green line is the number of projects. Hover over a point to see the exact figures.",
  },
  {
    id: "ov-states",
    chapter: "overview",
    route: "/",
    target: card("Which States Receive"),
    title: "Top states and sectors",
    body: "The states and industry sectors with the most CSR spending. 'View all results' opens the full list on its own page.",
  },
  {
    id: "ov-download",
    chapter: "overview",
    route: "/",
    target: control("Download Data"),
    block: "start",
    title: "Download what you see",
    body: "Export the current selection as Excel, CSV, PDF or PowerPoint, ready to share.",
  },

  /* ---------- CSR Insights ---------- */
  {
    id: "nav-insights",
    chapter: "insights",
    route: "/",
    target: nav("/company-analysis"),
    placement: "right",
    title: "Next: CSR Insights",
    body: "Everything about companies: who spends the most, how they compare, what they were required to spend and what was left unspent.",
  },
  {
    id: "ins-table",
    chapter: "insights",
    route: "/company-analysis",
    target: card("Top Companies by CSR Expenditure"),
    block: "start",
    title: "Top companies",
    body: "Companies ranked by total CSR spent, with their share of all CSR, projects, latest-year spending, change from last year and unspent CSR. Click a column name to sort.",
  },
  {
    id: "ins-search",
    chapter: "insights",
    route: "/company-analysis",
    target: 'input[placeholder^="Search a company"]',
    title: "Find any company",
    body: "Type a name to jump to a company. Click a row or 'View Profile' to open that company's full CSR profile.",
  },
  {
    id: "ins-compare",
    chapter: "insights",
    route: "/company-analysis",
    target: () => findText("Company comparison"),
    title: "Compare companies side by side",
    body: "Add up to five companies to compare their spending year by year, the states they reach and their main focus areas.",
  },
  {
    id: "ins-unspent",
    chapter: "insights",
    route: "/company-analysis",
    target: card("Required, Spent and Unspent CSR by Year"),
    title: "Required, spent and unspent CSR",
    body: "From each company's annual CSR report: how much it had to spend (2% of average profit), how much it spent, and how much was left unspent.",
  },

  /* ---------- CSR by Geography ---------- */
  {
    id: "geo-page",
    chapter: "geography",
    route: "/state-analysis",
    target: pageHead,
    block: "start",
    title: "CSR by Geography",
    body: "Where CSR money is spent, state by state and district by district.",
  },
  {
    id: "geo-map",
    chapter: "geography",
    route: "/state-analysis",
    target: card("State-wise Total CSR Spent"),
    title: "The India map",
    body: "Darker states received more CSR money. Hover over a state for its figures, or click it to filter the whole dashboard to that state.",
  },
  {
    id: "geo-districts",
    chapter: "geography",
    route: "/state-analysis",
    target: card("Districts Ranked"),
    title: "Districts",
    body: "Districts ranked by CSR spent. Many projects do not name a district, so use this list for relative comparison rather than totals.",
  },

  /* ---------- CSR by Sector ---------- */
  {
    id: "sec-page",
    chapter: "sectors",
    route: "/sector-analysis",
    target: pageHead,
    block: "start",
    title: "CSR by Sector",
    body: "How spending splits by the company's industry, and by what the money was spent on (Schedule VII areas).",
  },
  {
    id: "sec-share",
    chapter: "sectors",
    route: "/sector-analysis",
    target: card("CSR Spent Share by Sector"),
    title: "Which industries give the most",
    body: "Each industry's share of total CSR spent. Click a sector to filter the dashboard to it.",
  },
  {
    id: "sec-themes",
    chapter: "sectors",
    route: "/sector-analysis",
    target: card("CSR Expenditure Across Schedule VII"),
    title: "What the money was spent on",
    body: "Each box is a Schedule VII area; bigger boxes received more money. The tiles above it name the leading and second-largest areas.",
  },

  /* ---------- Aspirational districts ---------- */
  {
    id: "asp-page",
    chapter: "aspirational",
    route: "/aspirational-districts",
    target: pageHead,
    block: "start",
    title: "Aspirational Districts",
    body: "NITI Aayog has named 112 districts that lag furthest behind on health, education, farming and basic services. This page shows how much CSR reaches them.",
  },
  {
    id: "asp-pick",
    chapter: "aspirational",
    route: "/aspirational-districts",
    target: control("All aspirational districts"),
    title: "Look at one district",
    body: "Pick a single aspirational district here to see its own spending and the companies funding it. This choice only affects this page.",
  },
  {
    id: "asp-cards",
    chapter: "aspirational",
    route: "/aspirational-districts",
    target: () => findText("CSR Spent in Aspirational Districts")?.closest(".grid") ?? null,
    title: "How much reaches them",
    body: "Total CSR spent in these districts, the companies funding them, how many of the 112 districts got at least one project, and the biggest contributor.",
  },

  /* ---------- Trends ---------- */
  {
    id: "tr-page",
    chapter: "trends",
    route: "/trend-analysis",
    target: ".content .kpi-row",
    block: "start",
    title: "Trends & Comparisons",
    body: "Growth at a glance: the latest year's spending, the change from last year, the average yearly growth and a projection for next year.",
  },
  {
    id: "tr-sectors",
    chapter: "trends",
    route: "/trend-analysis",
    target: card("Sectors with Increased CSR Spending"),
    title: "Which sectors changed most",
    body: "Sectors that spent more this year than last year, and (next to it) sectors that spent less. Each row shows both years' amounts and the % change.",
  },

  /* ---------- AI ---------- */
  {
    id: "ai-page",
    chapter: "ai",
    route: "/ai-insights",
    target: pageHead,
    block: "start",
    title: "AI-powered Insights",
    body: "Automatic findings about your current selection, such as unusual jumps or falls, written in plain language.",
  },
  {
    id: "ai-ask",
    chapter: "ai",
    route: "/ai-insights",
    target: card("Natural Language Search"),
    title: "Ask a question",
    body: "Type a question in everyday words, for example 'Which companies spent most on education in Karnataka?', and get an answer from the data.",
  },

  /* ---------- Reports ---------- */
  {
    id: "rep-page",
    chapter: "reports",
    route: "/reports",
    target: pageHead,
    block: "start",
    title: "Reports & Downloads",
    body: "Ready-made reports in PDF, Excel, PowerPoint and CSV. Everything is built from your current filters, so set the filters first, then download.",
  },

  /* ---------- CSR Data ---------- */
  {
    id: "data-table",
    chapter: "data",
    route: "/data-explorer",
    target: card("CSR Data"),
    block: "start",
    title: "CSR Data: every project",
    body: "The complete list of reported CSR projects for your filters: company, year, project, Schedule VII area, sector, location and amount. Click a column name to sort.",
  },
  {
    id: "data-columns",
    chapter: "data",
    route: "/data-explorer",
    target: control("Columns"),
    title: "Choose columns and export",
    body: "Show or hide columns such as district, implementing agency or approved outlay. 'Export' downloads exactly what you see.",
  },

  /* ---------- Glossary ---------- */
  {
    id: "glossary",
    chapter: "glossary",
    route: "/glossary",
    target: pageHead,
    block: "start",
    title: "Glossary",
    body: "Not sure what a term means? Unspent CSR, Schedule VII, implementing agency and more are explained here in simple words.",
  },

  /* ---------- Finish ---------- */
  {
    id: "finish",
    chapter: "finish",
    route: "/",
    target: '[data-tour="tour-button"]',
    placement: "bottom",
    title: "You're ready to explore",
    body: "That's the whole dashboard. You can replay the tour, or a tour of just the page you are on, any time from this Tour button.",
    before: closePopups,
  },
];
