import { redirect } from "next/navigation";

// The CSR Indicators page has been removed. Old links land on CSR by Geography.
export default function Page() {
  redirect("/state-analysis");
}
