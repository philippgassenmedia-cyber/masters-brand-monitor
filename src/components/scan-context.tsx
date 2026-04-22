"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

export interface ScanLogLine {
  ts: number;
  tone: "info" | "ok" | "warn" | "err";
  text: string;
}

export interface ScanState {
  running: boolean;
  source: "web" | "dpma" | "euipo" | null;
  phase: string;
  progress: { current: number; total: number };
  newHits: number;
  updatedCount: number;
  errors: number;
  startedAt: number | null;
  lastMessage: string;
  log: ScanLogLine[];
  rawHits: Record<string, unknown>[];
  cityStates: Record<string, "active" | "done">;
  hitCounts: Record<string, number>;
  queriesCount: number;
  rawCount: number;
}

interface ScanContextType {
  state: ScanState;
  startScan: (endpoints: string[], body: Record<string, unknown>, source: ScanState["source"]) => void;
  stopScan: () => void;
  clearScan: () => void;
}

const defaultState: ScanState = {
  running: false,
  source: null,
  phase: "idle",
  progress: { current: 0, total: 0 },
  newHits: 0,
  updatedCount: 0,
  errors: 0,
  startedAt: null,
  lastMessage: "",
  log: [],
  rawHits: [],
  cityStates: {},
  hitCounts: {},
  queriesCount: 0,
  rawCount: 0,
};

const ScanContext = createContext<ScanContextType>({
  state: defaultState,
  startScan: () => {},
  stopScan: () => {},
  clearScan: () => {},
});

export function useScan() {
  return useContext(ScanContext);
}

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ScanState>(defaultState);
  const abortRef = useRef<AbortController | null>(null);

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, running: false, phase: "stopped" }));
  }, []);

  const clearScan = useCallback(() => {
    setState(defaultState);
  }, []);

  const startScan = useCallback(
    (endpoints: string[], body: Record<string, unknown>, source: ScanState["source"]) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setState({ ...defaultState, running: true, source, phase: "connecting", startedAt: Date.now(), lastMessage: "Verbinde…" });

      const processEvent = (evt: Record<string, unknown>, streamLabel?: string) => {
        setState((s) => {
          const next = { ...s };
          const prefix = streamLabel ? `[${streamLabel}] ` : "";
          let logEntry: ScanLogLine | null = null;

          switch (evt.type) {
            case "status": {
              const msg = String(evt.message ?? "");
              next.lastMessage = prefix + msg;
              if (next.phase === "connecting") next.phase = "running";
              logEntry = { ts: Date.now(), tone: "info", text: prefix + msg };
              break;
            }
            case "browser:start":
              next.phase = "browser";
              next.lastMessage = "Browser wird gestartet…";
              logEntry = { ts: Date.now(), tone: "info", text: prefix + "Chrome wird gestartet…" };
              break;
            case "browser:loaded":
              next.lastMessage = `${evt.trefferCount} Treffer gefunden`;
              logEntry = { ts: Date.now(), tone: "ok", text: prefix + `DPMAregister: ${evt.trefferCount} Treffer` };
              break;
            case "browser:done":
              next.progress = { current: 0, total: Number(evt.hitCount ?? 0) };
              logEntry = { ts: Date.now(), tone: "ok", text: prefix + `Browser geschlossen. ${evt.hitCount} Treffer.` };
              break;
            case "query:start": {
              next.queriesCount = s.queriesCount + 1;
              next.progress = { current: Number(evt.index ?? 0), total: Number(evt.total ?? 0) };
              const qMsg = `[${evt.index}/${evt.total}] ${evt.query}`;
              next.lastMessage = qMsg;
              if (evt.city) next.cityStates = { ...s.cityStates, [String(evt.city)]: "active" };
              logEntry = { ts: Date.now(), tone: "info", text: qMsg };
              break;
            }
            case "query:done":
              if (evt.city) next.cityStates = { ...s.cityStates, [String(evt.city)]: "done" };
              next.rawCount = s.rawCount + Number(evt.resultCount ?? 0);
              logEntry = { ts: Date.now(), tone: "ok", text: `${evt.resultCount} Ergebnisse` };
              break;
            case "analyze:start": {
              const aMsg = `[${evt.index}/${evt.total}] Analysiere: ${evt.markenname}`;
              next.progress = { current: Number(evt.index ?? s.progress.current), total: Number(evt.total ?? s.progress.total) };
              next.lastMessage = aMsg;
              logEntry = { ts: Date.now(), tone: "info", text: prefix + aMsg };
              break;
            }
            case "analyze:done":
              logEntry = { ts: Date.now(), tone: "ok", text: prefix + `Bewertet: ${evt.markenname} · Score ${evt.score ?? "—"} · ${evt.matchType}` };
              break;
            case "hit:new":
              next.newHits = s.newHits + 1;
              next.rawHits = [evt, ...s.rawHits].slice(0, 200);
              if (evt.city) next.hitCounts = { ...s.hitCounts, [String(evt.city)]: (s.hitCounts[String(evt.city)] ?? 0) + 1 };
              if (evt.domain) logEntry = { ts: Date.now(), tone: "ok", text: `Neu: ${evt.domain} (Score ${evt.score ?? "—"})` };
              else if (evt.markenname) logEntry = { ts: Date.now(), tone: "ok", text: prefix + `Neu: ${evt.markenname} (${evt.aktenzeichen})${evt.website ? ` → ${evt.website}` : ""}` };
              break;
            case "hit:update":
              next.updatedCount = s.updatedCount + 1;
              break;
            case "hit:dup":
              next.updatedCount = s.updatedCount + 1;
              logEntry = { ts: Date.now(), tone: "info", text: prefix + `Bekannt: ${evt.aktenzeichen}` };
              break;
            case "error":
              next.errors = s.errors + 1;
              logEntry = { ts: Date.now(), tone: "err", text: prefix + String(evt.message ?? "") };
              break;
            case "done":
              if (evt.newHits !== undefined)
                logEntry = { ts: Date.now(), tone: "ok", text: `Fertig: ${evt.newHits} neu, ${evt.updated} aktualisiert, ${evt.errors} Fehler` };
              else if (evt.newTrademarks !== undefined)
                logEntry = { ts: Date.now(), tone: "ok", text: prefix + `Fertig: ${evt.newTrademarks} neu, ${evt.updated} bekannt, ${evt.errors} Fehler` };
              break;
          }

          if (logEntry) next.log = [...s.log.slice(-299), logEntry];
          return next;
        });
      };

      const runStream = async (endpoint: string, label?: string) => {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data:")) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            try { processEvent(JSON.parse(json), label); } catch {}
          }
        }
      };

      (async () => {
        try {
          if (endpoints.length === 1) {
            await runStream(endpoints[0]);
          } else {
            await Promise.all(
              endpoints.map((ep) => runStream(ep, ep.includes("euipo") ? "EUIPO" : "DPMA")),
            );
          }
          setState((s) => ({ ...s, running: false, phase: "done", lastMessage: "Abgeschlossen" }));
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            setState((s) => ({ ...s, running: false, phase: "error", lastMessage: (e as Error).message }));
          }
        }
      })();
    },
    [],
  );

  return (
    <ScanContext.Provider value={{ state, startScan, stopScan, clearScan }}>
      {children}
    </ScanContext.Provider>
  );
}
