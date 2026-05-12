"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useMemo } from "react";
import type { HitStatus } from "@/lib/types";

export interface KanbanCard {
  id: string;
  title: string;
  sub: string;
  score: number | null;
  status: HitStatus;
  city: string | null;
  lastSeen: string;
  totalCount: number;
  source: string;
  href: string;
  type: "hit" | "trademark";
}

const COLUMN_STATUS: Record<"open" | "review" | "done", HitStatus> = {
  open: "new",
  review: "reviewing",
  done: "confirmed",
};

const DONE_STATUSES = new Set(["confirmed", "dismissed", "sent_to_lawyer", "resolved"]);

function cardColumn(card: KanbanCard): "open" | "review" | "done" {
  if (card.status === "new") return "open";
  if (card.status === "reviewing") return "review";
  return "done";
}

const SOURCE_BADGE: Record<string, string> = {
  web: "bg-sky-100 text-sky-700",
  dpma: "bg-violet-100 text-violet-700",
  euipo: "bg-indigo-100 text-indigo-700",
  import: "bg-stone-100 text-stone-500",
  handelsregister: "bg-teal-100 text-teal-700",
};

const STATUS_CHIP: Record<HitStatus, string> = {
  new: "bg-stone-100 text-stone-600",
  reviewing: "bg-amber-100 text-amber-700",
  confirmed: "bg-rose-100 text-rose-700",
  dismissed: "bg-emerald-100 text-emerald-700",
  sent_to_lawyer: "bg-purple-100 text-purple-700",
  resolved: "bg-sky-100 text-sky-700",
};

const STATUS_LABEL: Record<HitStatus, string> = {
  new: "Offen",
  reviewing: "In Prüfung",
  confirmed: "Bestätigt",
  dismissed: "Verworfen",
  sent_to_lawyer: "An Anwalt",
  resolved: "Erledigt",
};

function scoreBg(score: number | null) {
  if (score === null) return "bg-stone-200/70 text-stone-600";
  if (score >= 7) return "bg-rose-100 text-rose-800";
  if (score >= 4) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

async function updateStatus(card: KanbanCard, newStatus: HitStatus) {
  if (card.type === "hit") {
    await fetch(`/api/hits/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  } else {
    await fetch(`/api/trademarks/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_status: newStatus }),
    });
  }
}

function KanbanCardItem({
  card,
  isDragging,
  onDragStart,
}: {
  card: KanbanCard;
  isDragging: boolean;
  onDragStart: (card: KanbanCard) => void;
}) {
  const sourceLabel = card.source === "dpma" ? "DPMA" : card.source === "euipo" ? "EUIPO" : card.source === "import" ? "Import" : card.source === "handelsregister" ? "HR" : "Web";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(card);
      }}
      className={`group relative cursor-grab rounded-xl border border-white/60 bg-white/50 p-3 transition select-none
        active:cursor-grabbing hover:bg-white/80 hover:shadow-sm
        ${isDragging ? "opacity-40 scale-95" : "opacity-100"}`}
    >
      <div className="absolute right-2 top-2 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-30">
        {[0, 1, 2].map((i) => <div key={i} className="h-0.5 w-3 rounded-full bg-stone-500" />)}
      </div>

      <Link
        href={card.href}
        onClick={(e) => e.stopPropagation()}
        className="flex items-start gap-3"
        draggable={false}
      >
        <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${scoreBg(card.score)}`}>
          {card.score ?? "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-stone-900">{card.title}</p>
            {card.totalCount > 1 && (
              <span className="ml-1 mt-0.5 shrink-0 rounded-full bg-stone-800/80 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                +{card.totalCount - 1}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-stone-400">{card.sub}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${SOURCE_BADGE[card.source] ?? SOURCE_BADGE.web}`}>
              {sourceLabel}
            </span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_CHIP[card.status]}`}>
              {STATUS_LABEL[card.status]}
            </span>
            {card.city && <span className="text-[10px] text-stone-400">{card.city}</span>}
            <span className="ml-auto text-[10px] text-stone-300">
              {new Date(card.lastSeen).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

interface ColumnProps {
  id: "open" | "review" | "done";
  title: string;
  color: string;
  cards: KanbanCard[];
  emptyText: string;
  isDragOver: boolean;
  draggingCard: KanbanCard | null;
  onDragOver: (colId: "open" | "review" | "done") => void;
  onDragLeave: () => void;
  onDrop: (colId: "open" | "review" | "done") => void;
  onDragStart: (card: KanbanCard) => void;
}

function KanbanColumn({
  id, title, color, cards, emptyText,
  isDragOver, draggingCard, onDragOver, onDragLeave, onDrop, onDragStart,
}: ColumnProps) {
  const canDrop = draggingCard !== null && cardColumn(draggingCard) !== id;

  return (
    <div
      className={`glass flex min-h-[200px] flex-col rounded-2xl overflow-hidden transition-all duration-150
        ${isDragOver && canDrop ? "ring-2 ring-stone-400 ring-offset-2 ring-offset-transparent" : ""}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(id); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(id); }}
    >
      <div className={`flex items-center justify-between border-b border-white/60 px-4 py-3 ${color}
        ${isDragOver && canDrop ? "bg-stone-100/80" : ""}`}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">{cards.length}</span>
        </div>
      </div>

      {isDragOver && canDrop && (
        <div className="mx-3 mt-2 flex items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50/60 py-3 text-xs font-medium text-stone-400">
          Hier ablegen
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-3 max-h-[calc(100vh-340px)]">
        {cards.length === 0 && !isDragOver && (
          <p className="px-1 py-6 text-center text-xs text-stone-400">{emptyText}</p>
        )}
        {cards.map((c) => (
          <KanbanCardItem
            key={`${c.source}-${c.id}`}
            card={c}
            isDragging={draggingCard?.id === c.id}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  );
}

// ── Filter constants ───────────────────────────────────────────────────────────

const SCORE_OPTIONS = [
  { value: 0, label: "Alle" },
  { value: 3, label: "≥ 3" },
  { value: 5, label: "≥ 5" },
  { value: 7, label: "≥ 7" },
  { value: 9, label: "≥ 9" },
] as const;

const SOURCE_OPTIONS = [
  { id: "web", label: "Web", active: "bg-sky-500 text-white", inactive: "bg-sky-50 text-sky-600 hover:bg-sky-100" },
  { id: "dpma", label: "DPMA", active: "bg-violet-500 text-white", inactive: "bg-violet-50 text-violet-600 hover:bg-violet-100" },
  { id: "euipo", label: "EUIPO", active: "bg-indigo-500 text-white", inactive: "bg-indigo-50 text-indigo-600 hover:bg-indigo-100" },
  { id: "import", label: "Import", active: "bg-stone-600 text-white", inactive: "bg-stone-100 text-stone-500 hover:bg-stone-200" },
] as const;

// ── KanbanBoard ───────────────────────────────────────────────────────────────────

export function KanbanBoard({ cards: initialCards }: { cards: KanbanCard[] }) {
  const [allCards, setAllCards] = useState<KanbanCard[]>(initialCards);

  const [minScore, setMinScore] = useState<number>(0);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
  const [activeType, setActiveType] = useState<"all" | "hit" | "trademark">("all");

  const [draggingCard, setDraggingCard] = useState<KanbanCard | null>(null);
  const [dragOverCol, setDragOverCol] = useState<"open" | "review" | "done" | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleSource = useCallback((src: string) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  }, []);

  const { openCards, reviewCards, doneCards, filteredTotal } = useMemo(() => {
    const filtered = allCards.filter((c) => {
      if (minScore > 0 && (c.score ?? 0) < minScore) return false;
      if (activeSources.size > 0 && !activeSources.has(c.source)) return false;
      if (activeType !== "all" && c.type !== activeType) return false;
      return true;
    });
    return {
      openCards: filtered.filter((c) => c.status === "new"),
      reviewCards: filtered.filter((c) => c.status === "reviewing"),
      doneCards: filtered.filter((c) => DONE_STATUSES.has(c.status)),
      filteredTotal: filtered.length,
    };
  }, [allCards, minScore, activeSources, activeType]);

  const hasActiveFilter = minScore > 0 || activeSources.size > 0 || activeType !== "all";

  const handleDragStart = useCallback((card: KanbanCard) => setDraggingCard(card), []);

  const handleDragOver = useCallback((colId: "open" | "review" | "done") => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    setDragOverCol(colId);
  }, []);

  const handleDragLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setDragOverCol(null), 80);
  }, []);

  const handleDrop = useCallback((targetCol: "open" | "review" | "done") => {
    setDragOverCol(null);
    if (!draggingCard) return;
    const sourceCol = cardColumn(draggingCard);
    if (sourceCol === targetCol) { setDraggingCard(null); return; }

    let newStatus: HitStatus = COLUMN_STATUS[targetCol];
    if (targetCol === "done" && DONE_STATUSES.has(draggingCard.status)) {
      newStatus = draggingCard.status;
    }

    setAllCards((prev) =>
      prev.map((c) => c.id === draggingCard.id ? { ...c, status: newStatus } : c),
    );
    setDraggingCard(null);
    updateStatus(draggingCard, newStatus).catch(console.error);
  }, [draggingCard]);

  const handleDragEnd = useCallback(() => {
    setDraggingCard(null);
    setDragOverCol(null);
  }, []);

  const colDefs: Array<{ id: "open" | "review" | "done"; title: string; color: string; emptyText: string }> = [
    { id: "open", title: "Offen", color: "bg-stone-50/60", emptyText: "Keine offenen Treffer." },
    { id: "review", title: "In Bearbeitung", color: "bg-amber-50/60", emptyText: "Keine Treffer in Bearbeitung." },
    { id: "done", title: "Bearbeitet", color: "bg-emerald-50/40", emptyText: "Noch keine abgeschlossenen Treffer." },
  ];

  const colCards: Record<"open" | "review" | "done", KanbanCard[]> = {
    open: openCards,
    review: reviewCards,
    done: doneCards,
  };

  return (
    <div onDragEnd={handleDragEnd}>
      {/* Filter Bar */}
      <div className="glass mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        {/* Score */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Score</span>
          <div className="flex gap-1">
            {SCORE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMinScore(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  minScore === opt.value
                    ? "bg-stone-900 text-white shadow-sm"
                    : "bg-white/60 text-stone-500 hover:bg-white/90 hover:text-stone-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Quelle</span>
          <button
            type="button"
            onClick={() => setActiveSources(new Set())}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              activeSources.size === 0
                ? "bg-stone-900 text-white shadow-sm"
                : "bg-white/60 text-stone-500 hover:bg-white/90 hover:text-stone-800"
            }`}
          >
            Alle
          </button>
          {SOURCE_OPTIONS.map((src) => (
            <button
              key={src.id}
              type="button"
              onClick={() => toggleSource(src.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeSources.has(src.id) ? src.active : src.inactive
              }`}
            >
              {src.label}
            </button>
          ))}
        </div>

        {/* Type */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Typ</span>
          {(["all", "hit", "trademark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveType(t)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeType === t
                  ? "bg-stone-900 text-white shadow-sm"
                  : "bg-white/60 text-stone-500 hover:bg-white/90 hover:text-stone-800"
              }`}
            >
              {t === "all" ? "Alle" : t === "hit" ? "Treffer" : "Marken"}
            </button>
          ))}
        </div>

        {/* Result count + reset */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-stone-400">
            {filteredTotal} {filteredTotal === 1 ? "Eintrag" : "Einträge"}
            {hasActiveFilter && ` von ${allCards.length}`}
          </span>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => { setMinScore(0); setActiveSources(new Set()); setActiveType("all"); }}
              className="rounded-full border border-stone-200 px-3 py-1 text-[11px] text-stone-500 hover:border-stone-400 hover:text-stone-800 transition"
            >
              Filter zurücksetzen ×
            </button>
          )}
        </div>
      </div>

      {/* Columns */}
      <div className="grid gap-4 lg:grid-cols-3">
        {colDefs.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            color={col.color}
            cards={colCards[col.id]}
            emptyText={col.emptyText}
            isDragOver={dragOverCol === col.id}
            draggingCard={draggingCard}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
          />
        ))}
      </div>
    </div>
  );
}
