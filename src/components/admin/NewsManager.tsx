import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, Pin, Eye, EyeOff, Trash2, Edit3, Plus, Save, X, Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { watchNews, createNews, updateNews, deleteNews, type News } from "@/firebase/news";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Admin-only panel for managing the home page news feed. All edits propagate
 * to every connected launcher in real time via Firestore onSnapshot — no
 * relaunch required on the consumer side.
 */
export function NewsManager() {
  const me = useAuthStore((s) => s.user);
  const [items, setItems] = useState<News[]>([]);
  const [editing, setEditing] = useState<News | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => watchNews(setItems), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-fg-primary">News du launcher</h2>
          <p className="text-xs text-fg-muted">
            Annonces affichées en temps réel sur l'accueil de tous les launchers connectés.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)]"
        >
          <Plus className="size-4" /> Nouvelle news
        </button>
      </div>

      <AnimatePresence>
        {(creating || editing) && (
          <NewsEditor
            initial={editing ?? null}
            authorUid={me?.uid ?? ""}
            authorName={me?.displayName ?? null}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-2xl glass p-8 text-center text-sm text-fg-muted">
            Aucune news pour l'instant. Crée la première — elle s'affichera immédiatement sur tous les launchers.
          </div>
        ) : (
          items.map((n) => (
            <NewsRow
              key={n.id}
              item={n}
              onEdit={() => {
                setEditing(n);
                setCreating(false);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NewsRow({ item, onEdit }: { item: News; onEdit: () => void }) {
  const [busy, setBusy] = useState<"pin" | "hide" | "delete" | null>(null);
  const accent = item.accent ?? "var(--color-accent)";

  const togglePin = async () => {
    setBusy("pin");
    try {
      await updateNews(item.id, { pinned: !item.pinned });
    } finally {
      setBusy(null);
    }
  };
  const toggleHidden = async () => {
    setBusy("hide");
    try {
      await updateNews(item.id, { hidden: !item.hidden });
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!confirm(`Supprimer la news "${item.title}" ?`)) return;
    setBusy("delete");
    try {
      await deleteNews(item.id);
      sounds.success();
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-3 rounded-2xl glass p-4 ring-1 transition-opacity",
        item.hidden ? "opacity-50 ring-white/[0.04]" : "ring-white/[0.06]",
      )}
    >
      <div
        className="grid size-10 shrink-0 place-items-center rounded-xl"
        style={{
          background: `color-mix(in srgb, ${accent} 18%, transparent)`,
          color: accent,
          boxShadow: `0 0 12px ${accent}40`,
        }}
      >
        <Megaphone className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-fg-primary">{item.title}</span>
          {item.pinned && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/30">
              <Pin className="size-2.5" /> Épinglé
            </span>
          )}
          {item.hidden && (
            <span className="rounded-full bg-fg-dim/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-fg-dim">
              Masqué
            </span>
          )}
        </div>
        <div className="line-clamp-1 text-xs text-fg-muted">{item.body}</div>
      </div>
      <div className="flex shrink-0 gap-1">
        <IconButton title={item.pinned ? "Désépingler" : "Épingler"} onClick={togglePin} busy={busy === "pin"}>
          <Pin className={cn("size-4", item.pinned && "fill-current text-amber-300")} />
        </IconButton>
        <IconButton title={item.hidden ? "Afficher" : "Masquer"} onClick={toggleHidden} busy={busy === "hide"}>
          {item.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </IconButton>
        <IconButton title="Modifier" onClick={onEdit}>
          <Edit3 className="size-4" />
        </IconButton>
        <IconButton title="Supprimer" onClick={remove} busy={busy === "delete"} danger>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </motion.div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  busy,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={busy}
      onClick={onClick}
      className={cn(
        "grid size-9 place-items-center rounded-lg text-fg-muted transition-colors disabled:opacity-50",
        danger ? "hover:bg-danger/15 hover:text-danger" : "hover:bg-white/[0.06] hover:text-fg-primary",
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : children}
    </button>
  );
}

function NewsEditor({
  initial,
  authorUid,
  authorName,
  onClose,
}: {
  initial: News | null;
  authorUid: string;
  authorName: string | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [accent, setAccent] = useState(initial?.accent ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Le titre est requis");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const draft = {
        title: title.trim(),
        body: body.trim(),
        accent: accent.trim() || null,
        pinned,
        hidden,
      };
      if (initial) {
        await updateNews(initial.id, draft);
      } else {
        await createNews(draft, authorUid, authorName);
      }
      sounds.success();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      sounds.error();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden rounded-3xl glass-strong p-6 ring-1 ring-accent/30"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display text-lg text-fg-primary">
          <Megaphone className="size-5 text-accent" />
          {initial ? "Modifier la news" : "Nouvelle news"}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.04] hover:text-fg-primary"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-3">
        <Field label="Titre">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Nouveau modpack disponible !"
            maxLength={120}
            className="w-full rounded-xl bg-bg-base/40 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
          />
        </Field>

        <Field label="Contenu (markdown supporté)">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Détails de la news… **gras**, *italique*, [liens](https://...) sont supportés."
            className="w-full resize-y rounded-xl bg-bg-base/40 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Couleur d'accent (optionnel)">
            <div className="flex items-center gap-2 rounded-xl bg-bg-base/40 px-3 py-2 ring-1 ring-white/[0.06]">
              <input
                type="color"
                value={accent || "#00d4ff"}
                onChange={(e) => setAccent(e.target.value)}
                className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                type="text"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                placeholder="#00d4ff (vide = cyan)"
                className="flex-1 bg-transparent text-xs font-mono focus:outline-none"
              />
            </div>
          </Field>
          <div className="flex items-end gap-2">
            <Toggle label="Épinglé" value={pinned} onChange={setPinned} icon={<Pin className="size-3.5" />} />
            <Toggle label="Masqué" value={hidden} onChange={setHidden} icon={<EyeOff className="size-3.5" />} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-fg-primary ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {initial ? "Enregistrer" : "Publier"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs ring-1 transition-colors",
        value
          ? "bg-accent/15 text-accent ring-accent/40"
          : "bg-bg-base/40 text-fg-muted ring-white/[0.06] hover:bg-white/[0.04]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
