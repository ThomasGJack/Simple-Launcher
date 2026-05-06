import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ClipboardCopy,
  Crown,
  Loader2,
  LogOut,
  Settings,
  Shield,
  Trash2,
  X,
} from "lucide-react";
import { deleteCrew, leaveCrew, type Crew, type CrewRole } from "@/firebase/crews";
import { useUIStore } from "@/store/ui";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Context menu surfaced on right-click of a crew icon in the
 * CrewsPage left rail. Shows actions tailored to the user's role :
 *
 *  - **Owner** : Configuration, Copier le code d'invitation,
 *    Supprimer le crew (with confirmation)
 *  - **Admin** : Configuration, Quitter le crew
 *  - **Member** : Quitter le crew
 *  - **Master crew** (the launcher-wide one) : just an info note
 *    ("Crew maître — tu ne peux pas le quitter")
 *
 * The menu is positioned with absolute / left+top from the click
 * coordinate and auto-dismisses on outside click + Escape.
 */
export function CrewContextMenu({
  crew,
  myUid,
  myRole,
  position,
  onClose,
}: {
  crew: Crew;
  myUid: string;
  myRole: CrewRole | null;
  /** Viewport pixel coordinates where the menu should anchor. */
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const navigate = useUIStore((s) => s.navigate);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState<"delete" | "leave" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  const isOwner = crew.ownerUid === myUid;

  // Outside-click + Escape dismiss
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleConfig = () => {
    sounds.click();
    onClose();
    navigate({ name: "crew-config", crewId: crew.id });
  };

  const handleCopyCode = async () => {
    if (!crew.joinCode) return;
    try {
      await navigator.clipboard.writeText(crew.joinCode);
      sounds.success();
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      /* clipboard denied */
    }
  };

  const handleLeave = async () => {
    setBusy("leave");
    setError(null);
    try {
      await leaveCrew(crew.id, myUid);
      sounds.success();
      onClose();
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    setBusy("delete");
    setError(null);
    try {
      await deleteCrew(crew.id);
      sounds.success();
      onClose();
    } catch (err) {
      sounds.error();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  // Clamp position so the menu doesn't overflow the viewport. We
  // assume a fixed menu width of ~260 px and a max height of ~420 px.
  const MENU_W = 260;
  const MENU_H = 420;
  const clampedX = Math.min(position.x, window.innerWidth - MENU_W - 16);
  const clampedY = Math.min(position.y, window.innerHeight - MENU_H - 16);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.14 }}
      className="fixed z-[200] flex flex-col gap-1 rounded-2xl border border-white/[0.08] bg-bg-soft/95 p-2 shadow-[0_30px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      style={{
        left: clampedX,
        top: clampedY,
        width: MENU_W,
        ["--tw-ring-color" as string]: crew.color,
      }}
    >
      {/* Header — crew identity */}
      <div className="mb-1 flex items-center gap-2.5 border-b border-white/[0.05] px-2 pb-2">
        <div
          className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg ring-1"
          style={{
            background: crew.iconUrl
              ? "transparent"
              : `color-mix(in srgb, ${crew.color} 22%, var(--color-bg-elevated))`,
            color: crew.color,
            ["--tw-ring-color" as string]: crew.color,
          } as React.CSSProperties}
        >
          {crew.iconUrl ? (
            <img
              src={crew.iconUrl}
              alt=""
              className="size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-base">{crew.emblem}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg-primary">
            {crew.name}
          </div>
          <div className="truncate text-[10px] text-fg-muted">
            {isOwner ? (
              <span className="inline-flex items-center gap-0.5 text-amber-300">
                <Crown className="size-2.5" /> Owner
              </span>
            ) : myRole === "admin" ? (
              <span className="inline-flex items-center gap-0.5 text-cyan-300">
                <Shield className="size-2.5" /> Admin
              </span>
            ) : (
              "Membre"
            )}
            {" · "}
            {crew.memberCount ?? "—"} membre
            {(crew.memberCount ?? 0) > 1 ? "s" : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid size-6 shrink-0 place-items-center rounded-md text-fg-dim hover:bg-white/[0.06] hover:text-fg-primary"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {confirmDelete ? (
        <DeleteConfirm
          crewName={crew.name}
          busy={busy === "delete"}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      ) : confirmLeave ? (
        <LeaveConfirm
          crewName={crew.name}
          busy={busy === "leave"}
          onCancel={() => setConfirmLeave(false)}
          onConfirm={handleLeave}
        />
      ) : (
        <>
          {/* Configuration — accessible to admin / owner. Members
              can still open it (read-only / leave button), so we
              keep it visible for everyone except crews with no
              special config (master crew). */}
          {!crew.isMaster && (
            <Item
              icon={<Settings className="size-4" />}
              label="Configuration"
              hint="Salons, rôles, code d'invitation…"
              onClick={handleConfig}
            />
          )}

          {/* Copy invite code (members + admin + owner) */}
          {crew.joinCode && !crew.isMaster && (
            <Item
              icon={<ClipboardCopy className="size-4" />}
              label={codeCopied ? "Copié !" : "Copier le code d'invitation"}
              hint={crew.joinCode}
              onClick={handleCopyCode}
              accent={codeCopied ? "emerald" : undefined}
            />
          )}

          {/* Leave (members + admin, NOT owner — owner must delete
              or transfer ownership first ; the second isn't
              implemented yet so for now owner sees Supprimer). */}
          {!crew.isMaster && !isOwner && (
            <Item
              icon={<LogOut className="size-4" />}
              label="Quitter le crew"
              hint="Tu pourras le rejoindre à nouveau via le code"
              onClick={() => setConfirmLeave(true)}
              accent="warning"
            />
          )}

          {/* Delete (owner only) */}
          {isOwner && (
            <Item
              icon={<Trash2 className="size-4" />}
              label="Supprimer le crew"
              hint="Définitif — tous les channels & messages perdus"
              onClick={() => setConfirmDelete(true)}
              accent="danger"
            />
          )}

          {/* Master crew note */}
          {crew.isMaster && (
            <div className="rounded-lg bg-amber-500/[0.06] p-2.5 text-[11px] text-amber-300/80 ring-1 ring-amber-500/20">
              <div className="mb-0.5 flex items-center gap-1.5 font-medium text-amber-300">
                <Crown className="size-3" /> Crew maître
              </div>
              Le crew Simple Games rassemble tous les joueurs du launcher.
              Tu ne peux pas le quitter ni le configurer (l'admin du
              launcher s'en occupe).
            </div>
          )}

          {error && (
            <div className="mt-1 flex items-start gap-2 rounded-lg bg-danger/10 p-2 text-[11px] ring-1 ring-danger/30">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-danger" />
              <span className="text-fg-primary">{error}</span>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

function Item({
  icon,
  label,
  hint,
  onClick,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  accent?: "danger" | "warning" | "emerald";
}) {
  const accentClasses =
    accent === "danger"
      ? "text-danger hover:bg-danger/10 hover:ring-danger/30"
      : accent === "warning"
        ? "text-amber-300 hover:bg-amber-500/10 hover:ring-amber-500/30"
        : accent === "emerald"
          ? "text-emerald-300 hover:bg-emerald-500/10 hover:ring-emerald-500/30"
          : "text-fg-primary hover:bg-white/[0.04]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "no-drag flex w-full items-center gap-3 rounded-lg p-2.5 text-left text-sm font-medium ring-1 ring-transparent transition-colors",
        accentClasses,
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.04]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint && (
          <span className="block truncate text-[10px] text-fg-dim">{hint}</span>
        )}
      </span>
    </button>
  );
}

// ─── Inline confirms ────────────────────────────────────────────────────

function DeleteConfirm({
  crewName,
  busy,
  onCancel,
  onConfirm,
}: {
  crewName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed === crewName;
  return (
    <div className="space-y-2 rounded-lg border border-danger/30 bg-danger/[0.04] p-3">
      <div className="flex items-center gap-2 text-danger">
        <AlertTriangle className="size-4" />
        <span className="text-sm font-medium">Supprimer le crew ?</span>
      </div>
      <p className="text-[11px] leading-relaxed text-fg-muted">
        Tape le nom exact du crew pour confirmer :{" "}
        <code className="rounded bg-bg-base/60 px-1 py-0.5 font-mono text-danger">
          {crewName}
        </code>
      </p>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={crewName}
        autoFocus
        className="w-full rounded-md bg-bg-base/40 px-2 py-1.5 text-xs text-fg-primary ring-1 ring-danger/30 focus:outline-none focus:ring-1 focus:ring-danger"
      />
      <div className="flex gap-1.5">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-md bg-white/[0.04] px-2 py-1.5 text-[11px] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          onClick={onConfirm}
          disabled={busy || !matches}
          className="flex-1 rounded-md bg-danger px-2 py-1.5 text-[11px] font-medium text-white shadow-[0_0_14px_rgba(239,68,68,0.4)] hover:shadow-[0_0_22px_rgba(239,68,68,0.6)] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="mx-auto size-3 animate-spin" />
          ) : (
            "Supprimer"
          )}
        </button>
      </div>
    </div>
  );
}

function LeaveConfirm({
  crewName,
  busy,
  onCancel,
  onConfirm,
}: {
  crewName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3">
      <div className="flex items-center gap-2 text-amber-300">
        <LogOut className="size-4" />
        <span className="text-sm font-medium">Quitter "{crewName}" ?</span>
      </div>
      <p className="text-[11px] leading-relaxed text-fg-muted">
        Tu perds l'accès aux salons et aux messages. Tu pourras rejoindre à
        nouveau plus tard avec le code d'invitation.
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-md bg-white/[0.04] px-2 py-1.5 text-[11px] text-fg-muted ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-fg-primary disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex-1 rounded-md bg-amber-500 px-2 py-1.5 text-[11px] font-medium text-bg-base shadow-[0_0_14px_rgba(251,191,36,0.4)] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="mx-auto size-3 animate-spin" />
          ) : (
            "Quitter"
          )}
        </button>
      </div>
    </div>
  );
}

// Wrap the menu in AnimatePresence-friendly conditional render so the
// caller doesn't need to handle the mount/unmount transition.
export function CrewContextMenuWrapper({
  open,
  ...props
}: {
  open: boolean;
} & Omit<Parameters<typeof CrewContextMenu>[0], "key">) {
  return (
    <AnimatePresence>
      {open && <CrewContextMenu {...props} />}
    </AnimatePresence>
  );
}
