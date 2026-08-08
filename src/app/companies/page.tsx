import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Superseded by the fuller Company Analysis page. */
export default function CompaniesIndex() {
  redirect("/company-analysis");
}
