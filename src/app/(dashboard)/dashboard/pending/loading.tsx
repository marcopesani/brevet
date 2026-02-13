export default function PendingLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
