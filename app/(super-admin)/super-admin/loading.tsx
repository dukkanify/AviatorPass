export default function Loading() {
  return (
    <div className="space-y-6 p-1" aria-busy="true">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Platform overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Loading live counts…</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-muted/70" />
        ))}
      </div>
    </div>
  );
}
