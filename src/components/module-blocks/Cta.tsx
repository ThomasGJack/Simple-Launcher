import { motion } from "framer-motion";
import type { CtaProps } from "@/types/moduleBlocks";
import type { LauncherModule } from "@/types/module";
import { sounds } from "@/lib/sounds";

type Props = CtaProps & {
  module?: LauncherModule;
  onLaunch?: () => void;
};

export function BlockCta(props: Props) {
  const handleClick = () => {
    sounds.click();
    if (props.buttonAction === "launch" && props.onLaunch) {
      props.onLaunch();
    } else if (props.buttonAction === "url" && props.buttonUrl) {
      // Délègue à l'OS via tauri-plugin-opener — `window.open` est
      // bloqué par la security policy de Tauri WebView2 et fait penser
      // que l'app est une page web.
      const url = props.buttonUrl;
      void import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(url))
        .catch((err) => console.warn("[cta] openUrl failed:", err));
    } else if (props.buttonAction === "scroll-top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-3xl px-8 py-12 text-center"
      style={{
        background:
          props.bgUrl
            ? `linear-gradient(180deg, rgba(7,9,13,0.65), rgba(7,9,13,0.85)), url(${props.bgUrl}) center/cover no-repeat`
            : "linear-gradient(135deg, color-mix(in srgb, var(--module-primary, var(--color-accent)) 22%, transparent), color-mix(in srgb, var(--module-accent, #c084fc) 22%, transparent))",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      <h3
        className="text-2xl font-bold sm:text-3xl"
        style={{ fontFamily: "var(--module-font-display, var(--font-display))" }}
      >
        {props.title}
      </h3>
      {props.description && (
        <p className="mx-auto mt-3 max-w-xl text-sm text-fg-muted sm:text-base">{props.description}</p>
      )}
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        onMouseEnter={() => sounds.hover()}
        onClick={handleClick}
        className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-wider"
        style={{
          background:
            "linear-gradient(135deg, var(--module-primary, var(--color-accent)) 0%, var(--module-accent, #c084fc) 100%)",
          color: "#fff",
          boxShadow: "0 0 32px var(--module-primary, var(--color-accent-glow))",
        }}
      >
        {props.buttonLabel}
      </motion.button>
    </div>
  );
}
