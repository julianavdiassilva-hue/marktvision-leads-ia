export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-64 rounded-lg bg-surface" />
      <div className="h-4 w-96 max-w-full rounded bg-surface" />
      <div className="h-64 rounded-xl bg-surface" />
    </div>
  );
}
