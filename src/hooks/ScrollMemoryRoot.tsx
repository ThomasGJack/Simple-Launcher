import { useRef } from "react";
import { useScrollMemory } from "./useScrollMemory";

/**
 * Convenience wrapper : a `<div>` with the standard `scroll-y-only`
 * class + scroll-memory wired up. Most page-level scroll containers
 * have the same shape, so this saves the boilerplate of declaring a
 * ref + calling the hook in every page.
 *
 * Pages that need extra props on the root div (e.g. style, custom
 * className) can still use the bare `useScrollMemory(ref, key)`
 * hook from `useScrollMemory.ts`.
 */
export function ScrollMemoryRoot({
  routeKey,
  className,
  children,
  ...rest
}: {
  routeKey: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "ref" | "children">) {
  const ref = useRef<HTMLDivElement | null>(null);
  useScrollMemory(ref, routeKey);
  return (
    <div
      ref={ref}
      className={`scroll-y-only relative h-full ${className ?? ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}
