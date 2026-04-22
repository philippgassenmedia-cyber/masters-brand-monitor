"use client";

import { useState, type ReactNode } from "react";

export function MobileShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-300 ease-in-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative h-full p-3">
          {sidebar}
          <button
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-stone-600 shadow hover:bg-white"
            aria-label="Menü schließen"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Desktop sidebar (hidden on mobile) */}
      <div className="hidden md:block">
        {sidebar}
      </div>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 shadow-sm hover:bg-white/90"
            aria-label="Menü öffnen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-sm font-black text-white">M</div>
            <span className="text-sm font-semibold text-stone-900">Brand Monitor</span>
          </div>
        </div>

        {/* Page content */}
        <div className="scroll-area min-w-0 flex-1 overflow-y-auto rounded-2xl px-1 pb-4 pt-1">
          {children}
        </div>
      </div>
    </>
  );
}
