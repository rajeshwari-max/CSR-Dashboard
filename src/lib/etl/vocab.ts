/**
 * Canonical vocabularies + column recognition, ported from scripts/etl.py so
 * that an in-app upload cleans data exactly the way the CLI pipeline does.
 * Both paths must stay in step — this file is the single source for the rules.
 */

export const REQUIRED_COLUMNS: Record<string, string[]> = {
  company: ["Company Name", "Company name", "Company"],
  spent: ["Amount Spent (INR Cr.)", "Amount_Spent", "Amount Spent", "CSR Spent"],
};

export const CORE_COLUMNS: Record<string, string[]> = {
  cin: ["Unnamed: 0", "CIN", "Corporate Identity Number"],
  sector: ["BRSR", "Sector", "Industry"],
  year: ["YEAR", "Year", "Financial Year", "FY"],
  project: ["CSR Project(s)", "CSR Project", "CSR_project", "Project Name"],
  theme: ["Thematic area", "Development_Sector", "Schedule VII", "Thematic Area"],
  state: ["State"],
  district: ["District", "Aspirational District"],
  outlay: ["Project Amount Outlay (INR Cr.)", "Project_Amount_Outlay", "Project Outlay"],
  mode: ["Mode of Implementation", "Mode_of_Implementation"],
  co_outlay: ["Total Amount Outlay(INR CR)"],
  co_spent: ["Total Amount Spent (INR CR)"],
  obligation: ["Total CSR Obligation As CSR Report", "CSR Obligation"],
  two_pct: ["2 % of Average Net Profit", "2 % Net Profit"],
  avg_profit: ["Average Net Profit (INR Crores)", "Average Net Profit"],
  policy: ["CSR POLICY", "CSR Policy"],
  annual_report: ["Annual Report"],
  brsr_report: ["BRSR Report"],
  csr_report: ["CSR Report"],
  esg_report: ["ESG report"],
  head: ["CSR head", "HEAD OF THE COMMISSION"],
  email: ["email id", "EMAIL-ID", "Email"],
  phone: ["phone no", "CONTACT NUMBER", "Phone"],
  listed: ["Listed/Unlisted"],
  company_type: ["Company Type", "Class"],
};

export const OPTIONAL_COLUMNS: Record<string, string[]> = {
  ngo: [
    "NGO", "NGO Name", "Implementing Agency", "Implementing Agency Name", "Agency Name",
    "Partner", "Partner Name", "Executing Agency", "CSR Registration Number", "Implementing Entity",
  ],
  beneficiaries: [
    "Beneficiaries", "Beneficiaries Reached", "No. of Beneficiaries",
    "Number of Beneficiaries", "Lives Impacted", "Persons Benefited",
  ],
  status: ["Status", "Project Status", "Implementation Status"],
  start_date: ["Start Date", "Project Start Date", "Commencement Date"],
  end_date: ["End Date", "Project End Date", "Completion Date"],
  sdg: ["SDG goals", "SDG", "SDG Goals", "SDG Mapping"],
  duration: ["Project Duration", "Duration"],
};

export const SECTOR_ALIASES: Record<string, string> = {
  technology: "Technology", technologies: "Technology", tech: "Technology",
  pharmaceuticals: "Biotechnology & Pharmaceuticals",
  "biotechnology & pharmaceuticals": "Biotechnology & Pharmaceuticals",
  "paper and forestry": "Forestry & Paper", "forestry & paper": "Forestry & Paper",
  textiles: "Apparel & Textiles", "apparel & textiles": "Apparel & Textiles",
  "healthcare provider": "Health Care Providers", "health care provider": "Health Care Providers",
  "health care providers": "Health Care Providers", "health care retail": "Health Care Retail",
  construction: "Construction Materials", "construction materials": "Construction Materials",
  aviation: "Air Transportation", "air transportation": "Air Transportation",
  manufacturing: "Industrials", industrials: "Industrials",
  semiconductor: "Semiconductors", semiconductors: "Semiconductors",
  resturants: "Restaurants", restaurants: "Restaurants",
  "medical technology": "Medical Technology",
  "sector agnosic": "Sector Agnostic", "sector agnostic": "Sector Agnostic",
  "corporate and retail banking": "Corporate & Retail Banking",
  "corporate & retail banking": "Corporate & Retail Banking",
  "oil and gas": "Oil & Gas", "oil & gas": "Oil & Gas",
  coal: "Coal", insurance: "Insurance", media: "Media", utilities: "Utilities",
  food: "Food", beverages: "Beverages", "capital markets": "Capital Markets",
  "waste management": "Waste Management", "marine transportation": "Marine Transportation",
  "land transportation": "Land Transportation",
  "consumer service": "Consumer Services", "consumer services": "Consumer Services",
  "consumer goods retail": "Consumer Goods Retail",
  "consumer discretionary products": "Consumer Discretionary Products",
  "food & beverage retail": "Food & Beverage Retail",
  "internet media & services": "Internet Media & Services",
  "hospitality & recreation": "Hospitality & Recreation",
  "real estate": "Real Estate", infrastructure: "Infrastructure",
  "alternative energy": "Alternative Energy", chemicals: "Chemicals",
  "metals & mining": "Metals & Mining", automobiles: "Automobiles",
  telecommunications: "Telecommunications", tobacco: "Tobacco",
  education: "Unclassified", "unable to classify": "Unclassified",
};

export const STATE_ALIASES: Record<string, string> = {
  orissa: "Odisha", odisha: "Odisha",
  uttaranchal: "Uttarakhand", uttarakhand: "Uttarakhand",
  pondicherry: "Puducherry", puducherry: "Puducherry",
  "jammu and kashmir": "Jammu and Kashmir", "jammu & kashmir": "Jammu and Kashmir",
  "leh & ladakh": "Ladakh", ladakh: "Ladakh", "leh and ladakh": "Ladakh",
  "andaman and nicobar": "Andaman and Nicobar Islands",
  "andaman & nicobar": "Andaman and Nicobar Islands",
  "andaman and nicobar islands": "Andaman and Nicobar Islands",
  "dadra and nagar haveli": "Dadra and Nagar Haveli",
  "dadra & nagar haveli": "Dadra and Nagar Haveli",
  "daman and diu": "Daman and Diu", "daman & diu": "Daman and Diu",
  "nct of delhi": "Delhi", "new delhi": "Delhi", delhi: "Delhi",
  tamilnadu: "Tamil Nadu", "tamil nadu": "Tamil Nadu",
  "pan india": "Pan India",
  "pan india (other centralised funds)": "Pan India",
  "pan india (other centralized funds)": "Pan India",
  "pan-india": "Pan India", "all india": "Pan India",
};

export const MODE_ALIASES: Record<string, string> = {
  "directly by company": "Directly by company",
  "other implementing agencies": "Other implementing agencies",
  "by trusts/societies/ section 8 company set up by company itself":
    "Trust / Society / Sec-8 company (own)",
  "by trusts/societies/section 8 company set up by company itself":
    "Trust / Society / Sec-8 company (own)",
  "by trusts/societies/section 8 company set up by central or state government or entities established":
    "Trust / Society / Sec-8 company (government)",
};

export const NOT_SPECIFIED = "Not Specified";

export const NULL_TOKENS = new Set([
  "", "nan", "na", "n/a", "none", "null", "-", "--", "nil",
  "nec/ not mentioned", "nec/not mentioned", "nec / not mentioned",
  "not mentioned", "not applicable", "nec", "data unavailable",
]);

export const ACRONYMS = new Set([
  "ntpc", "ongc", "bhel", "sbi", "hdfc", "icici", "itc", "tcs", "hcl", "gail",
  "bpcl", "hpcl", "iocl", "nhpc", "sail", "rec", "pfc", "nmdc", "cesc", "jsw",
  "tvs", "mrf", "bel", "hal", "irctc", "lic", "idfc", "rbl", "upl", "nalco",
]);

export const FY_RE = /(20\d{2})\s*[-–/]\s*(20\d{2}|\d{2})/;

const SUFFIX_RE =
  /\b(private|pvt|public|limited|ltd|llp|inc|incorporated|corporation|corp|co|company|plc|the)\b/gi;

export function normHeader(name: unknown): string {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  let text = String(value).normalize("NFKC");
  text = text.replace(/[  ]/g, " ").replace(/[\r\n]+/g, " ");
  text = text.replace(/\s+/g, " ").trim().replace(/^[,;|]+|[,;|]+$/g, "");
  if (NULL_TOKENS.has(text.toLowerCase())) return null;
  return text || null;
}

export function titleCase(text: string | null): string | null {
  if (text === null) return null;
  if (text === text.toUpperCase() && text.length > 4) {
    return text
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
  return text;
}

export function normaliseYear(value: unknown): string | null {
  const text = cleanText(value);
  if (text === null) return null;
  const stripped = text.replace(/\(.*?\)/g, "").replace(/FY/gi, " ");
  const match = FY_RE.exec(stripped);
  if (!match) return null;
  return `FY ${match[1]}-${match[2].slice(-2)}`;
}

export function normaliseState(value: unknown): string {
  const text = cleanText(value);
  if (text === null) return NOT_SPECIFIED;
  const key = text.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
  if (STATE_ALIASES[key]) return STATE_ALIASES[key];
  if (key.startsWith("pan india")) return "Pan India";
  return titleCase(text) ?? NOT_SPECIFIED;
}

export function normaliseSector(value: unknown): string | null {
  const text = cleanText(value);
  if (text === null) return null;
  return SECTOR_ALIASES[text.toLowerCase()] ?? titleCase(text);
}

export function normaliseMode(value: unknown): string {
  const text = cleanText(value);
  if (text === null) return NOT_SPECIFIED;
  return MODE_ALIASES[text.toLowerCase()] ?? titleCase(text) ?? NOT_SPECIFIED;
}

export function normaliseTheme(value: unknown): string {
  const text = cleanText(value);
  if (text === null) return NOT_SPECIFIED;
  const fixed = titleCase(text);
  return fixed ? fixed.replace(/\s*,\s*/g, ", ") : NOT_SPECIFIED;
}

export function toAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  let number: number;
  if (typeof value === "number") {
    number = value;
  } else {
    const text = cleanText(value);
    if (text === null) return null;
    const digits = text.replace(/,/g, "").replace(/[^0-9.\-]/g, "");
    if (digits === "" || digits === "-" || digits === "." || digits === "-.") return null;
    number = Number.parseFloat(digits);
  }
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 10_000) / 10_000;
}

export function toInt(value: unknown): number | null {
  const amount = toAmount(value);
  return amount === null ? null : Math.trunc(amount);
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "company";
}

/** Suffix-stripped key so "Reliance Industries" and "…Limited" are one entity. */
export function companyKey(name: string): string {
  const stripped = name
    .replace(SUFFIX_RE, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return slugify(stripped || name);
}

export function displayName(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (letters.length > 4 && letters === letters.toUpperCase()) {
    const titled = name.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
    return titled.replace(/\b([A-Za-z]{2,5})\b/g, (word) =>
      ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word,
    );
  }
  return name;
}

/** Resolve logical field -> actual header, tolerating spelling drift. */
export function resolveColumns(headers: string[], spec: Record<string, string[]>) {
  const lookup = new Map<string, string>();
  for (const header of headers) lookup.set(normHeader(header), header);
  const resolved: Record<string, string | null> = {};
  for (const [key, candidates] of Object.entries(spec)) {
    resolved[key] = null;
    for (const candidate of candidates) {
      const needle = normHeader(candidate);
      if (lookup.has(needle)) {
        resolved[key] = lookup.get(needle)!;
        break;
      }
      const prefix = [...lookup.entries()].find(([name]) => needle && name.startsWith(needle));
      if (prefix) {
        resolved[key] = prefix[1];
        break;
      }
    }
  }
  return resolved;
}
