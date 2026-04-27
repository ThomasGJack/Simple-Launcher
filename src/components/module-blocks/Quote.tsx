import { Quote as QuoteIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import type { QuoteProps } from "@/types/moduleBlocks";

export function BlockQuote(props: QuoteProps) {
  const style = props.style ?? "glass";
  return (
    <figure
      className={cn(
        "relative",
        style === "glass" && "rounded-3xl glass p-8",
        style === "pull-quote" && "border-l-2 pl-6",
        style === "speech" && "rounded-3xl bg-bg-elevated p-8",
      )}
      style={
        style === "pull-quote"
          ? { borderColor: "var(--module-primary, var(--color-accent))" }
          : undefined
      }
    >
      <QuoteIcon
        className="mb-4 size-8 opacity-60"
        style={{ color: "var(--module-primary, var(--color-accent))" }}
      />
      <blockquote
        className="text-xl leading-relaxed sm:text-2xl"
        style={{ fontFamily: "var(--module-font-display, var(--font-display))" }}
      >
        {props.text}
      </blockquote>
      {(props.author || props.role) && (
        <figcaption className="mt-5 flex items-center gap-3">
          {props.avatarUrl && (
            <img src={props.avatarUrl} alt="" className="size-10 rounded-full object-cover ring-1 ring-white/10" />
          )}
          <div className="text-sm">
            {props.author && <div className="font-medium">{props.author}</div>}
            {props.role && <div className="text-fg-muted">{props.role}</div>}
          </div>
        </figcaption>
      )}
    </figure>
  );
}
