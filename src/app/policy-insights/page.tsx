import { redirect } from "next/navigation";

// Policy Insights is now part of CSR Insights (company-analysis).
export default function Page() {
  redirect("/company-analysis");
}
