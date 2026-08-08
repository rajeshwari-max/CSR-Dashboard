"use client";

import * as React from "react";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bot,
  CircleAlert,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { AXIS_PROPS, TOOLTIP_STYLES } from "@/components/charts/chart-theme";
import { ChartCard } from "@/components/charts/chart-card";
import { PageFrame, SectionLabel } from "@/components/shared/page-frame";
import { useDashboardFilters, useMeta } from "@/components/shared/use-dashboard-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { postJson, useApi } from "@/lib/api";
import { formatCrore, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useFilterStore } from "@/store/filters";
import type { ChatResponse, InsightSeverity, InsightsResponse } from "@/types";

const SEVERITY_STYLES: Record<InsightSeverity, string> = {
  positive: "border-success/30 bg-success/5",
  neutral: "border-border bg-card",
  warning: "border-amber-500/40 bg-amber-500/5",
  critical: "border-destructive/40 bg-destructive/5",
};

const SEVERITY_ICON: Record<InsightSeverity, React.ElementType> = {
  positive: BadgeCheck,
  neutral: Lightbulb,
  warning: AlertTriangle,
  critical: CircleAlert,
};

const SUGGESTED = [
  "Which state gained the most CSR spend in the latest year?",
  "Is education spending growing faster than healthcare?",
  "Which companies dropped their CSR spend the most?",
  "How concentrated is CSR spend across companies?",
];

export function AiInsightsView() {
  const { filters, filterQuery, scope } = useDashboardFilters();
  const apply = useFilterStore((state) => state.apply);
  const meta = useMeta();

  const [narrate, setNarrate] = React.useState(false);
  const insights = useApi<InsightsResponse>(`/api/insights?${filterQuery}${narrate ? "&narrate=1" : ""}`);

  const [question, setQuestion] = React.useState("");
  const [thread, setThread] = React.useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [asking, setAsking] = React.useState(false);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || asking) return;
    setThread((current) => [...current, { role: "user", text: trimmed }]);
    setQuestion("");
    setAsking(true);
    try {
      const response = await postJson<ChatResponse>("/api/chat", { question: trimmed, query: filterQuery });
      setThread((current) => [...current, { role: "assistant", text: response.answer }]);
    } catch {
      setThread((current) => [
        ...current,
        { role: "assistant", text: "The request failed. Check the server logs and your LLM key configuration." },
      ]);
    } finally {
      setAsking(false);
    }
  };

  const data = insights.data;
  const forecastData = data?.forecast.points ?? [];

  return (
    <PageFrame
      title="AI Insights"
      subtitle={`Computed from the current selection · ${scope}`}
      meta={meta.data}
      metaLoading={meta.isLoading}
      filters={filters}
      filterQuery={filterQuery}
      error={insights.error ?? meta.error}
      onRefresh={() => insights.refetch()}
      isRefreshing={insights.isValidating}
      actions={
        <Button
          variant={narrate ? "default" : "outline"}
          size="sm"
          onClick={() => setNarrate((value) => !value)}
          disabled={!data?.llm.available}
          title={data?.llm.available ? "Ask the configured model to narrate these findings" : "Set LLM_API_KEY to enable"}
        >
          <Sparkles className="size-4" />
          {narrate ? "AI narration on" : "AI narration"}
        </Button>
      }
    >
      <SectionLabel>Executive summary</SectionLabel>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              What the data says
            </CardTitle>
            <CardDescription>
              Every figure below is computed directly from the fact table — no model involved
            </CardDescription>
          </div>
          {data?.llm.available ? (
            <Badge variant="outline">{data.llm.model}</Badge>
          ) : (
            <Badge variant="muted">Deterministic</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2.5">
          {insights.isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-4 w-full" />)
          ) : (
            <>
              {data?.summary.map((line) => (
                <p key={line} className="text-sm leading-relaxed">
                  {line}
                </p>
              ))}
              {data?.llm.narrative ? (
                <div className="mt-3 rounded-lg border border-primary/30 bg-accent/40 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    <Bot className="size-3.5" />
                    Model narration
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.llm.narrative}</p>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <SectionLabel>Key trends &amp; predictions</SectionLabel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ChartCard
          title="Spend trajectory and projection"
          description={data?.forecast.method}
          className="xl:col-span-2"
          height={320}
          isLoading={insights.isLoading}
          error={insights.error}
          isEmpty={forecastData.length < 2}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={forecastData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} />
              <Tooltip
                {...TOOLTIP_STYLES}
                formatter={(value: number, name: string) => [formatCrore(value), name]}
              />
              <Legend iconType="circle" iconSize={8} />
              <Area
                dataKey="upper"
                name="Confidence band"
                stroke="none"
                fill="hsl(var(--chart-3))"
                fillOpacity={0.18}
                isAnimationActive={false}
              />
              <Area dataKey="lower" name=" " stroke="none" fill="hsl(var(--background))" isAnimationActive={false} />
              <Line
                dataKey="spend"
                name="Actual"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                dataKey="projected"
                name="Projected"
                stroke="hsl(var(--chart-3))"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Projection detail</CardTitle>
              <CardDescription>Linear fit over annual totals</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{data?.forecast.nextYear ?? "Next year"}</span>
              <span className="numeric text-lg font-semibold">
                {data?.forecast.nextYearSpend !== null && data?.forecast.nextYearSpend !== undefined
                  ? formatCrore(data.forecast.nextYearSpend)
                  : "—"}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Goodness of fit (R²)</span>
              <span className="numeric text-[13px] font-semibold">{data?.forecast.r2?.toFixed(3) ?? "—"}</span>
            </div>
            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              {data?.forecast.caveat}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {insights.isLoading
          ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-40 w-full" />)
          : data?.insights.map((insight) => {
              const Icon = SEVERITY_ICON[insight.severity];
              return (
                <Card key={insight.id} className={cn("flex flex-col p-5", SEVERITY_STYLES[insight.severity])}>
                  <div className="flex items-start gap-2">
                    <Icon
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        insight.severity === "critical" && "text-destructive",
                        insight.severity === "warning" && "text-amber-600",
                        insight.severity === "positive" && "text-success",
                        insight.severity === "neutral" && "text-primary",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold leading-snug">{insight.title}</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{insight.detail}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {insight.evidence.map((item) => (
                      <span
                        key={item.label}
                        className="inline-flex items-center gap-1 rounded-md bg-card/80 px-1.5 py-0.5 text-[10px] shadow-sm"
                      >
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="numeric font-semibold">{item.value}</span>
                      </span>
                    ))}
                  </div>
                  {insight.action ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="mt-3 self-start"
                      onClick={() => apply(insight.action!.filters)}
                    >
                      {insight.action.label}
                      <ArrowRight className="size-3" />
                    </Button>
                  ) : null}
                </Card>
              );
            })}
      </div>

      <SectionLabel>Anomaly detection</SectionLabel>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Year-on-year outliers</CardTitle>
            <CardDescription>
              Entities whose change is at least 2 standard deviations from the typical move in this view
            </CardDescription>
          </div>
          <Badge variant="outline">{data?.anomalies.length ?? 0} flagged</Badge>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-48">Entity</TableHead>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Previous</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">z-score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.anomalies ?? []).length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {insights.isLoading ? "Scanning…" : "No statistically unusual movements in this view."}
                  </TableCell>
                </TableRow>
              ) : (
                data?.anomalies.map((row) => (
                  <TableRow key={`${row.name}-${row.year}`}>
                    <TableCell className="text-[13px] font-medium">{row.name}</TableCell>
                    <TableCell className="numeric text-xs text-muted-foreground">{row.year}</TableCell>
                    <TableCell className="numeric text-right text-[13px]">{formatCrore(row.expected)}</TableCell>
                    <TableCell className="numeric text-right text-[13px]">{formatCrore(row.value)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={row.direction === "spike" ? "success" : "danger"}>
                        {formatSignedPercent(row.deviationPct)}
                      </Badge>
                    </TableCell>
                    <TableCell className="numeric text-right text-[13px]">{row.zScore.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SectionLabel>Recommendations</SectionLabel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Suggested actions</CardTitle>
              <CardDescription>Derived from the gaps detected above</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.recommendations ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {insights.isLoading ? "Analysing…" : "No material issues detected in this view."}
              </p>
            ) : (
              data?.recommendations.map((item) => (
                <div key={item.title} className="rounded-lg border border-border p-3">
                  <p className="text-[13px] font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                  <Badge variant="muted" className="mt-2">
                    {item.impact}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Data quality</CardTitle>
              <CardDescription>What to keep in mind when quoting these numbers</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {data?.dataQuality.map((note) => (
              <div key={note.label} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0">
                <span className="text-xs text-muted-foreground">{note.label}</span>
                <span
                  className={cn(
                    "shrink-0 text-right text-[12px] font-medium",
                    note.severity === "warning" && "text-amber-600",
                    note.severity === "positive" && "text-success",
                  )}
                >
                  {note.value}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <SectionLabel>Chat with the dashboard</SectionLabel>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Natural language search</CardTitle>
            <CardDescription>
              {data?.llm.available
                ? `Grounded on the current selection · answered by ${data.llm.model}`
                : "Add LLM_API_KEY to .env.local to enable — every panel above works without it"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-80 space-y-3 overflow-y-auto">
            {thread.length === 0 ? (
              <div className="flex flex-wrap gap-2">
                {SUGGESTED.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void ask(suggestion)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : (
              thread.map((message, index) => (
                <div
                  key={index}
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                    message.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </div>
              ))
            )}
            {asking ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Thinking…
              </div>
            ) : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask(question);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about this selection…"
              aria-label="Ask a question about the data"
              className="h-9 flex-1 rounded-lg border border-input bg-card px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" size="sm" disabled={asking || !question.trim()}>
              <Send className="size-4" />
              Ask
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageFrame>
  );
}
