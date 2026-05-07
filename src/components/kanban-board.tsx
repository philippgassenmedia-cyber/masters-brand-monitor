"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
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

// Column id → which statuses live there + what status to assign on drop
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
      {/* drag handle hint */}
      <div className="absolute right-2 top-2 flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-30">
        {[0,1,2].map(i => <div key={i} className="h-0.5 w-3 rounded-full bg-stone-500" />)}
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
  total: number;
  fullView: boolean;
  emptyText: string;
  isDragOver: boolean;
  draggingCard: KanbanCard | null;
  onDragOver: (colId: "open" | "review" | "done") => void;
  onDragLeave: () => void;
  onDrop: (colId: "open" | "review" | "done") => void;
  onDragStart: (card: KanbanCard) => void;
  fullViewLink: string;
}

function KanbanColumn({
  id, title, color, cards, total, fullView, emptyText,
  isDragOver, draggingCard, onDragOver, onDragLeave, onDrop, onDragStart, fullViewLink,
}: ColumnProps) {
  const shown = fullView ? cards : cards.slice(0, 15);
  const hidden = total - shown.length;
  const canDrop = draggingCard !== null && cardColumn(draggingCard) !== id;

  return (
    <div
      className={`glass flex min-h-[200px] flex-col rounded-2xl overflow-hidden transition-all duration-150
        ${isDragOver && canDrop ? "ring-2 ring-stone-400 ring-offset-2 ring-offset-transparent" : ""}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(id); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(id); }}
    >
      {/* Header */}
      <div className={`flex items-center justify-between border-b border-white/60 px-4 py-3 ${color}
        ${isDragOver && canDrop ? "bg-stone-100/80" : ""}`}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">{total}</span>
        </div>
        {!fullView && total > 0 && (
          <Link href={fullViewLink} className="text-[10px] font-medium text-stone-500 hover:text-stone-800">
            Alle →
          </Link>
        )}
      </div>

      {/* Drop target hint */}
      {isDragOver && canDrop && (
        <div className="mx-3 mt-2 flex items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-stone-50/60 py-3 text-xs font-medium text-stone-400">
          Hier ablegen
        </div>
      )}

      {/* Cards */}
      <div className={`flex-1 space-y-2 overflow-y-auto p-3 ${fullView ? "max-h-[calc(100vh-280px)]" : ""}`}>
        {shown.length === 0 && !isDragOver && (
          <p className="px-1 py-6 text-center text-xs text-stone-400">{emptyText}</p>
        )}
        {shown.map((c) => (
          <KanbanCardItem
            key={`${c.source}-${c.id}`}
            card={c}
            isDragging={draggingCard?.id === c.id}
            onDragStart={onDragStart}
          />
        ))}
        {!fullView && hidden > 0 && (
          <Link
            href={fullViewLink}
            className="block rounded-xl border border-dashed border-stone-200 py-2 text-center text-xs text-stone-400 hover:border-stone-400 hover:text-stone-600"
          >
            + {hidden} weitere
          </Link>
        )}
      </div>
    </div>
  );
}

export function KanbanBoard({
  initialOpen,
  initialReview,
  initialDone,
  fullView,
}: {
  initialOpen: KanbanCard[];
  initialReview: KanbanCard[];
  initialDone: KanbanCard[];
  fullView: boolean;
}) {
  const [columns, setColumns] = useState<Record<"open" | "review" | "done", KanbanCard[]>>({
    open: initialOpen,
    review: initialReview,
    done: initialDone,
  });
  const [draggingCard, setDraggingCard] = useState<KanbanCard | null>(null);
  const [dragOverCol, setDragOverCol] = useState<"open" | "review" | "done" | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDragStart = useCallback((card: KanbanCard) => {
    setDraggingCard(card);
  }, []);

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

    // Determine new status
    let newStatus: HitStatus = COLUMN_STATUS[targetCol];
    // Preserve more specific "done" statuses when dragging within done column
    if (targetCol === "done" && DONE_STATUSES.has(draggingCard.status)) {
      newStatus = draggingCard.status;
    }

    // Optimistic update
    setColumns((prev) => {
      const updated = { ...prev };
      updated[sourceCol] = prev[sourceCol].filter((c) => c.id !== draggingCard.id);
      const movedCard = { ...draggingCard, status: newStatus };
      updated[targetCol] = [movedCard, ...prev[targetCol]];
      return updated;
    });
    setDraggingCard(null);

    // API call (fire and forget — no rollback for now)
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

  const fullViewLink = fullView ? "/" : "/?view=all";

  return (
    <div
      className="grid gap-4 lg:grid-cols-3"
      onDragEnd={handleDragEnd}
    >
      {colDefs.map((col) => (
        <KanbanColumn
          key={col.id}
          id={col.id}
          title={col.title}
          color={col.color}
          cards={columns[col.id]}
          total={columns[col.id].length}
          fullView={fullView}
          emptyText={col.emptyText}
          isDragOver={dragOverCol === col.id}
          draggingCard={draggingCard}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragStart={handleDragStart}
          fullViewLink={fullViewLink}
        />
      ))}
    </div>
  );
}
