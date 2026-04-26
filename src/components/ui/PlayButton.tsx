import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { cn } from "@/lib/cn";

type PlayButtonProps = {
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

export function PlayButton({ label = "JOUER", onClick, disabled, className }: PlayButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "no-drag group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl px-12 py-5 font-display text-2xl tracking-[0.2em] text-bg-base",
        "bg-gradient-to-r from-accent via-cyan-300 to-accent bg-[length:200%_100%]",
        "shadow-[0_0_48px_var(--color-accent-glow)] ring-1 ring-white/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{
        animation: "shimmer 4s linear infinite, glow-pulse 2.4s ease-in-out infinite",
      }}
    >
      <Play className="size-7 fill-bg-base" strokeWidth={0} />
      <span className="relative">{label}</span>

      <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent group-hover:translate-x-full transition-transform duration-700" />
    </motion.button>
  );
}
