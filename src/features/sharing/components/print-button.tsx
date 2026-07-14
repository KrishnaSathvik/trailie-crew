"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="public-print-button border-foreground hover:bg-foreground hover:text-background focus-visible:ring-ring min-h-11 rounded-full border px-5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Print or save as PDF
    </button>
  );
}
