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

export const UNITS_NOTE = "Amounts in ₹ crore (Cr); values below ₹1 Cr are shown in lakh (L), 1 Cr = 100 L";
