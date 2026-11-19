import { redirect } from "next/navigation";

// The Implementation Partners page has been removed. Partner figures remain in CSR Insights.
export default function Page() {
  redirect("/company-analysis#csr-spending");
}
