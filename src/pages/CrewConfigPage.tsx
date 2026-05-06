import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  AlertTriangle,
  Castle,
  Check,
  ClipboardCopy,
  Crown,
  Globe,
  Hash,
  Lock,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Shield,
  Smile,
  Trash2,
  Upload,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import {
  createChannel,
  createCustomRole,
  deleteChannel,
  deleteCrew,
  deleteCustomRole,
  kickCrewMember,
  rotateCrewJoinCode,
  setCrewMemberRole,
  setMemberCustomRole,
  updateChannel,
  updateCustomRole,
  updateUserCrew,
  uploadCrewIcon,
  watchCrewChannels,
  watchCrewCustomRoles,
  watchCrews,
  watchCrewMembers,
  type Crew,
  type CrewChannel,
  type CrewMember,
  type CustomRole,
} from "@/firebase/crews";
import { useUIStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useUsers } from "@/store/firebaseStores";
import { isAdmin as isLauncherAdmin, isAdminUid } from "@/lib/admin";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

const EMBLEMS = ["🏰", "⚔️", "🛡️", "🐉", "👑", "🦅", "🐺", "🦊", "🦁", "🔥", "⚡", "🌟", "💀", "🎮", "🎯"];

type Tab = "general" | "channels" | "roles" | "invite" | "danger";

const TABS: { id: Tab; label: string; icon: typeof Settings; ownerOnly?: boolean }[] = [
  { id: "general", label: "Général", icon: Settings },
  { id: "channels", label: "Salons", icon: Hash },
  { id: "roles", label: "Rôles & membres", icon: Shield },
  { id: "invite", label: "Code d'invitation", icon: Crown },
  { id: "danger", label: "Zone dangereuse", icon: AlertTriangle, ownerOnly: true },
];

/**
 * Full-page crew configuration. Replaces the old CrewSettingsModal
 * for non-trivial customisation work — channels CRUD, role
 * management, and an actual zone dangereuse with proper warning UI.
 *
 * Routed via `useUIStore.navigate({ name: "crew-config", crewId })`.
 * The current tab is preserved in the route so deep-links to a
 * specific section work (e.g. an invite-code copy button can link
 * straight to the "invite" tab).
 *
 * Access control : the page is open to any crew member (so they can
 * see their permissions / leave), but write actions are gated client-
 * side by `myRole`. Server-side enforcement lives in firestore.rules.
 */
export function CrewConfigPage() {
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const me = useAuthStore((s) => s.user);
  const allUsers = useUsers();

  const crewId = route.name === "crew-config" ? route.crewId : null;
  const tab: Tab = (route.name === "crew-config" && route.tab) || "general";

  const [crews, setCrews] = useState<Crew[]>([]);
  const [channels, setChannels] = useState<CrewChannel[]>([]);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);

  useEffect(() => {
    if (!crewId) return;
    return watchCrews(setCrews);
  }, [crewId]);

  useEffect(() => {
    if (!crewId) return;
    return watchCrewChannels(crewId, setChannels);
  }, [crewId]);

  useEffect(() => {
    if (!crewId) return;
    return watchCrewMembers(crewId, setMembers);
  }, [crewId]);

  useEffect(() => {
    if (!crewId) return;
    return watchCrewCustomRoles(crewId, setCustomRoles);
  }, [crewId]);

  const crew = useMemo(() => crews.find((c) => c.id === crewId), [crews, crewId]);
  const myMember = useMemo(
    () => members.find((m) => m.uid === me?.uid),
    [members, me?.uid],
  );
  const myRole = myMember?.role ?? null;
  // Launcher-wide admin owns every crew including master — can
  // configure / channel-CRUD / delete user crews. Regular ownership
  // is the per-crew "I created this" check.
  const isLauncherOwner = isLauncherAdmin(me);
  const isOwner = isLauncherOwner || (!!me && crew?.ownerUid === me.uid);
  const isAdmin = isOwner || myRole === "admin";

  /**
   * Master crew has implicit membership : every authed launcher user
   * is auto-included even if they don't have a `members/{uid}` doc.
   * We mirror what `MembersList` does — merge the live `useUsers()`
   * presence list with the (sparse) members docs to surface every-
   * one rather than just the few who triggered an explicit join.
   *
   * For user crews the members docs are the source of truth.
   */
  const displayedMembers = useMemo<CrewMember[]>(() => {
    if (!crew) return [];
    if (!crew.isMaster) return members;
    const byUid = new Map(members.map((m) => [m.uid, m] as const));
    return allUsers.map((u) => {
      const m = byUid.get(u.uid);
      // For the master crew, EVERY launcher admin is a de-facto
      // owner (not just the original `ownerUid` who happened to
      // create the crew doc). This handles the case where the
      // master crew was bootstrapped by an earlier admin and a
      // newer admin signs in — they should still see the Owner
      // badge instead of MEMBER.
      const isMasterOwner = u.uid === crew.ownerUid || isAdminUid(u.uid);
      return {
        uid: u.uid,
        role: (isMasterOwner ? "owner" : (m?.role ?? "member")) as
          | "owner"
          | "admin"
          | "member",
        joinedAt: m?.joinedAt ?? 0,
        displayName: m?.displayName ?? u.displayName ?? u.username ?? "Anonyme",
        avatarUrl: m?.avatarUrl ?? u.avatarUrl ?? null,
        // Propagate customRoleId from the real member doc if any,
        // so the badge renders correctly. Otherwise null so the
        // CustomRolePicker stays at its placeholder.
        customRoleId: m?.customRoleId ?? null,
      };
    });
  }, [crew, members, allUsers]);
  const realMemberCount = displayedMembers.length;

  const setTab = (next: Tab) => {
    if (!crewId) return;
    navigate({ name: "crew-config", crewId, tab: next });
  };

  if (!crewId) {
    return (
      <div className="grid h-full place-items-center text-fg-dim">
        Crew non spécifié.
      </div>
    );
  }

  if (!crew) {
    return (
      <div className="grid h-full place-items-center text-fg-dim">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="scroll-y-only relative h-full p-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex items-start gap-4"
      >
        <button
          onClick={() => navigate({ name: "crews", crewId })}
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-soft/60 text-fg-muted ring-1 ring-white/[0.06] transition-colors hover:bg-bg-soft hover:text-fg-primary"
          title="Retour au crew"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex flex-1 items-center gap-4">
          <div
            className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl ring-2"
            style={
              {
                background: crew.iconUrl
                  ? "transparent"
                  : `color-mix(in srgb, ${crew.color} 22%, var(--color-bg-elevated))`,
                color: crew.color,
                boxShadow: `0 0 22px ${crew.color}55`,
                ["--tw-ring-color" as string]: crew.color,
              } as React.CSSProperties
            }
          >
            {crew.iconUrl ? (
              <img
                src={crew.iconUrl}
                alt=""
                className="size-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-3xl">{crew.emblem}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.25em] text-fg-dim">
              Configuration
            </p>
            <h1 className="font-display text-3xl text-fg-primary">{crew.name}</h1>
            <p className="text-xs text-fg-muted">
              Tu es{" "}
              <span
                className="font-semibold"
                style={{ color: crew.color }}
              >
                {isOwner
                  ? "propriétaire"
                  : myRole === "admin"
                    ? "admin"
                    : myRole === "member"
                      ? "membre"
                      : "non-membre"}
              </span>{" "}
              · {realMemberCount} membre{realMemberCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="mb-6 flex flex-wrap gap-1.5 rounded-xl bg-bg-soft/40 p-1.5 ring-1 ring-white/[0.04]">
        {TABS.map((t) => {
          if (t.ownerOnly && !isOwner) return null;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                sounds.click();
                setTab(t.id);
              }}
              className={cn(
                "no-drag inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                  : "text-fg-muted hover:bg-white/[0.03] hover:text-fg-primary",
              )}
            >
              <t.icon className="size-4" />
              {t.label}
              {t.id === "danger" && active && (
                <span className="ml-0.5 size-1.5 rounded-full bg-danger" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          className="max-w-3xl"
        >
          {tab === "general" && (
            <GeneralTab crew={crew} canEdit={isOwner} />
          )}
          {tab === "channels" && (
            <ChannelsTab
              crewId={crewId}
              channels={channels}
              canEdit={isAdmin}
            />
          )}
          {tab === "roles" && (
            <RolesTab
              members={displayedMembers}
              customRoles={customRoles}
              crew={crew}
              myUid={me?.uid ?? null}
              canModerate={isAdmin}
              isOwner={isOwner}
            />
          )}
          {tab === "invite" && (
            <InviteTab crew={crew} canRotate={isOwner} />
          )}
          {tab === "danger" && isOwner && (
            <DangerTab crew={crew} onDeleted={() => navigate({ name: "crews" })} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Tab: Général ───────────────────────────────────────────────────────

function GeneralTab({ crew, canEdit }: { crew: Crew; canEdit: boolean }) {
  const [name, setName] = useState(crew.name);
  const [description, setDescription] = useState(crew.description);
  const [emblem, setEmblem] = useState(crew.emblem);
  const [color, setColor] = useState(crew.color);
  const [isPublic, setIsPublic] = useState(crew.isPublic);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset form when the crew changes (e.g. owner edits another crew
  // then comes back).
  useEffect(() => {
    setName(crew.name);
    setDescription(crew.description);
    setEmblem(crew.emblem);
    setColor(crew.color);
    setIsPublic(crew.isPublic);
    setError(null);
    setSuccess(false);
  }, [crew]);

  const handleSave = async () => {
    if (!canEdit) return;
    if (!name.trim()) {
      setError("Le nom ne peut pas être vide.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateUserCrew(crew.id, {
        name: name.trim(),
        description: description.trim(),
        emblem,
        color,
        isPublic,
      });
      if (iconFile) {
        await uploadCrewIcon(crew.id, iconFile);
        setIconFile(null);
        if (iconPreview) URL.revokeObjectURL(iconPreview);
        setIconPreview(null);
      }
      sounds.success();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 1800);
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Nom du crew">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          disabled={!canEdit}
          className="w-full rounded-lg bg-bg-soft/40 px-3.5 py-2.5 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
        />
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={140}
          rows={3}
          disabled={!canEdit}
          className="w-full resize-none rounded-lg bg-bg-soft/40 px-3.5 py-2.5 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-60"
        />
      </Field>

      <Field label="Icône du crew">
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-xl bg-bg-soft/30 p-3 ring-1 ring-white/[0.06]">
            <div
              className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl ring-1"
              style={
                {
                  background:
                    iconPreview || crew.iconUrl
                      ? "transparent"
                      : `color-mix(in srgb, ${color} 18%, transparent)`,
                  color,
                  ["--tw-ring-color" as string]: color,
                } as React.CSSProperties
              }
            >
              {iconPreview ? (
                <img src={iconPreview} alt="" className="size-full object-cover" />
              ) : crew.iconUrl ? (
                <img
                  src={crew.iconUrl}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-3xl">{emblem}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-fg-primary">
                {iconFile
                  ? iconFile.name
                  : crew.iconUrl
                    ? "Icône custom uploadée"
                    : "Aucune image — l'emoji est utilisé"}
              </div>
              <div className="text-[10px] text-fg-muted">
                PNG / JPG / WebP · 2 MiB max
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) {
                  setError("Image trop lourde (2 MiB max).");
                  return;
                }
                setError(null);
                if (iconPreview) URL.revokeObjectURL(iconPreview);
                setIconFile(f);
                setIconPreview(URL.createObjectURL(f));
              }}
              className="hidden"
              disabled={!canEdit}
            />
            {iconFile ? (
              <button
                type="button"
                onClick={() => {
                  if (iconPreview) URL.revokeObjectURL(iconPreview);
                  setIconFile(null);
                  setIconPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="grid size-9 place-items-center rounded-lg bg-white/[0.04] text-fg-muted ring-1 ring-white/[0.06] hover:bg-danger/10 hover:text-danger"
                title="Annuler le changement"
              >
                <X className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canEdit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-bg-base shadow-[0_0_14px_var(--color-accent-soft)] hover:shadow-[0_0_20px_var(--color-accent-glow)] disabled:opacity-50"
              >
                <Upload className="size-3.5" />
                {crew.iconUrl ? "Remplacer" : "Importer"}
              </button>
            )}
          </div>

          {!iconFile && !crew.iconUrl && (
            <>
              <div className="flex items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider text-fg-dim">
                <Smile className="size-3" /> Ou choisis un emoji
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {EMBLEMS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmblem(e)}
                    disabled={!canEdit}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg text-2xl transition disabled:opacity-50",
                      emblem === e
                        ? "bg-accent/20 ring-2 ring-accent"
                        : "bg-bg-soft/30 ring-1 ring-white/[0.06] hover:bg-white/[0.04]",
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </Field>

      <Field label="Couleur d'accent du crew">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!canEdit}
            className="size-10 cursor-pointer rounded-lg bg-bg-soft/40 ring-1 ring-white/[0.06] disabled:opacity-50"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!canEdit}
            className="flex-1 rounded-lg bg-bg-soft/40 px-3 py-2 font-mono text-xs text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-50"
          />
        </div>
      </Field>

      <Field label="Visibilité">
        <div className="rounded-xl bg-bg-soft/30 p-1 ring-1 ring-white/[0.06]">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              disabled={!canEdit}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-50",
                isPublic
                  ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "text-fg-muted hover:bg-white/[0.04]",
              )}
            >
              <Globe className="size-4" /> Public
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              disabled={!canEdit}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-50",
                !isPublic
                  ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                  : "text-fg-muted hover:bg-white/[0.04]",
              )}
            >
              <Lock className="size-4" /> Privé
            </button>
          </div>
        </div>
      </Field>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm ring-1 ring-danger/30">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="text-fg-primary">{error}</p>
        </div>
      )}

      {canEdit && (
        <button
          onClick={handleSave}
          disabled={submitting}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-5 py-3 font-medium transition-shadow disabled:opacity-50",
            success
              ? "bg-emerald-500 text-bg-base"
              : "bg-accent text-bg-base shadow-[0_0_24px_var(--color-accent-soft)] hover:shadow-[0_0_36px_var(--color-accent-glow)]",
          )}
        >
          {success ? (
            <>
              <Check className="size-4" /> Enregistré
            </>
          ) : submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Enregistrement…
            </>
          ) : (
            <>
              <Save className="size-4" /> Enregistrer
            </>
          )}
        </button>
      )}
      {!canEdit && (
        <p className="text-xs text-fg-dim">
          Lecture seule — seul le propriétaire peut modifier les paramètres
          généraux.
        </p>
      )}
    </div>
  );
}

// ─── Tab: Salons ────────────────────────────────────────────────────────

function ChannelsTab({
  crewId,
  channels,
  canEdit,
}: {
  crewId: string;
  channels: CrewChannel[];
  canEdit: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...channels].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [channels],
  );

  const handleCreate = async () => {
    if (!canEdit) return;
    const name = newName.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 24);
    if (!name) {
      setError("Le nom ne peut pas être vide.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createChannel(crewId, {
        name,
        description: "",
        position: (sorted[sorted.length - 1]?.position ?? 0) + 1,
      });
      sounds.success();
      setNewName("");
    } catch (e) {
      sounds.error();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-bg-soft/30 p-4 ring-1 ring-white/[0.06]">
        <p className="mb-3 text-xs text-fg-muted">
          Les salons sont les espaces de discussion de ton crew. Crée-en pour
          séparer les sujets : <span className="text-fg-primary">général</span>,{" "}
          <span className="text-fg-primary">strats</span>,{" "}
          <span className="text-fg-primary">memes</span>, etc.
        </p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <span className="text-fg-dim">#</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              placeholder="nom-du-salon"
              maxLength={24}
              className="flex-1 rounded-lg bg-bg-soft/40 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-bg-base shadow-[0_0_14px_var(--color-accent-soft)] hover:shadow-[0_0_20px_var(--color-accent-glow)] disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Créer
            </button>
          </div>
        )}
        {error && (
          <p className="mt-2 text-xs text-danger">{error}</p>
        )}
      </div>

      <div className="space-y-1.5">
        {sorted.length === 0 ? (
          <div className="rounded-xl bg-bg-soft/20 p-6 text-center text-sm text-fg-muted ring-1 ring-white/[0.04]">
            Aucun salon. Crée-en un ci-dessus.
          </div>
        ) : (
          sorted.map((ch) => (
            <ChannelRow
              key={ch.id}
              channel={ch}
              crewId={crewId}
              canEdit={canEdit}
              canDelete={canEdit && sorted.length > 1}
            />
          ))
        )}
      </div>
      {sorted.length === 1 && (
        <p className="text-[11px] text-fg-dim">
          Au moins un salon doit rester dans le crew. Crée-en un autre pour
          pouvoir supprimer celui-ci.
        </p>
      )}
    </div>
  );
}

function ChannelRow({
  channel,
  crewId,
  canEdit,
  canDelete,
}: {
  channel: CrewChannel;
  crewId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(channel.name);
    setDescription(channel.description ?? "");
  }, [channel]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await updateChannel(crewId, channel.id, {
        name: name.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim(),
      });
      sounds.success();
      setEditing(false);
    } catch (err) {
      sounds.error();
      console.warn("[crew-config] update channel failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Supprimer le salon #${channel.name} ? Tous les messages seront perdus.`))
      return;
    setBusy(true);
    try {
      await deleteChannel(crewId, channel.id);
      sounds.success();
    } catch (err) {
      sounds.error();
      console.warn("[crew-config] delete channel failed:", err);
    } finally {
      setBusy(false);
    }
  };

  if (editing && canEdit) {
    return (
      <div className="space-y-2 rounded-xl bg-bg-soft/40 p-3 ring-1 ring-accent/30">
        <div className="flex items-center gap-2">
          <span className="text-fg-dim">#</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            className="flex-1 rounded-lg bg-bg-base/40 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
          />
        </div>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optionnelle)"
          maxLength={120}
          className="w-full rounded-lg bg-bg-base/40 px-3 py-2 text-xs text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setEditing(false);
              setName(channel.name);
              setDescription(channel.description ?? "");
            }}
            className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-base disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-bg-soft/30 p-3 ring-1 ring-white/[0.04] transition-colors hover:bg-bg-soft/50">
      <span className="text-fg-dim">#</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg-primary">{channel.name}</div>
        {channel.description && (
          <div className="truncate text-[11px] text-fg-muted">
            {channel.description}
          </div>
        )}
      </div>
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary"
        >
          Renommer
        </button>
      )}
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={busy}
          className="grid size-8 place-items-center rounded-lg bg-white/[0.04] text-fg-muted ring-1 ring-white/[0.06] hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          title={`Supprimer #${channel.name}`}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

// ─── Tab: Rôles & membres ───────────────────────────────────────────────

function RolesTab({
  members,
  customRoles,
  crew,
  myUid,
  canModerate,
  isOwner,
}: {
  members: CrewMember[];
  customRoles: CustomRole[];
  crew: Crew;
  myUid: string | null;
  /** True if the viewer can promote / demote / kick (admin or
   *  launcher-admin or owner). */
  canModerate: boolean;
  /** True if the viewer is owner-level (regular owner OR launcher
   *  admin). Owners can promote others to admin and demote admins,
   *  whereas non-owner admins can only kick members and other admins. */
  isOwner: boolean;
}) {
  const sorted = useMemo(() => {
    const order: Record<string, number> = { owner: 0, admin: 1, member: 2 };
    return [...members].sort(
      (a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9),
    );
  }, [members]);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePromote = async (uid: string) => {
    if (busyUid) return;
    setBusyUid(uid);
    setError(null);
    try {
      await setCrewMemberRole(crew.id, uid, "admin");
      sounds.success();
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUid(null);
    }
  };

  const handleDemote = async (uid: string) => {
    if (busyUid) return;
    setBusyUid(uid);
    setError(null);
    try {
      await setCrewMemberRole(crew.id, uid, "member");
      sounds.success();
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUid(null);
    }
  };

  const handleKick = async (uid: string, displayName: string | null) => {
    if (busyUid) return;
    if (
      !confirm(
        `Kick "${displayName ?? "ce membre"}" du crew ? Il pourra rejoindre à nouveau via le code d'invitation.`,
      )
    )
      return;
    setBusyUid(uid);
    setError(null);
    try {
      await kickCrewMember(crew.id, uid);
      sounds.success();
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-bg-soft/30 p-4 text-xs leading-relaxed text-fg-muted ring-1 ring-white/[0.06]">
        <div className="mb-2 flex items-center gap-2 text-fg-primary">
          <Shield className="size-3.5 text-accent" />
          <span className="font-medium">Système de rôles</span>
        </div>
        Le crew utilise <strong className="text-fg-primary">trois rôles</strong> :
        <ul className="mt-2 space-y-1.5">
          <li>
            <Crown className="-mt-0.5 mr-1.5 inline size-3 text-amber-300" />
            <strong className="text-amber-300">Owner</strong> — peut tout faire
            (modifier les paramètres, gérer les rôles, supprimer le crew).
          </li>
          <li>
            <Shield className="-mt-0.5 mr-1.5 inline size-3 text-cyan-300" />
            <strong className="text-cyan-300">Admin</strong> — modère, gère les
            salons, kick les membres. Pas de pouvoir sur le crew lui-même.
          </li>
          <li>
            <Users className="-mt-0.5 mr-1.5 inline size-3 text-fg-muted" />
            <strong className="text-fg-muted">Member</strong> — discute, lance
            des invites de jeu, envoie des messages.
          </li>
        </ul>
        {canModerate && (
          <p className="mt-3 text-[11px] text-fg-dim">
            Utilise les boutons à droite de chaque membre pour promouvoir
            (Shield), rétrograder (Users) ou kick (UserMinus).
          </p>
        )}
      </div>

      {/* Custom roles management — visible to admin/owner only.
          These are purely cosmetic badges (VIP, Citoyen, Vétéran…)
          assigned on top of the structural Owner/Admin/Member trio. */}
      {canModerate && (
        <CustomRolesManager crew={crew} customRoles={customRoles} />
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm ring-1 ring-danger/30">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <p className="text-fg-primary">{error}</p>
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.length === 0 ? (
          <div className="rounded-xl bg-bg-soft/20 p-6 text-center text-sm text-fg-muted ring-1 ring-white/[0.04]">
            Aucun membre listé.
          </div>
        ) : (
          sorted.map((m) => {
            // On the master crew, any launcher admin is treated as
            // owner (their role got pre-set to "owner" in the parent's
            // displayedMembers compute). For user crews, only the
            // explicit `ownerUid` is the real owner.
            const isMemberOwner =
              m.uid === crew.ownerUid ||
              (crew.isMaster && isAdminUid(m.uid));
            const effectiveRole: "owner" | "admin" | "member" = isMemberOwner
              ? "owner"
              : m.role;
            const isMe = m.uid === myUid;
            const busy = busyUid === m.uid;

            // Action visibility rules :
            //   - Can NEVER act on yourself or on an owner-level user
            //   - Promote (member → admin) : owner-level only
            //   - Demote (admin → member) : owner-level only
            //   - Kick (any non-owner) : admin or higher, but admins
            //     can only kick members (not other admins)
            const canPromote =
              canModerate &&
              isOwner &&
              !isMe &&
              effectiveRole === "member";
            const canDemote =
              canModerate &&
              isOwner &&
              !isMe &&
              effectiveRole === "admin";
            const canKick =
              canModerate &&
              !isMe &&
              effectiveRole !== "owner" &&
              (isOwner || effectiveRole === "member");

            const memberCustomRole = customRoles.find(
              (r) => r.id === m.customRoleId,
            );
            return (
              <div
                key={m.uid}
                className="flex items-center gap-3 rounded-xl bg-bg-soft/30 p-3 ring-1 ring-white/[0.04]"
              >
                {m.avatarUrl ? (
                  <img
                    src={m.avatarUrl}
                    alt=""
                    className="size-8 rounded-full object-cover ring-1 ring-white/10"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="grid size-8 place-items-center rounded-full bg-accent/15 text-xs font-display text-accent ring-1 ring-accent/20">
                    {(m.displayName ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg-primary">
                    {m.displayName ?? "Anonyme"}
                    {isMe && (
                      <span className="ml-2 text-[10px] text-fg-dim">
                        (toi)
                      </span>
                    )}
                  </div>
                  {memberCustomRole && (
                    <span
                      className="mt-0.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1"
                      style={{
                        background: `color-mix(in srgb, ${memberCustomRole.color} 15%, transparent)`,
                        color: memberCustomRole.color,
                        ["--tw-ring-color" as string]: `color-mix(in srgb, ${memberCustomRole.color} 35%, transparent)`,
                      } as React.CSSProperties}
                    >
                      {memberCustomRole.name}
                    </span>
                  )}
                </div>
                <RoleBadge role={effectiveRole} />
                {canModerate && customRoles.length > 0 && !isMemberOwner && (
                  <CustomRolePicker
                    crewId={crew.id}
                    memberUid={m.uid}
                    currentRoleId={m.customRoleId ?? null}
                    customRoles={customRoles}
                  />
                )}
                {(canPromote || canDemote || canKick) && (
                  <div className="flex items-center gap-1.5">
                    {canPromote && (
                      <ActionButton
                        title="Promouvoir admin"
                        onClick={() => handlePromote(m.uid)}
                        busy={busy}
                        accent="cyan"
                      >
                        <Shield className="size-3.5" />
                      </ActionButton>
                    )}
                    {canDemote && (
                      <ActionButton
                        title="Rétrograder en membre"
                        onClick={() => handleDemote(m.uid)}
                        busy={busy}
                        accent="amber"
                      >
                        <Users className="size-3.5" />
                      </ActionButton>
                    )}
                    {canKick && (
                      <ActionButton
                        title="Kick du crew"
                        onClick={() => handleKick(m.uid, m.displayName)}
                        busy={busy}
                        accent="danger"
                      >
                        <UserMinus className="size-3.5" />
                      </ActionButton>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Custom roles management (admin / owner) ────────────────────────────

function CustomRolesManager({
  crew,
  customRoles,
}: {
  crew: Crew;
  customRoles: CustomRole[];
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#a78bfa");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Donne un nom au rôle.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createCustomRole(crew.id, {
        name: trimmed,
        color,
        position: customRoles.length,
      });
      sounds.success();
      setName("");
      setColor("#a78bfa");
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-xl bg-bg-soft/30 p-4 ring-1 ring-white/[0.06]">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-fg-primary">
        <Users className="size-4 text-accent" />
        Rôles custom
        <span className="text-[11px] font-normal text-fg-muted">
          · Badges décoratifs (VIP, Citoyen, Vétéran…) en plus
          d'Owner/Admin/Member
        </span>
      </div>

      {/* Create form */}
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Nom du rôle (ex: VIP)"
          maxLength={20}
          className="flex-1 rounded-lg bg-bg-base/40 px-3 py-2 text-sm text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="size-9 cursor-pointer rounded-lg bg-bg-base/40 ring-1 ring-white/[0.06]"
          title="Couleur du badge"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-bg-base shadow-[0_0_14px_var(--color-accent-soft)] hover:shadow-[0_0_20px_var(--color-accent-glow)] disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Créer
        </button>
      </div>

      {error && (
        <p className="mb-2 text-[11px] text-danger">{error}</p>
      )}

      {customRoles.length === 0 ? (
        <p className="text-[11px] text-fg-dim">
          Aucun rôle custom pour l'instant. Crée-en un ci-dessus pour
          décorer tes membres.
        </p>
      ) : (
        <div className="space-y-1.5">
          {customRoles.map((role) => (
            <CustomRoleRow key={role.id} crewId={crew.id} role={role} />
          ))}
        </div>
      )}
    </div>
  );
}

function CustomRoleRow({
  crewId,
  role,
}: {
  crewId: string;
  role: CustomRole;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(role.name);
    setColor(role.color);
  }, [role]);

  const handleSave = async () => {
    setBusy(true);
    try {
      await updateCustomRole(crewId, role.id, {
        name: name.trim() || role.name,
        color,
      });
      sounds.success();
      setEditing(false);
    } catch (err) {
      sounds.error();
      console.warn("[crew-config] update custom role failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Supprimer le rôle '${role.name}' ? Les membres qui l'ont l'auront retiré.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteCustomRole(crewId, role.id);
      sounds.success();
    } catch (err) {
      sounds.error();
      console.warn("[crew-config] delete custom role failed:", err);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-bg-base/40 p-2 ring-1 ring-accent/30">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="flex-1 rounded-md bg-bg-base/60 px-2 py-1.5 text-xs text-fg-primary ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="size-8 cursor-pointer rounded-md bg-bg-base/60 ring-1 ring-white/[0.06]"
        />
        <button
          onClick={() => {
            setEditing(false);
            setName(role.name);
            setColor(role.color);
          }}
          className="rounded-md bg-white/[0.04] px-2 py-1.5 text-[11px] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary"
        >
          Annuler
        </button>
        <button
          onClick={handleSave}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1.5 text-[11px] font-medium text-bg-base disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg bg-bg-base/30 p-2 ring-1 ring-white/[0.04]">
      <span
        className="grid h-6 min-w-[60px] place-items-center rounded-md px-2 text-[11px] font-medium ring-1"
        style={{
          background: `color-mix(in srgb, ${role.color} 18%, transparent)`,
          color: role.color,
          ["--tw-ring-color" as string]: `color-mix(in srgb, ${role.color} 38%, transparent)`,
        } as React.CSSProperties}
      >
        {role.name}
      </span>
      <span className="flex-1 truncate text-[11px] text-fg-dim">
        {role.color}
      </span>
      <button
        onClick={() => setEditing(true)}
        className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary"
      >
        Modifier
      </button>
      <button
        onClick={handleDelete}
        disabled={busy}
        className="grid size-6 place-items-center rounded-md bg-white/[0.04] text-fg-muted ring-1 ring-white/[0.06] hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        title={`Supprimer ${role.name}`}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Trash2 className="size-3" />
        )}
      </button>
    </div>
  );
}

function CustomRolePicker({
  crewId,
  memberUid,
  currentRoleId,
  customRoles,
}: {
  crewId: string;
  memberUid: string;
  currentRoleId: string | null;
  customRoles: CustomRole[];
}) {
  const [busy, setBusy] = useState(false);
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setBusy(true);
    try {
      await setMemberCustomRole(crewId, memberUid, value || null);
      sounds.success();
    } catch (err) {
      sounds.error();
      console.warn("[crew-config] set custom role failed:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      value={currentRoleId ?? ""}
      onChange={handleChange}
      disabled={busy}
      className="rounded-md bg-bg-base/40 px-2 py-1 text-[11px] text-fg-muted ring-1 ring-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-50"
      title="Attribuer un rôle custom à ce membre"
    >
      <option value="">— rôle custom —</option>
      {customRoles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}

function ActionButton({
  title,
  onClick,
  busy,
  accent,
  children,
}: {
  title: string;
  onClick: () => void;
  busy: boolean;
  accent: "cyan" | "amber" | "danger";
  children: React.ReactNode;
}) {
  const accentClasses =
    accent === "cyan"
      ? "text-cyan-300 ring-cyan-500/30 hover:bg-cyan-500/10"
      : accent === "amber"
        ? "text-amber-300 ring-amber-500/30 hover:bg-amber-500/10"
        : "text-danger ring-danger/30 hover:bg-danger/10";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      className={cn(
        "no-drag grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.02] ring-1 transition-colors disabled:opacity-50",
        accentClasses,
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : children}
    </button>
  );
}

function RoleBadge({ role }: { role: "owner" | "admin" | "member" }) {
  if (role === "owner") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300 ring-1 ring-amber-500/30">
        <Crown className="size-3" /> Owner
      </span>
    );
  }
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-cyan-300 ring-1 ring-cyan-500/30">
        <Shield className="size-3" /> Admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-fg-muted ring-1 ring-white/[0.06]">
      <Users className="size-3" /> Member
    </span>
  );
}

// ─── Tab: Code d'invitation ─────────────────────────────────────────────

function InviteTab({
  crew,
  canRotate,
}: {
  crew: Crew;
  canRotate: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  const handleCopy = async () => {
    if (!crew.joinCode) return;
    try {
      await navigator.clipboard.writeText(crew.joinCode);
      sounds.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied */
    }
  };

  const handleRotate = async () => {
    if (
      !confirm(
        "Régénérer un nouveau code d'invitation ? L'ancien sera invalidé immédiatement, les liens partagés ne fonctionneront plus.",
      )
    )
      return;
    setRotating(true);
    try {
      await rotateCrewJoinCode(crew.id);
      sounds.success();
    } catch (err) {
      sounds.error();
      console.warn("[crew-config] rotate code failed:", err);
    } finally {
      setRotating(false);
    }
  };

  if (!crew.joinCode) {
    return (
      <div className="rounded-xl bg-bg-soft/30 p-6 text-center text-sm text-fg-muted ring-1 ring-white/[0.04]">
        Pas de code d'invitation actif.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-cyan-500/[0.06] p-6 ring-1 ring-cyan-500/20">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-cyan-300">
            Code d'invitation
          </span>
          <span className="text-[10px] text-fg-dim">Partage-le pour rejoindre</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-lg bg-bg-base/40 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-cyan-200 ring-1 ring-cyan-500/30">
            {crew.joinCode}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            title="Copier"
            className="grid size-12 place-items-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30 transition hover:bg-cyan-500/25"
          >
            {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
          </button>
          {canRotate && (
            <button
              type="button"
              onClick={handleRotate}
              disabled={rotating}
              title="Régénérer (invalide l'ancien)"
              className="grid size-12 place-items-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25 disabled:opacity-50"
            >
              {rotating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-fg-muted">
        Toute personne qui a ce code peut rejoindre ton crew. Si tu suspectes
        qu'il a fuité {canRotate ? "(régénère via le bouton ↻ ci-dessus)" : "(demande au propriétaire de le régénérer)"}.
      </p>
    </div>
  );
}

// ─── Tab: Zone dangereuse ───────────────────────────────────────────────

function DangerTab({
  crew,
  onDeleted,
}: {
  crew: Crew;
  onDeleted: () => void;
}) {
  const [stage, setStage] = useState<"idle" | "confirm" | "deleting">("idle");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (typed !== crew.name) {
      setError(`Tape exactement "${crew.name}" pour confirmer.`);
      return;
    }
    setStage("deleting");
    setError(null);
    try {
      await deleteCrew(crew.id);
      sounds.success();
      onDeleted();
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
      setStage("confirm");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-danger/30 bg-danger/[0.04] p-6">
        <div className="mb-2 flex items-center gap-2 text-danger">
          <AlertTriangle className="size-5" />
          <span className="font-display text-lg">Supprimer le crew</span>
        </div>
        <p className="mb-4 text-sm text-fg-muted">
          Cette action <strong className="text-danger">ne peut pas être annulée</strong>. Tous
          les channels, messages, membres et l'historique du crew seront
          définitivement perdus.
        </p>

        {stage === "idle" ? (
          <button
            onClick={() => {
              setStage("confirm");
              setTyped("");
              setError(null);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-danger/15 px-5 py-3 text-sm font-medium text-danger ring-1 ring-danger/30 transition hover:bg-danger/25"
          >
            <Trash2 className="size-4" />
            Je veux supprimer ce crew
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-fg-primary">
              Pour confirmer, tape le nom exact du crew :{" "}
              <code className="rounded bg-bg-base/60 px-1.5 py-0.5 font-mono text-danger">
                {crew.name}
              </code>
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={crew.name}
              autoFocus
              className="w-full rounded-lg bg-bg-base/40 px-3 py-2 text-sm text-fg-primary ring-1 ring-danger/30 focus:outline-none focus:ring-1 focus:ring-danger"
            />
            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-xs ring-1 ring-danger/30">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" />
                <p className="text-fg-primary">{error}</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setStage("idle");
                  setTyped("");
                  setError(null);
                }}
                disabled={stage === "deleting"}
                className="rounded-lg bg-white/[0.04] px-4 py-2 text-xs text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={stage === "deleting" || typed !== crew.name}
                className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-xs font-medium text-white shadow-[0_0_18px_rgba(239,68,68,0.4)] hover:shadow-[0_0_28px_rgba(239,68,68,0.6)] disabled:opacity-50"
              >
                {stage === "deleting" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Suppression…
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5" /> Supprimer définitivement
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-wider text-fg-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

// Avoid Castle being tree-shaken — referenced for type only above
void Castle;
