import { NextResponse } from "next/server";

import { invalidateCaches, listBackups, restoreBackup } from "@/lib/etl/store";
import { handleRouteError } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/dataset — available rollback points. */
export async function GET() {
  try {
    return NextResponse.json({ backups: listBackups() });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/dataset { restore } — roll back to a previous dataset. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { restore?: string };
    if (!body.restore) {
      return NextResponse.json({ error: "Nothing to restore", detail: "Pass { restore }." }, { status: 400 });
    }
    const done = restoreBackup(body.restore);
    if (!done) {
      return NextResponse.json({ error: "Backup not found", detail: body.restore }, { status: 404 });
    }
    invalidateCaches();
    return NextResponse.json({ ok: true, restored: body.restore });
  } catch (error) {
    return handleRouteError(error);
  }
}
