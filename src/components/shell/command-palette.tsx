"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";

import { ICONS } from "@/components/shell/icons";
import { NAV } from "@/components/shell/nav";

interface Command {
  label: string;
  meta: string;
  icon: string;
  run: () => void;
}

/** ⌘K palette from the draft: jump to a page or trigger a common action. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = React.useState("");
  const [index, setIndex] = React.useState(0);

  const commands = React.useMemo<Command[]>(
    () => [
      ...NAV.map((entry) => ({
        label: entry.label,
        meta: entry.group,
        icon: entry.icon,
        run: () => router.push(entry.href),
      })),
      {
        label: "Upload new dataset",
        meta: "Action",
        icon: "upload",
        run: () => router.push("/data-upload"),
      },
      {
        label: "Download PDF report",
        meta: "Action",
        icon: "report",
        run: () => window.open("/api/report/pdf", "_blank"),
      },
      {
        label: "Download Excel workbook",
        meta: "Action",
        icon: "report",
        run: () => window.open("/api/report/xlsx", "_blank"),
      },
    ],
    [router],
  );

  const results = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(needle) || command.meta.toLowerCase().includes(needle),
    );
  }, [commands, term]);

  React.useEffect(() => setIndex(0), [term]);
  React.useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((value) => Math.min(value + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      results[index]?.run();
      onClose();
    } else if (event.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      className={`cmdk-overlay${open ? " open" : ""}`}
      role="presentation"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input-row">
          <Search className="icon" width={17} height={17} />
          <input
            autoFocus={open}
            value={term}
            placeholder="Search pages and actions…"
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="kbd" style={{ fontSize: 10.5 }}>
            ESC
          </span>
        </div>
        <div className="cmdk-results">
          {results.length === 0 ? (
            <div className="empty-state">
              <p>No matches for “{term}”.</p>
            </div>
          ) : (
            results.map((command, position) => {
              const Icon = ICONS[command.icon];
              return (
                <button
                  key={command.label}
                  type="button"
                  className={`cmdk-result${position === index ? " sel" : ""}`}
                  style={{ width: "100%", border: "none", textAlign: "left" }}
                  onMouseEnter={() => setIndex(position)}
                  onClick={() => {
                    command.run();
                    onClose();
                  }}
                >
                  <Icon className="icon" width={16} height={16} />
                  <span style={{ fontWeight: 600, fontSize: 12.5 }}>{command.label}</span>
                  <span className="meta" style={{ marginLeft: "auto" }}>
                    {command.meta}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="cmdk-foot">
          <span>
            <span className="kbd">↑↓</span> navigate
          </span>
          <span>
            <span className="kbd">
              <CornerDownLeft width={9} height={9} />
            </span>{" "}
            open
          </span>
          <span>
            <span className="kbd">esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
