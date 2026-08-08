"use client";

import * as React from "react";
import { AlertTriangle, Inbox } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  badge?: string;
  action?: React.ReactNode;
  /** Fixed chart body height — keeps the grid from reflowing while loading. */
  height?: number;
  isLoading?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
  id?: string;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  badge,
  action,
  height = 300,
  isLoading,
  error,
  isEmpty,
  emptyMessage = "No records match the current filters.",
  className,
  id,
  children,
}: ChartCardProps) {
  return (
    <Card id={id} className={cn("flex flex-col scroll-mt-24", className)}>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
          {action}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div style={{ height }} className="w-full">
          {isLoading ? (
            <Skeleton className="size-full" />
          ) : error ? (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-center text-sm text-destructive">
              <AlertTriangle className="size-5" />
              <p className="font-medium">Could not load this chart</p>
              <p className="max-w-xs text-xs text-muted-foreground">{error.message}</p>
            </div>
          ) : isEmpty ? (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Inbox className="size-5" />
              <p>{emptyMessage}</p>
            </div>
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
  );
}
