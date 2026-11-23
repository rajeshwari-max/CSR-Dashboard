"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Compass, Filter, LayoutDashboard, MousePointerClick, Sparkles, X } from "lucide-react";

import { TOUR_CHAPTERS, TOUR_STEPS, type TourStep } from "@/components/tour/tour-steps";
import { selectFilters, useFilterStore } from "@/store/filters";

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

type Mode = "full" | "filters" | "page";

interface TourContextValue {
  /** Opens the chooser (full tour / filters / this page). */
  openTour: () => void;
  /** Starts straight away without the chooser. */
  startTour: (mode: Mode) => void;
}

const TourContext = React.createContext<TourContextValue>({ openTour: () => {}, startTour: () => {} });

export function useTour() {
  return React.useContext(TourContext);
}

/* ------------------------------------------------------------------ */
/* DOM helpers (also used by the step definitions)                     */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve a step target: CSS selector or a finder function. */
export function resolveTarget(target: TourStep["target"]): Element | null {
  if (!target) return null;
  try {
    return typeof target === "function" ? target() : document.querySelector(target);
  } catch {
    return null;
  }
}

async function waitFor(find: () => Element | null, timeout = 6000): Promise<Element | null> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const element = find();
    if (element) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return element;
    }
    await sleep(120);
  }
  return null;
}

async function waitForPath(path: string, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (window.location.pathname === path) return true;
    await sleep(100);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;
const CARD_W = 360;
const SEEN_KEY = "cms.tour.seen.v1";

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [chooserOpen, setChooserOpen] = React.useState(false);
  const [steps, setSteps] = React.useState<TourStep[] | null>(null);
  const [index, setIndex] = React.useState(0);
  const [box, setBox] = React.useState<Box | null>(null);
  const [cursor, setCursor] = React.useState<{ x: number; y: number; visible: boolean; clicking: boolean }>({
    x: -80,
    y: -80,
    visible: false,
    clicking: false,
  });
  const [ready, setReady] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const runId = React.useRef(0);
  const targetRef = React.useRef<Element | null>(null);
  const savedFilters = React.useRef<ReturnType<typeof selectFilters> | null>(null);
  const savedPath = React.useRef<string>("/");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = React.useState({ w: CARD_W, h: 220 });

  React.useEffect(() => setMounted(true), []);

  // First visit: offer the tour once, on the Overview page.
  React.useEffect(() => {
    if (window.location.pathname !== "/") return;
    try {
      if (window.localStorage.getItem(SEEN_KEY)) return;
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      return;
    }
    const timer = setTimeout(() => setChooserOpen(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  /* ---- start / stop -------------------------------------------- */

  const startTour = React.useCallback(
    (mode: Mode) => {
      const path = window.location.pathname;
      let list: TourStep[];
      if (mode === "filters") list = TOUR_STEPS.filter((step) => step.chapter === "intro" || step.chapter === "filters");
      else if (mode === "page") {
        const pageSteps = TOUR_STEPS.filter((step) => step.chapter !== "intro" && step.chapter !== "filters" && step.chapter !== "finish" && step.route === path);
        list = pageSteps.length ? pageSteps : TOUR_STEPS.filter((step) => step.chapter === "filters");
      } else list = TOUR_STEPS;
      // Keep the visitor's own filters and give the demo a clean slate.
      const store = useFilterStore.getState();
      savedFilters.current = selectFilters(store);
      savedPath.current = path + window.location.search;
      store.clearAll();
      setChooserOpen(false);
      setIndex(0);
      setSteps(list);
    },
    [],
  );

  const endTour = React.useCallback(() => {
    runId.current += 1;
    setSteps(null);
    setBox(null);
    setReady(false);
    setCursor((value) => ({ ...value, visible: false }));
    // Close any filter popup the demo opened, then restore the visitor's filters.
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    if (savedFilters.current) {
      const store = useFilterStore.getState();
      store.clearAll();
      store.hydrate(savedFilters.current);
      savedFilters.current = null;
    }
  }, []);

  const value = React.useMemo<TourContextValue>(
    () => ({ openTour: () => setChooserOpen(true), startTour }),
    [startTour],
  );

  /* ---- run the current step ------------------------------------ */

  React.useEffect(() => {
    if (!steps) return;
    const step = steps[index];
    if (!step) return;
    const id = ++runId.current;
    const alive = () => runId.current === id;
    setReady(false);

    (async () => {
      // 1. Go to the right page.
      if (step.route && window.location.pathname !== step.route) {
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        router.push(step.route);
        await waitForPath(step.route);
        await sleep(500);
        if (!alive()) return;
      }

      // 2. Prepare the page (open a popup, close one, set a filter...).
      if (step.before) {
        try {
          await step.before();
        } catch {
          /* keep going: the step simply shows without the prep */
        }
        await sleep(260);
        if (!alive()) return;
      }

      // 3. Find the element and bring it into view.
      const element = step.target ? await waitFor(() => resolveTarget(step.target)) : null;
      if (!alive()) return;
      targetRef.current = element;
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: step.block ?? "center", inline: "nearest" });
        await sleep(520);
        if (!alive()) return;
        measure();
      } else {
        setBox(null);
      }

      // 4. Glide the cursor over and (optionally) click.
      const clickEl = step.click ? await waitFor(() => resolveTarget(step.click!), 3000) : element;
      if (!alive()) return;
      if (clickEl) {
        const r = clickEl.getBoundingClientRect();
        // Point at the middle of small controls; for big cards, a spot near the top-left so the arrow does not hide content.
        const x = r.width > 320 ? r.left + 48 : r.left + r.width / 2;
        const y = r.height > 160 ? r.top + 40 : r.top + r.height / 2;
        setCursor({ x, y, visible: true, clicking: false });
        await sleep(820);
        if (!alive()) return;
        if (step.click) {
          setCursor((c) => ({ ...c, clicking: true }));
          await sleep(180);
          if (step.action) step.action();
          else (clickEl as HTMLElement).click();
          await sleep(260);
          setCursor((c) => ({ ...c, clicking: false }));
          await sleep(step.settle ?? 500);
          if (!alive()) return;
          // The click may have opened something: re-find the highlight target.
          if (step.target) {
            const again = await waitFor(() => resolveTarget(step.target), 2500);
            if (!alive()) return;
            targetRef.current = again;
            measure();
          }
        }
      } else {
        setCursor((c) => ({ ...c, visible: false }));
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, index]);

  /* ---- keep the spotlight glued to its element ------------------ */

  const measure = React.useCallback(() => {
    const element = targetRef.current;
    if (!element || !element.isConnected) {
      setBox(null);
      return;
    }
    const r = element.getBoundingClientRect();
    setBox((prev) => {
      const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      if (prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5) return prev;
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!steps) return;
    let frame = 0;
    const loop = () => {
      measure();
      frame = window.setTimeout(loop, 120) as unknown as number;
    };
    loop();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [steps, measure]);

  // Track the card's real size so it can be placed without covering the spotlight.
  React.useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const r = node.getBoundingClientRect();
      setCardSize((prev) => (Math.abs(prev.h - r.height) > 1 || Math.abs(prev.w - r.width) > 1 ? { w: r.width, h: r.height } : prev));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [steps]);

  /* ---- keyboard -------------------------------------------------- */

  const next = React.useCallback(() => {
    if (!steps) return;
    if (index >= steps.length - 1) endTour();
    else setIndex((i) => i + 1);
  }, [steps, index, endTour]);
  const back = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  React.useEffect(() => {
    if (!steps && !chooserOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (steps) endTour();
        else setChooserOpen(false);
      } else if (steps && (event.key === "ArrowRight" || event.key === "Enter")) {
        event.preventDefault();
        next();
      } else if (steps && event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, chooserOpen, next, back, endTour]);

  // The filter popups close on any mousedown outside the filter bar. Stop our own
  // clicks (Next/Back) from reaching that listener, so a popup the demo opened stays open.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const stop = (event: Event) => event.stopPropagation();
    node.addEventListener("mousedown", stop);
    return () => node.removeEventListener("mousedown", stop);
  });

  // A visitor who navigates away with the sidebar mid-tour keeps the tour; nothing to do.
  void pathname;

  /* ---- layout of the explanation card ---------------------------- */

  const step = steps?.[index];
  const cardPos = React.useMemo(() => {
    const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
    const vh = typeof window === "undefined" ? 800 : window.innerHeight;
    const w = Math.min(CARD_W, vw - 24);
    const h = cardSize.h;
    if (!box || !step?.target) return { left: (vw - w) / 2, top: Math.max(24, (vh - h) / 2), w };
    const gap = 16;
    const fits = {
      bottom: box.top + box.height + gap + h < vh - 12,
      top: box.top - gap - h > 12,
      right: box.left + box.width + gap + w < vw - 12,
      left: box.left - gap - w > 12,
    };
    const order = step.placement && step.placement !== "auto" ? [step.placement, "bottom", "top", "right", "left"] : ["bottom", "top", "right", "left"];
    const side = (order.find((s) => fits[s as keyof typeof fits]) ?? "center") as string;
    let left: number;
    let top: number;
    if (side === "bottom" || side === "top") {
      left = box.left + box.width / 2 - w / 2;
      top = side === "bottom" ? box.top + box.height + gap : box.top - gap - h;
    } else if (side === "right" || side === "left") {
      top = box.top + box.height / 2 - h / 2;
      left = side === "right" ? box.left + box.width + gap : box.left - gap - w;
    } else {
      // Element fills the screen: park the card in the bottom-right corner.
      left = vw - w - 20;
      top = vh - h - 20;
    }
    left = Math.max(12, Math.min(left, vw - w - 12));
    top = Math.max(12, Math.min(top, vh - h - 12));
    return { left, top, w };
  }, [box, step, cardSize.h]);

  const chapterSteps = steps && step ? steps.filter((s) => s.chapter === step.chapter) : [];
  const chapterPos = step ? chapterSteps.indexOf(step) + 1 : 0;
  const chapterLabel = step ? TOUR_CHAPTERS[step.chapter]?.label ?? "" : "";

  /* ---- render ----------------------------------------------------- */

  const overlay =
    mounted && (steps || chooserOpen)
      ? createPortal(
          <div ref={rootRef} className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
            {chooserOpen && !steps ? (
              <Chooser
                onClose={() => setChooserOpen(false)}
                onStart={startTour}
                pageHasSteps={TOUR_STEPS.some((s) => s.route === pathname && !["intro", "filters", "finish"].includes(s.chapter))}
              />
            ) : null}

            {steps && step ? (
              <>
                {/* Click shield: the demo drives the page, the visitor reads. */}
                <div className="tour-shield" />
                {box && step.target ? (
                  <div
                    className="tour-spotlight"
                    style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
                  />
                ) : (
                  <div className="tour-dim" />
                )}

                <div
                  className={`tour-cursor${cursor.visible ? " show" : ""}${cursor.clicking ? " clicking" : ""}`}
                  style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
                  aria-hidden
                >
                  <svg width="26" height="30" viewBox="0 0 26 30">
                    <path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26.2 L12 17 L20.5 17 Z" fill="var(--c1, #82419a)" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                  <span className="tour-ripple" />
                </div>

                <div
                  ref={cardRef}
                  className={`tour-card${ready ? " ready" : ""}`}
                  style={{ left: cardPos.left, top: cardPos.top, width: cardPos.w }}
                >
                  <div className="tour-card-top">
                    <span className="tour-chapter">
                      {chapterLabel}
                      {chapterSteps.length > 1 ? ` · ${chapterPos} of ${chapterSteps.length}` : ""}
                    </span>
                    <button type="button" className="tour-x" onClick={endTour} aria-label="Close tour">
                      <X width={15} height={15} />
                    </button>
                  </div>
                  <div className="tour-title">{step.title}</div>
                  <div className="tour-body">{step.body}</div>
                  {step.watch ? (
                    <div className="tour-watch">
                      <span className="tour-pulse" />
                      {step.watch}
                    </div>
                  ) : null}
                  <div className="tour-progress">
                    <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
                  </div>
                  <div className="tour-actions">
                    <button type="button" className="tour-skip" onClick={endTour}>
                      {index >= steps.length - 1 ? "Close" : "Skip tour"}
                    </button>
                    <span className="tour-count">
                      {index + 1} / {steps.length}
                    </span>
                    <button type="button" className="tour-btn ghost" onClick={back} disabled={index === 0}>
                      <ArrowLeft width={14} height={14} />
                    </button>
                    <button type="button" className="tour-btn" onClick={next} disabled={!ready && index < steps.length - 1}>
                      {index >= steps.length - 1 ? "Finish" : "Next"}
                      {index < steps.length - 1 ? <ArrowRight width={14} height={14} /> : null}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  // Restore the page the visitor started from when the tour finishes on another page.
  const prevSteps = React.useRef<TourStep[] | null>(null);
  React.useEffect(() => {
    if (prevSteps.current && !steps && savedPath.current) {
      const target = savedPath.current;
      if (window.location.pathname + window.location.search !== target) router.push(target);
    }
    prevSteps.current = steps;
  }, [steps, router]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {overlay}
    </TourContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Chooser                                                             */
/* ------------------------------------------------------------------ */

function Chooser({
  onClose,
  onStart,
  pageHasSteps,
}: {
  onClose: () => void;
  onStart: (mode: Mode) => void;
  pageHasSteps: boolean;
}) {
  const fullCount = TOUR_STEPS.length;
  const filterCount = TOUR_STEPS.filter((s) => s.chapter === "filters").length;
  const options: { mode: Mode; icon: React.ReactNode; title: string; text: string; meta: string; disabled?: boolean }[] = [
    {
      mode: "full",
      icon: <Compass width={20} height={20} />,
      title: "Full tour",
      text: "Every filter and every page, with live demos that click for you.",
      meta: `${fullCount} steps · about 5 minutes`,
    },
    {
      mode: "filters",
      icon: <Filter width={20} height={20} />,
      title: "How the filters work",
      text: "Watch a filter being picked and see the numbers change.",
      meta: `${filterCount} steps · about 2 minutes`,
    },
    {
      mode: "page",
      icon: <LayoutDashboard width={20} height={20} />,
      title: "Just this page",
      text: pageHasSteps ? "A quick look at what this page shows and how to use it." : "This page has no tour of its own yet; you will get the filters tour.",
      meta: "1 minute",
    },
  ];
  return (
    <div className="tour-chooser-wrap" onClick={onClose}>
      <div className="tour-chooser" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="tour-x" style={{ position: "absolute", top: 14, right: 14 }} onClick={onClose} aria-label="Close">
          <X width={16} height={16} />
        </button>
        <div className="tour-chooser-badge">
          <Sparkles width={14} height={14} /> Guided tour
        </div>
        <h2 className="tour-chooser-title">Welcome to CSR Intelligence</h2>
        <p className="tour-chooser-text">
          A moving pointer will show you where to click, open filters for you and explain what changes. Your own filters are
          put back when the tour ends.
        </p>
        <div className="tour-options">
          {options.map((option) => (
            <button key={option.mode} type="button" className="tour-option" onClick={() => onStart(option.mode)} disabled={option.disabled}>
              <span className="tour-option-icon">{option.icon}</span>
              <span className="tour-option-text">
                <strong>{option.title}</strong>
                <span>{option.text}</span>
                <em>{option.meta}</em>
              </span>
              <ArrowRight width={16} height={16} className="tour-option-go" />
            </button>
          ))}
        </div>
        <div className="tour-keys">
          <MousePointerClick width={13} height={13} /> Use <kbd>→</kbd> / <kbd>←</kbd> to move, <kbd>Esc</kbd> to stop at any time
        </div>
      </div>
    </div>
  );
}
