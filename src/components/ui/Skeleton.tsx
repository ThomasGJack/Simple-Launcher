import { cn } from "@/lib/cn";

/**
 * Reusable shimmer skeleton blocks. Use these instead of generic `…` /
 * spinners while data is loading — they preserve layout (no jump on
 * arrival) and give users a sense of "almost there".
 *
 * The shimmer animation is a CSS-only gradient sweep defined in
 * `index.css` under the `animate-shimmer` utility — pure GPU, no JS cost.
 */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-white/[0.04] ring-1 ring-white/[0.04]",
        // Shimmer overlay — pseudo-element-style via a child, avoids leaking
        // background-image stacking on the parent.
        "after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-white/[0.05] after:to-transparent",
        className,
      )}
    />
  );
}

/**
 * Full-page placeholder used as the Suspense fallback for code-split routes.
 * Hero + grid pattern that vaguely resembles the most-common layouts so the
 * crossfade to the real content feels smooth.
 */
export function PageSkeleton() {
  return (
    <div className="h-full overflow-hidden p-12">
      <Skeleton className="mb-3 h-3 w-32 rounded-full" />
      <Skeleton className="mb-8 h-12 w-72" />
      <div className="grid grid-cols-12 gap-5">
        <Skeleton className="col-span-8 aspect-[16/9]" />
        <div className="col-span-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="col-span-5 h-48" />
        <Skeleton className="col-span-7 h-48" />
      </div>
    </div>
  );
}

/** Compact single-card skeleton for list rows / module tiles. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl glass p-4", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      </div>
    </div>
  );
}

/** Single-line text shimmer for tight spaces. */
export function LineSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-3 rounded-full", className)} />;
}
