/**
 * One place for the data attribution and unit note shown in the page footer,
 * the reports and the methodology text, so every surface says the same thing.
 */
export const DATA_SOURCE = {
  short: "MCA National CSR Portal (csr.gov.in)",
  long:
    "Project-level CSR filings from the Ministry of Corporate Affairs' National CSR Portal (csr.gov.in), " +
    "with company details (CIN, sector, CSR obligation, report links) from annual reports and BRSR filings",
  url: "https://www.csr.gov.in",
} as const;

/** Second source: annual-report CSR annexures (obligation, unspent CSR, impact assessment, partners). */
export const ANNEXURE_SOURCE = {
  short: "Company annual reports, CSR annexure (NSE)",
  long: "Annexure on CSR activities in each company's annual report, as filed on the National Stock Exchange (nsearchives.nseindia.com)",
  url: "https://www.nseindia.com/companies-listing/corporate-filings-annual-reports",
} as const;

export const UNITS_NOTE = "All amounts in ₹ crore (Cr)";
