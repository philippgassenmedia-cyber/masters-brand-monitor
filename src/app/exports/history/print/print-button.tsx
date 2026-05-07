"use client";

export function PrintButton() {
  return (
    <button
      className="print-btn"
      onClick={() => window.print()}
    >
      Drucken
    </button>
  );
}
