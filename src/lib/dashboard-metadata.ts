export interface DashboardMetricMeta {
  description: string;
  calculation?: string;
  unit?: string;
  source?: string;
}


export const dashboardMetadata: Record<string, DashboardMetricMeta> = {
  "Compare CSR Spent Over Time": { description: "Year-by-year CSR spent for the leading states, categories, sectors, companies or districts. Select up to six rows to plot them together." },
  "Total CSR Amount Spent for the Selected Period": { description: "Total CSR spent on projects in the selected years, as filed by companies on the MCA portal. Excludes administrative overheads and impact assessment costs." },
  "Companies Reporting in the Selected Period": { description: "Number of companies that reported at least one CSR project in the selected period." },
  "CSR Projects Reported in the Selected Period": { description: "Number of CSR projects reported in the selected period." },
  "Districts Reached by Reported CSR Projects": { description: "Number of districts where reported CSR projects were carried out." },
  "Beneficiaries Reached by Reported CSR Projects": { description: "Total beneficiaries disclosed for the selected projects, where reported." },
  "CSR Spent and Project Count by Financial Year": { description: "Total CSR spent and number of projects in each financial year." },
  "States Ranked by Total CSR Spent": { description: "States ranked by total CSR spent in the selected period." },
  "Sectors Ranked by Total CSR Spent": { description: "Industry sectors ranked by CSR spent, with each sector's share of the total." },
  "Companies Ranked by Total CSR Spent": { description: "Companies ranked by total CSR spent in the selected period." },
  "Geographic Distribution of Total CSR Spent by State": { description: "CSR spent by state; darker shading indicates higher spending. Pan-India projects are not mapped." },
  "CSR Spent Share by BRSR Sector": { description: "Each industry sector's share of total CSR spent." },
  "Total CSR Spent by Sector and Financial Year": { description: "Annual CSR spent for the six highest-spending sectors." },
  "Year-over-Year Change in CSR Spent by Sector": { description: "Change in each sector's CSR spent between the latest two financial years." },
  "Schedule VII Thematic Areas by Total CSR Spent": { description: "CSR spent across Schedule VII development themes, such as education and health." },
  "Companies Ranked by Total CSR Spent in This View": { description: "Companies ranked by CSR spent for the current selection. Select one to see its profile." },
  "CSR Amount Spent by Company and Financial Year": { description: "Annual CSR spent for the companies being compared." },
  "Company Benchmark by Total CSR Spent": { description: "Side-by-side comparison of the selected companies' CSR spent, projects and reach." },
  "Companies by BRSR Sector": { description: "Number of reporting companies in each industry sector." },
  "CSR Spent by Schedule VII Thematic Area": { description: "The selected company's CSR spent across Schedule VII development themes." },
  "States Reached by Reported CSR Projects": { description: "States where the selected company spent on CSR, ranked by amount." },
  "Largest CSR Projects by Amount Spent": { description: "The individual CSR projects with the highest amount spent." },
  "State-wise Total CSR Spent": { description: "Total CSR spent in each state." },
  "Leading States: CSR Spent, Previous vs Latest Year": { description: "The eight highest-spending states, comparing the previous and latest financial years. Select a bar to filter by that state." },
  "Districts Ranked by Total CSR Spent": { description: "Districts ranked by total CSR spent." },
  "Latest Financial-Year CSR Spent": { description: "Total CSR spent in the most recent financial year selected." },
  "Year-over-Year Change in CSR Spent": { description: "Change in total CSR spent compared with the previous financial year." },
  "Compound Annual Growth Rate in CSR Spent": { description: "Average annual growth in CSR spent across the selected years." },
  "Projected CSR Spent for the Next Financial Year": { description: "An indicative estimate for next year based on past trends; not a company commitment." },
  "CSR Spent by Financial Year with Projection": { description: "Annual CSR spent with an indicative projection for the next year." },
  "Sectors with the Highest Year-over-Year CSR Spent Growth": { description: "Sectors with the largest increase in CSR spent over the previous year." },
  "Sectors with the Largest Year-over-Year CSR Spent Decline": { description: "Sectors with the largest fall in CSR spent over the previous year." },
  "Top Sectors by Total CSR Spent Across Financial Years": { description: "Annual CSR spent for the six highest-spending sectors." },
  "Historical CSR Spent, Projects and Companies by Financial Year": { description: "Year-by-year summary of CSR spent, growth, projects and reporting companies." },
  "Total CSR Projects in the Selected Period": { description: "Number of CSR projects reported in the selected period." },
  "Average CSR Spent per Project": { description: "Average amount spent per CSR project." },
  "CSR Spent in Aspirational Districts": { description: "CSR spent in NITI Aayog's aspirational districts, and its share of the total." },
  "Project Count by Disclosed CSR Spent Range": { description: "Number of projects in each spending range. Select a bar to filter by that range." },
  "Districts Ranked by Project-Level CSR Spent": { description: "Districts ranked by total CSR spent." },
  "Filtered CSR Project Register": { description: "All CSR projects matching the current filters." },
  "Year-on-Year CSR Spent Outliers": { description: "Unusually large year-on-year changes in CSR spent that may need a closer look." },
  "Company CSR Spent by Financial Year": { description: "The selected company's CSR spent in each financial year." },
  "Company Profile": { description: "Key details and CSR summary for the selected company." },
  "Sector Peers": { description: "How the selected company compares with others in its sector." },
  "Projection Detail": { description: "Details of the indicative next-year estimate; not a reported commitment." },
  "Suggested Actions": { description: "Points worth exploring, based on patterns in the current data." },
  "Data Quality": { description: "Gaps in the source data that affect how these figures should be read." },
  "Automated Data Insights": { description: "Key patterns found in the current data. Verify against the charts before quoting." },
  "Natural Language Search": { description: "Ask questions about the CSR data in plain language." },
  "Amount Spent Trajectory and Projection": { description: "Annual CSR spent with an indicative projection for the next year." },
  "Amount Spent Trajectory": { description: "Annual CSR spent for the companies being compared." },
  "Implementation Channels by Total CSR Spent": { description: "CSR spent by delivery channel: directly, through own foundations or through implementing agencies." },
  "Implementation Channels Summary": { description: "CSR spent, projects and companies for each delivery channel." },
  "Implementation Channel Presence by State": { description: "States where the selected delivery channel was used." },
  "Schedule VII Focus Areas by Implementation Channel": { description: "Development themes funded through the selected delivery channels." },
  "Fastest-Growing States by CSR Spent": { description: "States with the largest increase in CSR spent over the previous year." },
  "Geographic Coverage Summary": { description: "Reach of CSR spending across states, districts and aspirational districts." },
  "Filtered Project Register": { description: "All CSR projects matching the current filters." },
  "National Rank by Total CSR Spent": { description: "The selected company's rank among all companies by total CSR spent." },
  "Latest-Year CSR Spent as a Share of Disclosed Obligation": { description: "Latest-year CSR spent as a percentage of the company's prescribed CSR obligation." },
};

export function metricMeta(title: string): DashboardMetricMeta {
  const exact = dashboardMetadata[title];
  if (exact) return exact;
  const lower = title.toLowerCase();
  if (lower.includes("project")) return { description: "CSR projects matching the current filters." };
  if (lower.includes("state") || lower.includes("district") || lower.includes("coverage")) return { description: "CSR activity by location for the current selection." };
  if (lower.includes("sector") || lower.includes("theme") || lower.includes("focus")) return { description: "CSR activity grouped by category for the current selection." };
  if (lower.includes("spend") || lower.includes("amount") || lower.includes("fund")) return { description: "Reported CSR spent for the current selection." };
  return { description: "Summary of CSR data for the current selection." };
}
