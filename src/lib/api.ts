"use client";

/**
 * Tiny typed fetch layer + a `useApi` hook with request cancellation,
 * loading/error state and manual refetch. Deliberately dependency free —
 * the dashboard only has a handful of endpoints.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "";

export class ApiRequestError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.detail = detail;
  }
}

export async function apiFetch<T>(pathname: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${pathname}`, { signal, headers: { accept: "application/json" } });
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error;
    } catch {
      detail = undefined;
    }
    throw new ApiRequestError(
      response.status === 404 ? "Not found" : "Request failed",
      response.status,
      detail,
    );
  }
  return (await response.json()) as T;
}

export interface UseApiResult<T> {
  data: T | null;
  error: ApiRequestError | Error | null;
  isLoading: boolean;
  isValidating: boolean;
  refetch: () => void;
}

/**
 * Module-level response cache + in-flight de-duplication.
 *
 * Without this, every filter change and every navigation refetches from
 * scratch, and two panels asking for the same endpoint fire two requests. With
 * it, a repeat view paints instantly from cache and revalidates quietly in the
 * background (stale-while-revalidate).
 */
const responseCache = new Map<string, { value: unknown; at: number }>();
const inFlight = new Map<string, Promise<unknown>>();
const FRESH_MS = 60_000;
const MAX_CACHED = 80;

function readCache<T>(key: string): { value: T; stale: boolean } | null {
  const hit = responseCache.get(key);
  if (!hit) return null;
  return { value: hit.value as T, stale: Date.now() - hit.at > FRESH_MS };
}

function writeCache(key: string, value: unknown) {
  responseCache.set(key, { value, at: Date.now() });
  while (responseCache.size > MAX_CACHED) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
}

/** Drop everything — called after an upload replaces the dataset. */
export function clearApiCache() {
  responseCache.clear();
  inFlight.clear();
}

function fetchOnce<T>(pathname: string): Promise<T> {
  const existing = inFlight.get(pathname);
  if (existing) return existing as Promise<T>;

  const promise = apiFetch<T>(pathname)
    .then((value) => {
      writeCache(pathname, value);
      return value;
    })
    .finally(() => {
      inFlight.delete(pathname);
    });

  inFlight.set(pathname, promise);
  return promise;
}

export function useApi<T>(pathname: string | null, deps: unknown[] = []): UseApiResult<T> {
  const cachedHit = pathname ? readCache<T>(pathname) : null;
  const [data, setData] = useState<T | null>(cachedHit?.value ?? null);
  const [error, setError] = useState<ApiRequestError | Error | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(pathname) && !cachedHit);
  const [isValidating, setIsValidating] = useState(false);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refetch = useCallback(() => {
    if (pathname) responseCache.delete(pathname);
    setNonce((value) => value + 1);
  }, [pathname]);

  useEffect(() => {
    if (!pathname) return;

    const hit = readCache<T>(pathname);
    if (hit) {
      // Paint immediately from cache, then revalidate only if it aged out.
      setData(hit.value);
      setError(null);
      setIsLoading(false);
      if (!hit.stale && nonce === 0) return;
      setIsValidating(true);
    } else {
      setIsLoading(true);
    }

    fetchOnce<T>(pathname)
      .then((result) => {
        if (!alive.current) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!alive.current) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause : new Error("Unexpected error"));
      })
      .finally(() => {
        if (!alive.current) return;
        setIsLoading(false);
        setIsValidating(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, nonce, ...deps]);

  return { data, error, isLoading, isValidating, refetch };
}

export function downloadCsv(pathname: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = `${BASE}${pathname}`;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * Fetch-then-save, so report generation failures surface as errors instead of
 * navigating the tab to a JSON error page.
 */
export async function downloadFile(pathname: string, filename: string): Promise<void> {
  const response = await fetch(`${BASE}${pathname}`);
  if (!response.ok) {
    let detail = `${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string; error?: string };
      detail = body.detail ?? body.error ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError("Report generation failed", response.status, detail);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function postJson<T>(pathname: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiRequestError("Request failed", response.status);
  }
  return (await response.json()) as T;
}
