"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

interface ScanState {
  running: boolean;
  source: "web" | "dpma" | "euipo" | null;
  phase: string;
  progress: { current: number; total: number };
  newHits: number;
  errors: number;
  startedAt: number | null;
  lastMessage: string;
}

interface ScanContextType {
  state: ScanState;
  startScan: (endpoint: string, body: Record<string, unknown>, source: ScanState["source"]) => void;
  stopScan: () => void;
}

const defaultState: ScanState = {
  running: false,
  source: null,
  phase: "idle",
  progress: { current: 0, total: 0 },
  newHits: 0,
  errors: 0,
  startedAt: null,
  lastMessage: "",
};

const ScanContext = createContext<ScanContextType>({
  state: defaultState,
  startScan: () => {},
  stopScan: () => {},
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

  const startScan = useCallback(
    (endpoint: string, body: Record<string, unknown>, source: ScanState["source"]) => {
      // Falls schon ein Scan läuft, abbrechen
      abortRef.current?.abort();

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setState({
        running: true,
        source,
        phase: "connecting",
        progress: { current: 0, total: 0 },
        newHits: 0,
        errors: 0,
        startedAt: Date.now(),
        lastMessage: "Verbinde…",
      });

      (async () => {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });

          if (!res.ok || !res.body) {
            setState((s) => ({
              ...s,
              running: false,
              phase: "error",
              lastMessage: `HTTP ${res.status}`,
            }));
            return;
          }

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
              try {
                const evt = JSON.parse(json) as Record<string, unknown>;
                setState((s) => {
                  const next = { ...s };
                  switch (evt.type) {
                    case "status":
                      next.lastMessage = String(evt.message ?? "");
                      next.phase = "running";
                      break;
                    case "browser:start":
                      next.phase = "browser";
                      next.lastMessage = "Browser wird gestartet…";
                      break;
                    case "browser:loaded":
                      next.lastMessage = `${evt.trefferCount} Treffer gefunden`;
                      break;
                    case "browser:done":
                      next.progress = { current: 0, total: Number(evt.hitCount ?? 0) };
                      break;
                    case "city:start":
                      next.lastMessage = String(evt.message ?? "");
                      break;
                    case "city:done":
                      next.progress = {
                        current: s.progress.current + 1,
                        total: s.progress.total || s.progress.current + 1,
                      };
                      break;
                    case "analyze:start":
                      next.progress = {
                        current: Number(evt.index ?? s.progress.current),
                        total: Number(evt.total ?? s.progress.total),
                      };
                      next.lastMessage = `Analysiere: ${evt.markenname}`;
                      break;
                    case "hit:new":
                      next.newHits = s.newHits + 1;
                      break;
                    case "error":
                      next.errors = s.errors + 1;
                      break;
                    case "done":
                      next.running = false;
                      next.phase = "done";
                      next.newHits = Number(evt.newHits ?? evt.newTrademarks ?? s.newHits);
                      next.lastMessage = "Abgeschlossen";
                      break;
                  }
                  return next;
                });
              } catch {}
            }
          }

          setState((s) =>
            s.phase !== "done" ? { ...s, running: false, phase: "done", lastMessage: "Stream beendet" } : s,
          );
        } catch (e) {
          if ((e as Error).name !== "AbortError") {
            setState((s) => ({
              ...s,
              running: false,
              phase: "error",
              lastMessage: (e as Error).message,
            }));
          }
        }
      })();
    },
    [],
  );

  return (
    <ScanContext.Provider value={{ state, startScan, stopScan }}>
      {children}
    </ScanContext.Provider>
  );
}
