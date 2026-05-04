import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Castle, Hash, Plus, Edit3, Trash2, X, Save, Loader2 } from "lucide-react";
import {
  watchCrews,
  watchCrewChannels,
  createCrew,
  updateCrew,
  deleteCrew,
  createChannel,
  updateChannel,
  deleteChannel,
  type Crew,
  type CrewChannel,
} from "@/firebase/crews";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Admin-only manager for the Discord-like crews system. Lets the admin
 * create / edit / delete crews and the text channels inside each.
 * Updates propagate live to every launcher via Firestore onSnapshot.
 */
export function CrewsManager() {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [editing, setEditing] = useState<Crew | null>(null);
  const [creating, setCreating] = useState(false);
  const [openCrewId, setOpenCrewId] = useState<string | null>(null);

  useEffect(() => watchCrews(setCrews), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl">Clans / Crews</h2>
          <p className="text-xs text-fg-muted">
            Mini-Discord textuel. Crée des clans, leurs salons textuels — tout le monde peut écrire.
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
          <Plus className="size-4" /> Nouveau clan
        </button>
      </div>

      <AnimatePresence>
        {(creating || editing) && (
          <CrewEditor
            initial={editing}
            existingCount={crews.length}
            onClose={() => {
              setCreating(false);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {crews.length === 0 ? (
          <div className="rounded-2xl glass p-8 text-center text-sm text-fg-muted">
            Aucun clan pour l'instant. Crée le premier — il apparaîtra immédiatement dans la sidebar « Clans » de tous les launchers.
          </div>
        ) : (
          crews.map((c) => (
            <CrewBlock
              key={c.id}
              crew={c}
              expanded={openCrewId === c.id}
              onToggle={() => setOpenCrewId(openCrewId === c.id ? null : c.id)}
              onEdit={() => {
                setEditing(c);
                setCreating(false);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CrewBlock({
  crew,
  expanded,
  onToggle,
  onEdit,
}: {
  crew: Crew;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const [channels, setChannels] = useState<CrewChannel[]>([]);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [editingChannel, setEditingChannel] = useState<CrewChannel | null>(null);

  useEffect(() => {
    if (!expanded) return;
    return watchCrewChannels(crew.id, setChannels);
  }, [crew.id, expanded]);

  const handleDelete = async () => {
    if (!confirm(`Supprimer le clan "${crew.name}" et tous ses salons ?`)) return;
    await deleteCrew(crew.id);
    sounds.success();
  };

  return (
    <motion.div layout className="overflow-hidden rounded-2xl glass ring-1 ring-white/[0.06]">
      <div className="flex items-center gap-3 p-4">
        <div
          className="grid size-10 shrink-0 place-items-center rounded-xl text-xl"
          style={{
            background: `color-mix(in srgb, ${crew.color} 18%, transparent)`,
            color: crew.color,
            boxShadow: `0 0 12px ${crew.color}40`,
          }}
        >
          {crew.emblem}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium" style={{ color: crew.color }}>
            {crew.name}
          </div>
          <div className="text-xs text-fg-dim">
            Position {crew.position} · {channels.length} salon{channels.length > 1 ? "s" : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg bg-bg-elevated px-3 py-1.5 text-xs ring-1 ring-white/[0.06] hover:bg-bg-base"
        >
          {expanded ? "Replier" : "Salons"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
          title="Modifier le clan"
        >
          <Edit3 className="size-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-danger/15 hover:text-danger"
          title="Supprimer le clan"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.06] bg-bg-base/30"
          >
            <div className="space-y-2 p-3">
              {channels.length === 0 && !creatingChannel && !editingChannel && (
                <div className="rounded-lg bg-bg-base/40 px-3 py-2 text-xs text-fg-muted">
                  Pas encore de salon dans ce clan.
                </div>
              )}
              {channels.map((ch) => (
                <ChannelRow
                  key={ch.id}
                  crewId={crew.id}
                  channel={ch}
                  onEdit={() => setEditingChannel(ch)}
                />
              ))}

              {(creatingChannel || editingChannel) && (
                <ChannelEditor
                  crewId={crew.id}
                  initial={editingChannel}
                  existingCount={channels.length}
                  onClose={() => {
                    setCreatingChannel(false);
                    setEditingChannel(null);
                  }}
                />
              )}

              {!creatingChannel && !editingChannel && (
                <button
                  type="button"
                  onClick={() => setCreatingChannel(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-bg-elevated px-3 py-1.5 text-xs ring-1 ring-white/[0.06] hover:bg-bg-base"
                >
                  <Plus className="size-3.5" /> Nouveau salon
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ChannelRow({
  crewId,
  channel,
  onEdit,
}: {
  crewId: string;
  channel: CrewChannel;
  onEdit: () => void;
}) {
  const handleDelete = async () => {
    if (!confirm(`Supprimer le salon "#${channel.name}" et tous ses messages ?`)) return;
    await deleteChannel(crewId, channel.id);
  };
  return (
    <div className="flex items-center gap-2 rounded-lg bg-bg-base/40 px-3 py-1.5">
      <Hash className="size-3.5 text-fg-dim" />
      <span className="text-sm">{channel.name}</span>
      {channel.description && (
        <span className="ml-2 truncate text-xs text-fg-dim">— {channel.description}</span>
      )}
      <span className="ml-auto text-[10px] text-fg-dim">pos {channel.position}</span>
      <button
        type="button"
        onClick={onEdit}
        className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-white/[0.06] hover:text-fg-primary"
      >
        <Edit3 className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={handleDelete}
        className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-danger/15 hover:text-danger"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function CrewEditor({
  initial,
  existingCount,
  onClose,
}: {
  initial: Crew | null;
  existingCount: number;
  onClose: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const [name, setName] = useState(initial?.name ?? "");
  const [emblem, setEmblem] = useState(initial?.emblem ?? "🏰");
  const [color, setColor] = useState(initial?.color ?? "#00d4ff");
  const [position, setPosition] = useState(initial?.position ?? existingCount);
  const [isMaster, setIsMaster] = useState(initial?.isMaster ?? false);
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!me) return;
    if (!name.trim()) {
      setError("Le nom est requis");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = {
        name: name.trim(),
        emblem: emblem || "🏰",
        color,
        position,
        isMaster,
        isPublic,
        description: description.trim(),
      };
      if (initial) {
        await updateCrew(initial.id, data);
      } else {
        await createCrew(data, me.uid);
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
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-2xl glass-strong p-5 ring-1 ring-accent/30"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-display text-lg">
          <Castle className="size-5 text-accent" />
          {initial ? "Modifier le clan" : "Nouveau clan"}
        </div>
        <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg-primary">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom du clan">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Les Glitchers"
            maxLength={40}
            className="w-full rounded-xl bg-bg-base/40 px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
          />
        </Field>
        <Field label="Emblème (emoji)">
          <input
            type="text"
            value={emblem}
            onChange={(e) => setEmblem(e.target.value.slice(0, 2))}
            placeholder="🏰"
            className="w-full rounded-xl bg-bg-base/40 px-3 py-2 text-center text-2xl ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
          />
        </Field>
        <Field label="Couleur">
          <div className="flex items-center gap-2 rounded-xl bg-bg-base/40 px-3 py-2 ring-1 ring-white/[0.06]">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="flex-1 bg-transparent text-xs font-mono focus:outline-none"
            />
          </div>
        </Field>
        <Field label="Position (ordre dans la sidebar)">
          <input
            type="number"
            value={position}
            onChange={(e) => setPosition(Number(e.target.value))}
            className="w-full rounded-xl bg-bg-base/40 px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
          />
        </Field>
        <div className="col-span-2">
          <Field label="Description (publique)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={140}
              rows={2}
              placeholder="Ex: Le crew maître où toute la communauté discute"
              className="w-full resize-none rounded-xl bg-bg-base/40 px-3 py-2 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
            />
          </Field>
        </div>
        <label className="col-span-1 flex cursor-pointer items-center gap-3 rounded-xl bg-bg-base/40 px-3 py-2.5 ring-1 ring-white/[0.06]">
          <input
            type="checkbox"
            checked={isMaster}
            onChange={(e) => setIsMaster(e.target.checked)}
            className="size-4 accent-amber-400"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-fg-primary">★ Crew maître</div>
            <div className="text-[10px] text-fg-muted">
              Tous les users sont membres auto. Réservé à "Simple Games".
            </div>
          </div>
        </label>
        <label className="col-span-1 flex cursor-pointer items-center gap-3 rounded-xl bg-bg-base/40 px-3 py-2.5 ring-1 ring-white/[0.06]">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            disabled={isMaster}
            className="size-4 accent-emerald-400"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-fg-primary">🌐 Public</div>
            <div className="text-[10px] text-fg-muted">
              Listé dans la page Découvrir, ouvert à tous.
            </div>
          </div>
        </label>
      </div>
      {error && (
        <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/30">
          {error}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-white/[0.04] px-4 py-2 text-sm ring-1 ring-white/[0.06] hover:bg-white/[0.08]"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-bg-base shadow-[0_0_18px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] disabled:opacity-50",
          )}
          style={{ background: color }}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {initial ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </motion.div>
  );
}

function ChannelEditor({
  crewId,
  initial,
  existingCount,
  onClose,
}: {
  crewId: string;
  initial: CrewChannel | null;
  existingCount: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [position, setPosition] = useState(initial?.position ?? existingCount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    // Accept any UTF-8 letter/digit + accents + spaces + tirets/underscores.
    // Strip only control chars (\p{C}) and the hash sign (already prefixed
    // visually by the UI). Collapse runs of whitespace to a single space.
    const cleanName = name
      .normalize("NFC")
      .replace(/[\p{C}#]+/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);
    if (!cleanName) {
      setError("Le nom est requis");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = { name: cleanName, description: description.trim(), position };
      if (initial) {
        await updateChannel(crewId, initial.id, data);
      } else {
        await createChannel(crewId, data);
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
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden rounded-xl bg-bg-base/40 p-3 ring-1 ring-accent/30"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Hash className="size-4 text-accent" />
        {initial ? "Modifier le salon" : "Nouveau salon"}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du salon (accents, tirets, etc. autorisés)"
          maxLength={50}
          className="col-span-2 rounded-lg bg-bg-elevated px-3 py-1.5 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
        />
        <input
          type="number"
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="rounded-lg bg-bg-elevated px-3 py-1.5 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
        />
      </div>
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optionnelle)"
        maxLength={120}
        className="mt-2 w-full rounded-lg bg-bg-elevated px-3 py-1.5 text-sm ring-1 ring-white/[0.06] focus:outline-none focus:ring-accent/50"
      />
      {error && <div className="mt-2 text-xs text-danger">{error}</div>}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-xs text-fg-muted hover:text-fg-primary"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-base disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {initial ? "Enregistrer" : "Créer"}
        </button>
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
