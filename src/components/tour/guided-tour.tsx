"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
  Filter,
  LayoutDashboard,
  MousePointerClick,
  Rocket,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

import {
  FILTER_LESSONS,
  FULL_TOUR,
  PAGE_LESSONS,
  QUICK_START,
  closePopups,
  currentFilters,
  describeFilters,
  type TourChoice,
  type TourStep,
} from "@/components/tour/tour-steps";
import { selectFilters, useFilterStore } from "@/store/filters";
import type { Filters } from "@/types";

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

interface TourContextValue {
  /** Opens the tour menu. */
  openTour: () => void;
}

const TourContext = React.createContext<TourContextValue>({ openTour: () => {} });

export function useTour() {
  return React.useContext(TourContext);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveTarget(target: TourStep["target"]): Element | null {
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

const text = (value: string | (() => string) | undefined) => (typeof value === "function" ? value() : value);

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Origin = "menu" | "tour";

const PAD = 8;
const CARD_W = 370;
const SEEN_KEY = "cms.tour.seen.v1";
const DONE_KEY = "cms.tour.completed.v1";

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Subscribing re-renders the card when filters change (live "Filters on" strip).
  const liveFilters = useFilterStore(useShallow(selectFilters));

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [steps, setSteps] = React.useState<TourStep[] | null>(null);
  const [lessonId, setLessonId] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState<Origin>("tour");
  const [index, setIndex] = React.useState(0);
  const [box, setBox] = React.useState<Box | null>(null);
  const [cursor, setCursor] = React.useState({ x: -80, y: -80, visible: false, clicking: false });
  const [ready, setReady] = React.useState(false);
  const [taskDone, setTaskDone] = React.useState(false);
  const [completed, setCompleted] = React.useState<string[]>([]);
  const [mounted, setMounted] = React.useState(false);
  const [cardSize, setCardSize] = React.useState({ w: CARD_W, h: 240 });

  const runId = React.useRef(0);
  const targetRef = React.useRef<Element | null>(null);
  const startFilters = React.useRef<Filters | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
    try {
      setCompleted(JSON.parse(window.localStorage.getItem(DONE_KEY) ?? "[]") as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  // First visit: offer the tour once, on the Overview page.
  React.useEffect(() => {
    if (window.location.pathname !== "/") return;
    try {
      if (window.localStorage.getItem(SEEN_KEY)) return;
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      return;
    }
    const timer = setTimeout(() => setMenuOpen(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const markDone = React.useCallback((id: string | null) => {
    if (!id) return;
    setCompleted((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        window.localStorage.setItem(DONE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /* ---- start / stop -------------------------------------------- */

  const begin = React.useCallback((list: TourStep[], id: string | null, from: Origin) => {
    setMenuOpen(false);
    setLessonId(id);
    setOrigin(from);
    setIndex(0);
    setSteps(list);
  }, []);

  const stopRunning = React.useCallback(() => {
    runId.current += 1;
    setSteps(null);
    setBox(null);
    setReady(false);
    setTaskDone(false);
    setCursor((value) => ({ ...value, visible: false }));
    closePopups();
  }, []);

  const endTour = React.useCallback(() => {
    stopRunning();
    setMenuOpen(false);
  }, [stopRunning]);

  const toMenu = React.useCallback(() => {
    stopRunning();
    setMenuOpen(true);
  }, [stopRunning]);

  const finishLesson = React.useCallback(() => {
    markDone(lessonId);
    if (origin === "menu") toMenu();
    else endTour();
  }, [lessonId, origin, markDone, toMenu, endTour]);

  const value = React.useMemo<TourContextValue>(() => ({ openTour: () => setMenuOpen(true) }), []);

  /* ---- keep the spotlight glued to its element ------------------ */

  const measure = React.useCallback(() => {
    const element = targetRef.current;
    if (!element || !element.isConnected) {
      setBox(null);
      return;
    }
    const r = element.getBoundingClientRect();
    // Keep the spotlight on screen: a very tall card is clipped to the visible window.
    const top = Math.max(r.top - PAD, 6);
    const bottom = Math.min(r.bottom + PAD, window.innerHeight - 6);
    const next = { top, left: r.left - PAD, width: r.width + PAD * 2, height: Math.max(0, bottom - top) };
    setBox((prev) =>
      prev &&
      Math.abs(prev.top - next.top) < 0.5 &&
      Math.abs(prev.left - next.left) < 0.5 &&
      Math.abs(prev.width - next.width) < 0.5 &&
      Math.abs(prev.height - next.height) < 0.5
        ? prev
        : next,
    );
  }, []);

  React.useEffect(() => {
    if (!steps) return;
    let timer = 0;
    const loop = () => {
      measure();
      timer = window.setTimeout(loop, 120);
    };
    loop();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [steps, measure]);

  /* ---- run the current step ------------------------------------ */

  React.useEffect(() => {
    if (!steps) return;
    const step = steps[index];
    if (!step) return;
    const id = ++runId.current;
    const alive = () => runId.current === id;
    setReady(false);
    setTaskDone(false);
    // Snapshot now, so a quick visitor who acts before the card settles still counts.
    startFilters.current = currentFilters();

    (async () => {
      // 1. Go to the right page.
      if (step.route && window.location.pathname !== step.route) {
        closePopups();
        router.push(step.route);
        await waitForPath(step.route);
        await sleep(500);
        if (!alive()) return;
      }

      // 2. Prepare the page (open a popup, close one...).
      if (step.before) {
        try {
          await step.before();
        } catch {
          /* show the step anyway */
        }
        await sleep(240);
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

      // 4. Glide the pointer over and (optionally) click.
      const clickEl = step.click ? await waitFor(() => resolveTarget(step.click), 3000) : element;
      if (!alive()) return;
      if (clickEl) {
        const r = clickEl.getBoundingClientRect();
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
          if (step.awaitRoute) {
            await waitForPath(step.awaitRoute);
            await sleep(700);
          } else await sleep(step.settle ?? 500);
          if (!alive()) return;
          // The click may have opened a page or a popup: find the target again.
          if (step.target) {
            const again = await waitFor(() => resolveTarget(step.target), 4000);
            if (!alive()) return;
            targetRef.current = again;
            again?.scrollIntoView({ behavior: "smooth", block: step.block ?? "center", inline: "nearest" });
            await sleep(300);
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

  /* ---- "try it yourself" steps: watch for the visitor's action ---- */

  const step = steps?.[index];

  React.useEffect(() => {
    if (!steps || !ready || !step?.interactive) return;
    const check = () => {
      const start = startFilters.current ?? currentFilters();
      if (step.interactive!.done(start, currentFilters())) {
        setTaskDone(true);
        return true;
      }
      return false;
    };
    if (check()) {
      if (step.interactive.autoNext) setIndex((i) => i + 1);
      return;
    }
    const timer = window.setInterval(() => {
      if (check()) {
        window.clearInterval(timer);
        if (step.interactive!.autoNext) window.setTimeout(() => setIndex((i) => i + 1), 450);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [steps, ready, step]);

  /* ---- navigation -------------------------------------------------- */

  const next = React.useCallback(() => {
    if (!steps) return;
    if (index >= steps.length - 1) finishLesson();
    else setIndex((i) => i + 1);
  }, [steps, index, finishLesson]);
  const back = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const choose = React.useCallback(
    async (choice: TourChoice) => {
      if (choice.run) await choice.run();
      if (choice.go === "next") next();
      else if (choice.go === "back") back();
      else if (choice.go === "menu") {
        markDone(lessonId);
        toMenu();
      } else endTour();
    },
    [next, back, toMenu, endTour, markDone, lessonId],
  );

  const help = React.useCallback(async () => {
    if (!step?.interactive?.help) return;
    const r = targetRef.current?.getBoundingClientRect();
    if (r) {
      setCursor({ x: r.left + Math.min(r.width / 2, 120), y: r.top + Math.min(r.height / 2, 60), visible: true, clicking: false });
      await sleep(600);
      setCursor((c) => ({ ...c, clicking: true }));
      await sleep(200);
    }
    await step.interactive.help();
    setCursor((c) => ({ ...c, clicking: false }));
  }, [step]);

  const canNext = Boolean(step) && ready && !step?.choices && (!step?.interactive || taskDone);

  /* ---- keyboard -------------------------------------------------- */

  React.useEffect(() => {
    if (!steps && !menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (steps) endTour();
        else setMenuOpen(false);
        return;
      }
      if (!steps) return;
      // Let the visitor type in filter search boxes during "try it" steps.
      const typing = (event.target as HTMLElement | null)?.closest?.("input, textarea");
      if (typing) return;
      if ((event.key === "ArrowRight" || event.key === "Enter") && canNext) {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [steps, menuOpen, next, back, endTour, canNext]);

  // Filter popups close on any mousedown outside the filter bar. Keep clicks on
  // the tour itself (card, shield) from reaching that listener; clicks inside
  // the spotlight hole go straight to the page and behave normally.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const stop = (event: Event) => event.stopPropagation();
    node.addEventListener("mousedown", stop);
    return () => node.removeEventListener("mousedown", stop);
  });

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

  void pathname;

  /* ---- layout of the explanation card ---------------------------- */

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
    const side = order.find((s) => fits[s as keyof typeof fits]) ?? "corner";
    let left: number;
    let top: number;
    if (side === "bottom" || side === "top") {
      left = box.left + box.width / 2 - w / 2;
      top = side === "bottom" ? box.top + box.height + gap : box.top - gap - h;
    } else if (side === "right" || side === "left") {
      top = box.top + box.height / 2 - h / 2;
      left = side === "right" ? box.left + box.width + gap : box.left - gap - w;
    } else {
      left = vw - w - 20;
      top = vh - h - 20;
    }
    left = Math.max(12, Math.min(left, vw - w - 12));
    top = Math.max(12, Math.min(top, vh - h - 12));
    return { left, top, w };
  }, [box, step, cardSize.h]);

  const sectionSteps = steps && step ? steps.filter((s) => s.section === step.section) : [];
  const sectionPos = step ? sectionSteps.indexOf(step) + 1 : 0;
  const filterSummary = describeFilters(liveFilters);
  const clickable = Boolean(step?.interactive && box && !taskDone);

  /* ---- render ----------------------------------------------------- */

  const overlay =
    mounted && (steps || menuOpen)
      ? createPortal(
          <div ref={rootRef} className="tour-root" role="dialog" aria-modal="true" aria-label="Guided tour">
            {menuOpen && !steps ? (
              <TourMenu
                completed={completed}
                filterSummary={filterSummary}
                onClose={() => setMenuOpen(false)}
                onQuick={() => begin(QUICK_START, "quick", "tour")}
                onFull={() => begin(FULL_TOUR, "full", "tour")}
                onLesson={(id) => {
                  const lesson = [...FILTER_LESSONS, ...PAGE_LESSONS].find((item) => item.id === id);
                  if (lesson) begin(lesson.steps, lesson.id, "menu");
                }}
                onClearFilters={() => useFilterStore.getState().clearAll()}
              />
            ) : null}

            {steps && step ? (
              <>
                {/* Shield: blocks the page, except the highlighted area during "try it" steps. */}
                {clickable && box ? (
                  <>
                    <div className="tour-shield" style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
                    <div className="tour-shield" style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }} />
                    <div className="tour-shield" style={{ top: box.top, left: 0, width: Math.max(0, box.left), height: box.height }} />
                    <div className="tour-shield" style={{ top: box.top, left: box.left + box.width, right: 0, height: box.height }} />
                  </>
                ) : (
                  <div className="tour-shield" style={{ inset: 0 }} />
                )}
                {box && step.target ? (
                  <div
                    className={`tour-spotlight${clickable ? " live" : ""}`}
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
                      {step.section}
                      {sectionSteps.length > 1 ? ` · ${sectionPos} of ${sectionSteps.length}` : ""}
                    </span>
                    <button type="button" className="tour-x" onClick={endTour} aria-label="Close tour">
                      <X width={15} height={15} />
                    </button>
                  </div>
                  <div className="tour-title">{step.title}</div>
                  <div className="tour-body">{text(step.body)}</div>

                  {step.interactive ? (
                    <div className={`tour-task${taskDone ? " done" : ""}`}>
                      {taskDone ? <Check width={14} height={14} /> : <MousePointerClick width={14} height={14} />}
                      <span>{taskDone ? "Done! Nice work." : text(step.watch) ?? "Your turn: try it on the highlighted area."}</span>
                      {!taskDone && step.interactive.help ? (
                        <button type="button" className="tour-help" onClick={help}>
                          <Wand2 width={12} height={12} />
                          {step.interactive.helpLabel ?? "Do it for me"}
                        </button>
                      ) : null}
                    </div>
                  ) : step.watch ? (
                    <div className="tour-watch">
                      <span className="tour-pulse" />
                      {text(step.watch)}
                    </div>
                  ) : null}

                  {step.showFilters ? (
                    <div className="tour-filters">
                      <Filter width={12} height={12} />
                      {filterSummary ? (
                        <>
                          <span>
                            Filters on: <strong>{filterSummary}</strong>
                          </span>
                          <button type="button" onClick={() => useFilterStore.getState().clearAll()}>
                            Clear all
                          </button>
                        </>
                      ) : (
                        <span>No filters on: showing all data</span>
                      )}
                    </div>
                  ) : null}

                  <div className="tour-progress">
                    <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
                  </div>

                  {step.choices ? (
                    <div className="tour-choices">
                      {step.choices.map((choice) => (
                        <button
                          key={choice.label}
                          type="button"
                          className={`tour-btn${choice.primary ? "" : " ghost"}`}
                          onClick={() => choose(choice)}
                          disabled={!ready}
                        >
                          {choice.label}
                          {choice.primary ? <ArrowRight width={14} height={14} /> : null}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="tour-actions">
                      <button type="button" className="tour-skip" onClick={origin === "menu" ? toMenu : endTour}>
                        {origin === "menu" ? "Back to menu" : "Exit tour"}
                      </button>
                      <span className="tour-count">
                        {index + 1} / {steps.length}
                      </span>
                      <button type="button" className="tour-btn ghost" onClick={back} disabled={index === 0} aria-label="Back">
                        <ArrowLeft width={14} height={14} />
                      </button>
                      <button type="button" className="tour-btn" onClick={next} disabled={!canNext}>
                        {index >= steps.length - 1 ? (origin === "menu" ? "Done" : "Finish") : "Next"}
                        {index < steps.length - 1 ? <ArrowRight width={14} height={14} /> : null}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <TourContext.Provider value={value}>
      {children}
      {overlay}
    </TourContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

function TourMenu({
  completed,
  filterSummary,
  onClose,
  onQuick,
  onFull,
  onLesson,
  onClearFilters,
}: {
  completed: string[];
  filterSummary: string;
  onClose: () => void;
  onQuick: () => void;
  onFull: () => void;
  onLesson: (id: string) => void;
  onClearFilters: () => void;
}) {
  const done = (id: string) => completed.includes(id);
  return (
    <div className="tour-chooser-wrap" onClick={onClose}>
      <div className="tour-chooser wide" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="tour-x" style={{ position: "absolute", top: 14, right: 14 }} onClick={onClose} aria-label="Close">
          <X width={16} height={16} />
        </button>
        <div className="tour-chooser-badge">
          <Sparkles width={14} height={14} /> Guided tour
        </div>
        <h2 className="tour-chooser-title">How would you like to learn?</h2>
        <p className="tour-chooser-text">
          Start with the quick version, or pick just the filter or page you need. You can stop whenever you have seen enough.
        </p>

        <div className="tour-starts">
          <button type="button" className="tour-option" onClick={onQuick}>
            <span className="tour-option-icon">
              <Rocket width={20} height={20} />
            </span>
            <span className="tour-option-text">
              <strong>Quick start {done("quick") ? <Check width={13} height={13} className="tour-tick" /> : null}</strong>
              <span>Try one filter yourself, then see one page.</span>
              <em>About 2 minutes · recommended</em>
            </span>
            <ArrowRight width={16} height={16} className="tour-option-go" />
          </button>
          <button type="button" className="tour-option" onClick={onFull}>
            <span className="tour-option-icon alt">
              <Compass width={20} height={20} />
            </span>
            <span className="tour-option-text">
              <strong>Full tour {done("full") ? <Check width={13} height={13} className="tour-tick" /> : null}</strong>
              <span>Every filter and every page, with stops to quit anytime.</span>
              <em>About 6 minutes</em>
            </span>
            <ArrowRight width={16} height={16} className="tour-option-go" />
          </button>
        </div>

        <div className="tour-lists">
          <div>
            <div className="tour-list-head">
              <Filter width={13} height={13} /> Try a filter yourself
            </div>
            <div className="tour-list">
              {FILTER_LESSONS.map((lesson) => (
                <button key={lesson.id} type="button" className={`tour-pill${done(lesson.id) ? " done" : ""}`} onClick={() => onLesson(lesson.id)} title={lesson.hint}>
                  {done(lesson.id) ? <Check width={12} height={12} /> : null}
                  {lesson.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="tour-list-head">
              <LayoutDashboard width={13} height={13} /> Learn a page
            </div>
            <div className="tour-list">
              {PAGE_LESSONS.map((lesson) => (
                <button key={lesson.id} type="button" className={`tour-pill${done(lesson.id) ? " done" : ""}`} onClick={() => onLesson(lesson.id)} title={lesson.hint}>
                  {done(lesson.id) ? <Check width={12} height={12} /> : null}
                  {lesson.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="tour-menu-foot">
          <span className="tour-keys">
            {filterSummary ? (
              <>
                Filters on: <strong>{filterSummary}</strong>
                <button type="button" className="tour-link" onClick={onClearFilters}>
                  Clear
                </button>
              </>
            ) : (
              <>
                <MousePointerClick width={13} height={13} /> <kbd>→</kbd> / <kbd>←</kbd> to move · <kbd>Esc</kbd> to stop
              </>
            )}
          </span>
          <button type="button" className="tour-btn ghost" onClick={onClose}>
            I&apos;m done
          </button>
        </div>
      </div>
    </div>
  );
}
