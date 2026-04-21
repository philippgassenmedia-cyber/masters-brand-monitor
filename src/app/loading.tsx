export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-300 border-t-stone-900" />
        <span className="text-xs text-stone-500">Laden…</span>
      </div>
    </div>
  );
}
