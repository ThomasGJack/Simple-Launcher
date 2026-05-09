import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Play,
  Loader2,
  Users,
  Star,
  Calendar,
  Trophy,
  RefreshCw,
  Monitor,
  Tag,
  ChevronLeft,
  ChevronRight,
  Award,
  ExternalLink,
} from "lucide-react";
import {
  getSteamGameInfo,
  refreshSteamGameInfo,
  reviewScoreColor,
  achievementRarity,
  type SteamGameInfo,
} from "@/lib/steamGameInfo";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { sounds } from "@/lib/sounds";
import { openImage } from "@/store/imageViewer";
import { cn } from "@/lib/cn";

/**
 * Modal d'aperçu riche d'un jeu Steam — déclenchée quand l'user clique
 * sur un shortcut Steam dans la library. Affiche cover/screenshots/
 * trailer/description/rating/joueurs en ligne/achievements + bouton
 * "Lancer" (qui ouvre `steam://run/{appId}` comme avant).
 *
 * Données live depuis Steam Web API (cf. lib/steamGameInfo.ts), cache
 * Firestore TTL 24h partagé entre les users du crew.
 */
export function SteamGameDetailModal({
  appId,
  onClose,
  onLaunch,
}: {
  appId: string;
  onClose: () => void;
  onLaunch: () => void;
}) {
  const [info, setInfo] = useState<SteamGameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "achievements">(
    "overview",
  );
  const [screenshotIdx, setScreenshotIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSteamGameInfo(appId)
      .then((res) => {
        if (!cancelled) {
          setInfo(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);

  // Esc pour close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleRefresh = async () => {
    sounds.click();
    setRefreshing(true);
    try {
      const fresh = await refreshSteamGameInfo(appId);
      if (fresh) setInfo(fresh);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLaunch = () => {
    sounds.click();
    onLaunch();
    onClose();
  };

  const handleOpenStorePage = async () => {
    sounds.click();
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(`https://store.steampowered.com/app/${appId}/`);
    } catch (err) {
      console.warn("[steam-modal] open store failed:", err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/80 p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-bg-soft ring-1 ring-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
      >
        {/* Hero background */}
        {info?.background && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-40"
            style={{
              backgroundImage: `linear-gradient(180deg, transparent 0%, rgba(7,9,13,0.95) 100%), url(${info.background})`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
            }}
          />
        )}

        {/* Header — close + actions */}
        <header className="relative z-10 flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-blue-300 ring-1 ring-blue-500/30">
            Steam
          </span>
          <span className="font-mono text-[10px] text-fg-dim">App {appId}</span>
          <div className="flex-1" />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Actualiser (joueurs en ligne, etc.)"
            className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.05] hover:text-fg-primary disabled:opacity-40"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </button>
          <button
            onClick={handleOpenStorePage}
            title="Ouvrir la page Steam Store dans le navigateur"
            className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.05] hover:text-fg-primary"
          >
            <ExternalLink className="size-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Fermer (Esc)"
            className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.05] hover:text-fg-primary"
          >
            <X className="size-4" strokeWidth={2.4} />
          </button>
        </header>

        {/* Body */}
        {loading ? (
          <div className="grid flex-1 place-items-center text-fg-muted">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="size-8 animate-spin" />
              <span className="text-xs uppercase tracking-[0.2em]">
                Chargement Steam…
              </span>
            </div>
          </div>
        ) : !info ? (
          <div className="grid flex-1 place-items-center text-fg-muted">
            <div className="text-center">
              <p className="mb-2">Impossible de récupérer les infos Steam.</p>
              <p className="text-xs text-fg-dim">
                Vérifie ta connexion internet ou que l'App ID est valide.
              </p>
              <button
                onClick={handleLaunch}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
              >
                <Play className="size-4" />
                Lancer le jeu quand même
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="relative z-10 flex gap-1 border-b border-white/[0.06] px-5">
              <TabButton
                active={activeTab === "overview"}
                onClick={() => setActiveTab("overview")}
                label="Aperçu"
              />
              {info.achievement_percents.length > 0 && (
                <TabButton
                  active={activeTab === "achievements"}
                  onClick={() => setActiveTab("achievements")}
                  label={`Achievements · ${info.achievement_percents.length}`}
                />
              )}
            </div>

            <div className="info-scroll flex-1 overflow-y-auto p-5">
              {activeTab === "overview" && (
                <OverviewTab
                  info={info}
                  screenshotIdx={screenshotIdx}
                  setScreenshotIdx={setScreenshotIdx}
                />
              )}
              {activeTab === "achievements" && <AchievementsTab info={info} />}
            </div>

            {/* Sticky footer — bouton Lancer toujours visible */}
            <footer className="relative z-10 flex items-center gap-3 border-t border-white/[0.06] bg-bg-soft/95 px-5 py-3 backdrop-blur-md">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-fg-primary">
                  {info.name ?? `App ${appId}`}
                </div>
                {info.developers.length > 0 && (
                  <div className="truncate text-[11px] text-fg-muted">
                    par {info.developers.join(", ")}
                  </div>
                )}
              </div>
              <button
                onClick={handleLaunch}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-bg-base shadow-[0_0_24px_rgba(16,185,129,0.4)] hover:shadow-[0_0_36px_rgba(16,185,129,0.5)] transition-shadow"
              >
                <Play className="size-4" strokeWidth={2.4} />
                Lancer via Steam
              </button>
            </footer>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative px-4 py-2.5 text-xs font-medium uppercase tracking-[0.15em] transition",
        active
          ? "text-fg-primary"
          : "text-fg-dim hover:text-fg-muted",
      )}
    >
      {label}
      {active && (
        <motion.div
          layoutId="steam-modal-tab"
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </button>
  );
}

function OverviewTab({
  info,
  screenshotIdx,
  setScreenshotIdx,
}: {
  info: SteamGameInfo;
  screenshotIdx: number;
  setScreenshotIdx: (idx: number | ((p: number) => number)) => void;
}) {
  const trailerSrc = info.movies[0]?.mp4_max ?? info.movies[0]?.webm_max ?? null;
  const screenshots = info.screenshots;

  const descHtml = useMemo(() => {
    return info.detailed_description ? sanitizeHtml(info.detailed_description) : "";
  }, [info.detailed_description]);

  return (
    <div className="space-y-6">
      {/* Header : header_image + meta */}
      <div className="flex flex-col gap-4 md:flex-row">
        {info.header_image && (
          <img
            src={info.header_image}
            alt={info.name ?? ""}
            className="w-full shrink-0 cursor-zoom-in rounded-xl ring-1 ring-white/[0.06] md:w-96"
            referrerPolicy="no-referrer"
            onClick={() => openImage(info.header_image!, info.name ?? null)}
          />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <h1 className="font-display text-2xl text-fg-primary">
            {info.name ?? "?"}
          </h1>
          {info.short_description && (
            <p className="text-sm text-fg-muted">{info.short_description}</p>
          )}

          {/* Pills : rating, current players, release date, metacritic */}
          <div className="flex flex-wrap gap-2">
            {info.review_score_desc && (
              <Pill
                icon={Star}
                label={info.review_score_desc}
                hint={
                  info.total_reviews
                    ? `${info.total_reviews.toLocaleString("fr-FR")} avis`
                    : undefined
                }
                color={reviewScoreColor(info.review_score)}
              />
            )}
            {typeof info.current_players === "number" && (
              <Pill
                icon={Users}
                label={`${info.current_players.toLocaleString("fr-FR")} en ligne`}
                color="text-emerald-400"
              />
            )}
            {info.release_date?.date && (
              <Pill
                icon={Calendar}
                label={info.release_date.date}
                color="text-fg-muted"
              />
            )}
            {info.metacritic_score && (
              <Pill
                icon={Award}
                label={`Metacritic ${info.metacritic_score}`}
                color={
                  info.metacritic_score >= 75
                    ? "text-emerald-400"
                    : info.metacritic_score >= 50
                      ? "text-amber-400"
                      : "text-rose-400"
                }
              />
            )}
          </div>

          {/* Genres + categories */}
          {(info.genres.length > 0 || info.categories.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {info.genres.map((g) => (
                <span
                  key={`g-${g.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/[0.08] px-2 py-0.5 text-[10px] text-accent ring-1 ring-accent/30"
                >
                  <Tag className="size-2.5" />
                  {g.description}
                </span>
              ))}
              {info.categories.slice(0, 6).map((c) => (
                <span
                  key={`c-${c.id}`}
                  className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-fg-muted ring-1 ring-white/[0.06]"
                >
                  {c.description}
                </span>
              ))}
            </div>
          )}

          {/* Platforms */}
          {info.platforms && (
            <div className="flex items-center gap-2 text-[11px] text-fg-dim">
              <Monitor className="size-3" />
              {info.platforms.windows && <span>Windows</span>}
              {info.platforms.mac && <span>· macOS</span>}
              {info.platforms.linux && <span>· Linux</span>}
            </div>
          )}

          {/* Price overview */}
          {info.price_overview && (
            <div className="inline-flex items-center gap-2 rounded-xl bg-bg-base/40 px-3 py-2 ring-1 ring-white/[0.06]">
              {info.price_overview.discount_percent > 0 ? (
                <>
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs font-bold text-emerald-300">
                    -{info.price_overview.discount_percent}%
                  </span>
                  <span className="text-xs text-fg-dim line-through">
                    {info.price_overview.initial_formatted}
                  </span>
                  <span className="font-display text-base text-emerald-300">
                    {info.price_overview.final_formatted}
                  </span>
                </>
              ) : (
                <span className="font-display text-base text-fg-primary">
                  {info.is_free ? "Gratuit" : info.price_overview.final_formatted}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Trailer video */}
      {trailerSrc && (
        <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
          <video
            src={trailerSrc}
            poster={info.movies[0]?.thumbnail}
            controls
            className="aspect-video w-full bg-bg-base"
          />
        </div>
      )}

      {/* Screenshots carousel */}
      {screenshots.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            Captures d'écran ({screenshots.length})
          </div>
          <div className="relative overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
            <img
              src={screenshots[screenshotIdx]?.path_full}
              alt=""
              className="aspect-video w-full cursor-zoom-in object-cover"
              referrerPolicy="no-referrer"
              onClick={() =>
                openImage(
                  screenshots[screenshotIdx]?.path_full ?? "",
                  `${info.name ?? "Steam"} — capture ${screenshotIdx + 1}/${screenshots.length}`,
                )
              }
            />
            {screenshots.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setScreenshotIdx((i) =>
                      i === 0 ? screenshots.length - 1 : i - 1,
                    )
                  }
                  className="absolute left-2 top-1/2 -translate-y-1/2 grid size-9 place-items-center rounded-full bg-bg-base/80 text-fg-primary ring-1 ring-white/[0.08] hover:bg-bg-base"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setScreenshotIdx((i) => (i + 1) % screenshots.length)
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 grid size-9 place-items-center rounded-full bg-bg-base/80 text-fg-primary ring-1 ring-white/[0.08] hover:bg-bg-base"
                >
                  <ChevronRight className="size-4" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-bg-base/80 px-2 py-0.5 font-mono text-[10px] text-fg-muted ring-1 ring-white/[0.08]">
                  {screenshotIdx + 1} / {screenshots.length}
                </div>
              </>
            )}
          </div>
          {/* Thumbnail strip */}
          {screenshots.length > 1 && (
            <div className="info-scroll flex gap-1.5 overflow-x-auto pb-1">
              {screenshots.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setScreenshotIdx(i)}
                  className={cn(
                    "shrink-0 overflow-hidden rounded ring-1 transition",
                    i === screenshotIdx
                      ? "ring-accent shadow-[0_0_12px_var(--color-accent-soft)]"
                      : "ring-white/[0.06] opacity-60 hover:opacity-100",
                  )}
                >
                  <img
                    src={s.path_thumbnail}
                    alt=""
                    className="aspect-video w-24 object-cover"
                    referrerPolicy="no-referrer"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {descHtml && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            Description
          </div>
          <div
            className={cn(
              "prose prose-invert max-w-none rounded-xl bg-bg-base/30 p-4 text-sm text-fg-muted ring-1 ring-white/[0.04]",
              "[&_img]:rounded-lg [&_img]:my-3 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm",
              "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2",
            )}
            dangerouslySetInnerHTML={{ __html: descHtml }}
          />
        </div>
      )}

      {/* System requirements */}
      {(info.pc_requirements_minimum || info.pc_requirements_recommended) && (
        <details className="rounded-xl bg-bg-base/30 ring-1 ring-white/[0.04]">
          <summary className="cursor-pointer px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim hover:text-fg-muted">
            Configuration requise
          </summary>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            {info.pc_requirements_minimum && (
              <div className="rounded-lg bg-bg-base/40 p-3 ring-1 ring-white/[0.04]">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-dim">
                  Minimum
                </div>
                <div
                  className="prose prose-invert max-w-none text-[11px] text-fg-muted [&_strong]:text-fg-primary"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(info.pc_requirements_minimum),
                  }}
                />
              </div>
            )}
            {info.pc_requirements_recommended && (
              <div className="rounded-lg bg-bg-base/40 p-3 ring-1 ring-white/[0.04]">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-dim">
                  Recommandé
                </div>
                <div
                  className="prose prose-invert max-w-none text-[11px] text-fg-muted [&_strong]:text-fg-primary"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(info.pc_requirements_recommended),
                  }}
                />
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function AchievementsTab({ info }: { info: SteamGameInfo }) {
  const sorted = useMemo(
    () => [...info.achievement_percents].sort((a, b) => a.percent - b.percent),
    [info.achievement_percents],
  );

  // Stats summary
  const ultraRare = sorted.filter((a) => a.percent < 1).length;
  const rare = sorted.filter((a) => a.percent >= 1 && a.percent < 10).length;
  const uncommon = sorted.filter(
    (a) => a.percent >= 10 && a.percent < 50,
  ).length;
  const common = sorted.filter((a) => a.percent >= 50).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RarityCard color="rose" label="Ultra rare" sub="< 1%" count={ultraRare} />
        <RarityCard color="amber" label="Rare" sub="< 10%" count={rare} />
        <RarityCard
          color="cyan"
          label="Peu commun"
          sub="< 50%"
          count={uncommon}
        />
        <RarityCard color="emerald" label="Commun" sub="≥ 50%" count={common} />
      </div>

      <div className="rounded-xl bg-bg-base/30 p-3 text-[11px] text-fg-muted ring-1 ring-white/[0.04]">
        💡 Steam ne donne pas les noms / icônes des achievements via l'API
        publique sans clé développeur. Pour avoir les détails (nom, icône,
        comment unlock), clique <strong>« Ouvrir la page Steam Store »</strong>{" "}
        dans l'en-tête (icône lien externe en haut à droite).
      </div>

      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          Liste complète ({sorted.length})
        </div>
        <div className="grid gap-1">
          {sorted.map((a) => {
            const rarity = achievementRarity(a.percent);
            return (
              <div
                key={a.name}
                className="flex items-center gap-3 rounded-lg bg-bg-base/30 px-3 py-2 ring-1 ring-white/[0.04]"
              >
                <div
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-md ring-1",
                    rarity === "ultra-rare" &&
                      "bg-rose-400/15 text-rose-300 ring-rose-400/30",
                    rarity === "rare" &&
                      "bg-amber-400/15 text-amber-300 ring-amber-400/30",
                    rarity === "uncommon" &&
                      "bg-cyan-400/15 text-cyan-300 ring-cyan-400/30",
                    rarity === "common" &&
                      "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
                  )}
                >
                  <Trophy className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted">
                  {a.name}
                </div>
                <div
                  className={cn(
                    "shrink-0 font-mono text-xs tabular-nums",
                    rarity === "ultra-rare" && "text-rose-300",
                    rarity === "rare" && "text-amber-300",
                    rarity === "uncommon" && "text-cyan-300",
                    rarity === "common" && "text-emerald-300",
                  )}
                >
                  {a.percent.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  hint,
  color,
}: {
  icon: typeof Users;
  label: string;
  hint?: string;
  color: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] ring-1 ring-white/[0.06]",
        color,
      )}
      title={hint}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function RarityCard({
  color,
  label,
  sub,
  count,
}: {
  color: "rose" | "amber" | "cyan" | "emerald";
  label: string;
  sub: string;
  count: number;
}) {
  const colorClasses = {
    rose: "bg-rose-400/[0.08] text-rose-300 ring-rose-400/30",
    amber: "bg-amber-400/[0.08] text-amber-300 ring-amber-400/30",
    cyan: "bg-cyan-400/[0.08] text-cyan-300 ring-cyan-400/30",
    emerald: "bg-emerald-400/[0.08] text-emerald-300 ring-emerald-400/30",
  };
  return (
    <div
      className={cn(
        "rounded-xl p-3 ring-1",
        colorClasses[color],
      )}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="font-display text-2xl">{count}</div>
      <div className="text-[10px] opacity-60">{sub}</div>
    </div>
  );
}

/** Wrapper qui gère animation entrée/sortie + lifecycle du modal. */
export function SteamGameDetailModalHost({
  appId,
  onClose,
  onLaunch,
}: {
  appId: string | null;
  onClose: () => void;
  onLaunch: (appId: string) => void;
}) {
  return (
    <AnimatePresence>
      {appId && (
        <SteamGameDetailModal
          appId={appId}
          onClose={onClose}
          onLaunch={() => onLaunch(appId)}
        />
      )}
    </AnimatePresence>
  );
}
