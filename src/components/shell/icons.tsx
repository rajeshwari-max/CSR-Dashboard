"use client";

import {
  Landmark,
  Building2,
  Database,
  FileBarChart,
  FolderKanban,
  Handshake,
  Layers,
  LayoutGrid,
  MapPinned,
  Sparkles,
  TrendingUp,
  Upload,
  type LucideIcon,
} from "lucide-react";

/** Draft icon slugs -> lucide components, kept in one place for the nav + palette. */
export const ICONS: Record<string, LucideIcon> = {
  grid: LayoutGrid,
  policy: Landmark,
  building: Building2,
  map: MapPinned,
  layers: Layers,
  handshake: Handshake,
  folder: FolderKanban,
  trending: TrendingUp,
  report: FileBarChart,
  sparkles: Sparkles,
  database: Database,
  upload: Upload,
};
