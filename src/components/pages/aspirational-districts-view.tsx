"use client";

import * as React from "react";
import { ChevronDown, Target } from "lucide-react";

import { AspirationalPopover } from "@/components/shell/filter-bar";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { BreakdownTable } from "@/components/shared/breakdown-table";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { AspirationalSection } from "@/components/pages/policy-insights-view";
import { Card, CardContent } from "@/components/ui/card";
import { useApi } from "@/lib/api";
import type { BreakdownResponse } from "@/types";

/**
 * Aspirational Districts tab. The aspirational-district filter lives here only:
 * it is local to this page, so it never changes what other tabs show.
 */
export function AspirationalDistrictsView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const meta = useMeta();
  const [district, setDistrict] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const stateOf = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const [state, list] of Object.entries(meta.data?.districtsByState ?? {})) for (const d of list) map.set(d, state);
    return map;
  }, [meta.data]);

  // Page-level query: global filters plus this tab's own district choice.
  const query = React.useMemo(() => {
    const params = new URLSearchParams(filterQuery);
    if (district) {
      params.set("districts", district);
      const state = stateOf.get(district);
      if (state) params.set("states", state);
    }
    return params.toString();
  }, [filterQuery, district, stateOf]);

  const list = useApi<BreakdownResponse>(`/api/breakdown?dimension=district&limit=200&aspirational=1&${filterQuery}`);
  const years = list.data?.years ?? [];

  return (
    <PageFrame
      title="Aspirational Districts"
      subtitle={`CSR reaching NITI Aayog's 112 aspirational districts · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      error={meta.error}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aspirational district</span>
        <div className="pos-rel">
          <button type="button" className={`select-chip${district ? " active" : ""}`} onClick={() => setOpen((v) => !v)}>
            <Target width={12} height={12} />
            {district ?? "All aspirational districts"}
            <ChevronDown width={12} height={12} />
          </button>
          {open ? (
            <AspirationalPopover
              options={meta.data?.aspirationalDistricts ?? []}
              selected={district ? [district] : []}
              allActive={!district}
              onAll={() => { setDistrict(null); setOpen(false); }}
              onSelect={(name) => { setDistrict(name); setOpen(false); }}
              onClear={() => { setDistrict(null); setOpen(false); }}
            />
          ) : null}
        </div>
      </div>

      <AspirationalSection filterQuery={query} singleDistrict={Boolean(district)} />

      <SectionLabel>CSR spent by aspirational district</SectionLabel>
      <Card>
        <CardContent className="px-0 pt-4">
          <BreakdownTable
            rows={list.data?.rows ?? []}
            label="Aspirational district"
            limit={120}
            selected={district ? [district] : []}
            onSelect={(name) => setDistrict(district === name ? null : name)}
            latestLabel={years[years.length - 1]}
            columns={["value", "share", "count", "companies", "latest", "yoy"]}
          />
        </CardContent>
      </Card>
    </PageFrame>
  );
}
