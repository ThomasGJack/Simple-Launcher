import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import type { MascotSpotProps } from "@/types/moduleBlocks";

export function BlockMascotSpot(props: MascotSpotProps) {
  const position = props.position ?? "center";
  return (
    <div
      className={cn(
        "flex w-full",
        position === "left" && "justify-start",
        position === "center" && "justify-center",
        position === "right" && "justify-end",
      )}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        className="flex flex-col items-center gap-3"
        style={{ filter: "drop-shadow(0 0 18px var(--module-primary, var(--color-accent-soft)))" }}
      >
        <InlineMascot mood={props.mood ?? "happy"} />
        {props.caption && (
          <div className="rounded-full glass px-4 py-2 text-sm">{props.caption}</div>
        )}
      </motion.div>
    </div>
  );
}

function InlineMascot({ mood }: { mood: NonNullable<MascotSpotProps["mood"]> }) {
  const eyeFill = mood === "sleeping" ? "transparent" : "var(--module-primary, #00d4ff)";
  const eyeY = mood === "happy" ? 47 : 48;
  const eyeR = mood === "happy" ? 3 : 2.5;

  return (
    <svg viewBox="0 0 80 80" className="size-32" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="50" rx="20" ry="24" fill="#0d2236" stroke="var(--module-primary, #00d4ff)" strokeOpacity="0.6" strokeWidth="1.4" />
      <ellipse cx="40" cy="56" rx="13" ry="17" fill="#1a3554" />
      <path
        d="M 20 32 Q 22 22 30 20 L 50 20 Q 58 22 60 32 Q 60 36 56 38 L 24 38 Q 20 36 20 32 Z"
        fill="#fbbf24"
        stroke="#f59e0b"
        strokeWidth="1.2"
      />
      {mood === "sleeping" ? (
        <>
          <path d="M 30 47 Q 33 50 36 47" stroke="var(--module-primary, #00d4ff)" strokeWidth="1.6" fill="none" />
          <path d="M 44 47 Q 47 50 50 47" stroke="var(--module-primary, #00d4ff)" strokeWidth="1.6" fill="none" />
        </>
      ) : (
        <>
          <circle cx="33" cy={eyeY} r={eyeR} fill={eyeFill} />
          <circle cx="47" cy={eyeY} r={eyeR} fill={eyeFill} />
        </>
      )}
      {mood === "happy" ? (
        <path d="M 35 54 Q 40 60 45 54" stroke="#f59e0b" strokeWidth="2" fill="#fbbf24" />
      ) : (
        <path d="M 36 53 L 44 53 L 40 57 Z" fill="#f59e0b" />
      )}
    </svg>
  );
}
