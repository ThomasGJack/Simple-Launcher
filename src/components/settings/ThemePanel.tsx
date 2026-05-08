import { useState } from "react";
import { motion } from "framer-motion";
import { Palette, Type, LayoutGrid, Volume2, Check, ExternalLink } from "lucide-react";
import {
  FONT_PRESETS,
  LAYOUTS,
  applyFont,
  applyLayout,
  loadCustomFont,
  loadFontPresetId,
  loadLayoutId,
  saveCustomFont,
  saveFontPresetId,
  saveLayoutId,
  type CustomFont,
  type LayoutId,
} from "@/lib/themes";
import {
  SOUNDPACKS,
  type SoundpackId,
} from "@/lib/soundpacks";
import { getActiveSoundpackId, setSoundpack, sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * ThemePanel — pack 3-en-1 : font, layout, soundpack. Pas un "thème"
 * combiné (couleur d'accent reste séparée dans Apparence) mais 3
 * sections regroupées pour limiter la pollution Settings.
 */
export function ThemePanel() {
  const [fontId, setFontId] = useState<string>(loadFontPresetId());
  const [customFont, setCustomFontState] = useState<CustomFont | null>(loadCustomFont());
  const [layoutId, setLayoutIdState] = useState<LayoutId>(loadLayoutId());
  const [soundpackId, setSoundpackIdState] = useState<SoundpackId>(getActiveSoundpackId());
  const [customDraft, setCustomDraft] = useState({ family: "", url: "" });
  const [showCustomForm, setShowCustomForm] = useState(false);

  // ─── Font ───
  const handleFontChange = async (id: string) => {
    setFontId(id);
    saveFontPresetId(id);
    saveCustomFont(null); // preset overrides custom
    setCustomFontState(null);
    await applyFont();
    sounds.click();
  };

  const handleSaveCustom = async () => {
    if (!customDraft.family.trim() || !customDraft.url.trim()) return;
    // Validation basique : URL Google Fonts ou bunny ou autre HTTPS
    if (!/^https:\/\//i.test(customDraft.url)) {
      alert("L'URL doit commencer par https://");
      return;
    }
    const font: CustomFont = {
      family: customDraft.family.trim(),
      url: customDraft.url.trim(),
    };
    saveCustomFont(font);
    setCustomFontState(font);
    setShowCustomForm(false);
    await applyFont();
    sounds.success();
  };

  const handleClearCustom = async () => {
    saveCustomFont(null);
    setCustomFontState(null);
    await applyFont();
    sounds.click();
  };

  // ─── Layout ───
  const handleLayoutChange = (id: LayoutId) => {
    setLayoutIdState(id);
    saveLayoutId(id);
    applyLayout(id);
    sounds.click();
  };

  // ─── Soundpack ───
  const handleSoundpackChange = (id: SoundpackId) => {
    setSoundpackIdState(id);
    setSoundpack(id);
    // Ne pas joue le click ici — attends 100ms pour que le pack soit
    // build, puis joue success pour preview du nouveau son.
    setTimeout(() => sounds.success(), 80);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white/[0.025] p-5 ring-1 ring-white/[0.06]"
    >
      <header className="mb-4 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30">
          <Palette className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-lg text-fg-primary">
            Police, mise en page, sons
          </h3>
          <p className="text-xs text-fg-muted">
            Personnalise l'apparence et le son du launcher.
          </p>
        </div>
      </header>

      {/* ─── Police ─── */}
      <SectionHeader icon={Type} label="Police" />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FONT_PRESETS.map((p) => {
          const isActive = !customFont && fontId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => handleFontChange(p.id)}
              className={cn(
                "rounded-xl p-3 text-left transition ring-1",
                isActive
                  ? "bg-accent/10 ring-accent/40"
                  : "bg-white/[0.03] ring-white/[0.05] hover:bg-white/[0.06]",
              )}
              style={{ fontFamily: `${p.family}, system-ui, sans-serif` }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-fg-primary">
                  {p.label}
                </span>
                {isActive && <Check className="size-4 text-accent" />}
              </div>
              <div className="mt-1 text-xs text-fg-muted">{p.description}</div>
              <div className="mt-2 text-base text-fg-primary">
                The quick brown fox jumps over the lazy dog
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom font URL */}
      <div className="mb-5">
        {customFont ? (
          <div className="flex items-center gap-3 rounded-xl bg-accent/10 p-3 ring-1 ring-accent/30">
            <Type className="size-4 text-accent" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-fg-primary">
                Police custom : {customFont.family}
              </div>
              <div className="truncate text-[10px] text-fg-dim">
                {customFont.url}
              </div>
            </div>
            <button
              onClick={handleClearCustom}
              className="rounded-md bg-white/[0.05] px-2.5 py-1 text-xs text-fg-muted hover:bg-white/[0.1]"
            >
              Retirer
            </button>
          </div>
        ) : showCustomForm ? (
          <div className="flex flex-col gap-2 rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.05]">
            <input
              value={customDraft.family}
              onChange={(e) => setCustomDraft({ ...customDraft, family: e.target.value })}
              placeholder="Family CSS, ex: « Roboto Mono »"
              className="rounded-lg bg-bg-base/60 px-3 py-1.5 text-xs text-fg-primary outline-none ring-1 ring-white/[0.06] focus:ring-accent/40"
            />
            <input
              value={customDraft.url}
              onChange={(e) => setCustomDraft({ ...customDraft, url: e.target.value })}
              placeholder="URL Google Fonts (https://fonts.googleapis.com/css2?...)"
              className="rounded-lg bg-bg-base/60 px-3 py-1.5 font-mono text-xs text-fg-primary outline-none ring-1 ring-white/[0.06] focus:ring-accent/40"
            />
            <div className="flex items-center justify-between text-[10px] text-fg-dim">
              <span>
                Trouve une police sur{" "}
                <a
                  href="https://fonts.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  fonts.google.com
                  <ExternalLink className="ml-0.5 inline size-3" />
                </a>
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setShowCustomForm(false)}
                  className="rounded-md bg-white/[0.04] px-2 py-1 text-xs text-fg-muted hover:bg-white/[0.08]"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveCustom}
                  className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-bg-base disabled:opacity-50"
                  disabled={!customDraft.family.trim() || !customDraft.url.trim()}
                >
                  Appliquer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomForm(true)}
            className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.05] hover:bg-white/[0.08]"
          >
            + Police custom (URL Google Fonts)
          </button>
        )}
      </div>

      {/* ─── Layout ─── */}
      <SectionHeader icon={LayoutGrid} label="Densité" />
      <div className="mb-5 grid grid-cols-3 gap-2">
        {LAYOUTS.map((l) => {
          const isActive = layoutId === l.id;
          return (
            <button
              key={l.id}
              onClick={() => handleLayoutChange(l.id)}
              className={cn(
                "rounded-xl p-3 text-left transition ring-1",
                isActive
                  ? "bg-accent/10 ring-accent/40"
                  : "bg-white/[0.03] ring-white/[0.05] hover:bg-white/[0.06]",
              )}
            >
              <div className="text-sm font-semibold text-fg-primary">
                {l.label}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-fg-muted">
                {l.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* ─── Soundpack ─── */}
      <SectionHeader icon={Volume2} label="Pack de sons" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SOUNDPACKS.map((s) => {
          const isActive = soundpackId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => handleSoundpackChange(s.id)}
              className={cn(
                "rounded-xl p-3 text-left transition ring-1",
                isActive
                  ? "bg-accent/10 ring-accent/40"
                  : "bg-white/[0.03] ring-white/[0.05] hover:bg-white/[0.06]",
              )}
            >
              <div className="text-sm font-semibold text-fg-primary">{s.label}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-fg-muted">
                {s.description}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-fg-dim">
        Le pack actif joue un son de prévisualisation au changement.
      </p>
    </motion.section>
  );
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: typeof Type;
  label: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim">
      <Icon className="size-3" />
      {label}
    </div>
  );
}

/**
 * Boot helper — applique font + layout au mount d'App.tsx avant la
 * première frame. Le soundpack est lazy-loaded au premier sons.X()
 * appelé.
 */
export async function bootThemes(): Promise<void> {
  await applyFont();
  applyLayout();
}
