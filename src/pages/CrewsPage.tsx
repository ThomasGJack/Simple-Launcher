import { useEffect, useMemo, useState } from "react";
import {
  Castle,
  Compass,
  Crown,
  Hash,
  KeyRound,
  Lock,
  LogOut,
  Plus,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { useUsers } from "@/store/firebaseStores";
import {
  leaveCrew,
  watchCrews,
  watchCrewChannels,
  watchCrewCustomRoles,
  watchCrewMembers,
  watchMyCrewIds,
  type Crew,
  type CrewChannel,
  type CrewMember,
  type CustomRole,
} from "@/firebase/crews";
import { ChannelView } from "@/components/crews/ChannelView";
import { MembersList } from "@/components/crews/MembersList";
import { CrewContextMenuWrapper } from "@/components/crews/CrewContextMenu";
import { hasAnyTier } from "@/lib/supporterTier";
import { isAdmin } from "@/lib/admin";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import { CreateCrewModal } from "@/components/crews/CreateCrewModal";
import { JoinByCodeModal } from "@/components/crews/JoinByCodeModal";
import { BrowseCrewsModal } from "@/components/crews/BrowseCrewsModal";
import {
  loadCachedCrews,
  saveCachedCrews,
  loadCachedMyCrewIds,
  saveCachedMyCrewIds,
} from "@/lib/offlineCache";

/**
 * Discord-like clan/crew page. Three-column layout:
 *   • left rail: list of crews the user is a member of (master crews
 *     show automatically since `ensureMasterMemberships` runs at boot)
 *   • middle rail: channels of the selected crew
 *   • main: messages of the selected channel + composer
 *
 * Below the crew rail, three buttons:
 *   – Découvrir : opens the public-crew directory
 *   – Code     : opens the join-by-code dialog
 *   – Créer    : opens the create-crew form (gated on supporter tier)
 */
export function CrewsPage() {
  const me = useAuthStore((s) => s.user);
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);
  const allUsers = useUsers();

  // The current user's profile from the presence collection — used to
  // gate the "Créer un crew" button on a paid supporter tier (granted
  // manually by the admin until subscriptions are wired up).
  const myProfile = useMemo(
    () => allUsers.find((u) => u.uid === me?.uid) ?? null,
    [allUsers, me?.uid],
  );
  const canCreateCrew =
    isAdmin(me) || hasAnyTier(myProfile?.tier ?? null);

  // Hot-seed depuis le cache localStorage pour éviter le flash
  // "Aucun clan / Rejoindre / Créer" pendant que Firestore se resync.
  // Le cache est rafraîchi à chaque snapshot reçu, donc au prochain
  // boot on a la dernière vue connue.
  const [allCrews, setAllCrews] = useState<Crew[]>(() => loadCachedCrews());
  const [crewsPrimed, setCrewsPrimed] = useState<boolean>(
    () => loadCachedCrews().length > 0,
  );
  const [myCrewIds, setMyCrewIds] = useState<Set<string>>(() =>
    new Set(loadCachedMyCrewIds(me?.uid)),
  );
  const [myCrewIdsPrimed, setMyCrewIdsPrimed] = useState<boolean>(
    () => loadCachedMyCrewIds(me?.uid).length > 0,
  );
  const [channels, setChannels] = useState<CrewChannel[]>([]);
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  /** Right-click context menu state — when set, render
   *  CrewContextMenu anchored at `position` for `crew`. Closed by
   *  clicking outside / Escape / picking an action. The legacy
   *  CrewSettingsModal flow has been retired ; configuration now
   *  lives in the dedicated CrewConfigPage reachable via this
   *  context menu's "Configuration" item. */
  const [ctxMenu, setCtxMenu] = useState<{
    crew: Crew;
    position: { x: number; y: number };
  } | null>(null);

  useEffect(
    () =>
      watchCrews((crews) => {
        setAllCrews(crews);
        setCrewsPrimed(true);
        // Persiste pour le prochain boot — évite le flash placeholder.
        saveCachedCrews(crews);
      }),
    [],
  );

  useEffect(() => {
    if (!me) {
      setMyCrewIds(new Set());
      setMyCrewIdsPrimed(true);
      return;
    }
    return watchMyCrewIds(me.uid, (ids) => {
      setMyCrewIds(new Set(ids));
      setMyCrewIdsPrimed(true);
      saveCachedMyCrewIds(me.uid, ids);
    });
  }, [me]);

  // Master crews are always visible (everyone is implicitly a member).
  // User crews are only visible if the user is a member.
  const visibleCrews = useMemo(
    () =>
      allCrews.filter(
        (c) => c.isMaster || myCrewIds.has(c.id) || c.ownerUid === me?.uid,
      ),
    [allCrews, myCrewIds, me?.uid],
  );

  const selectedCrewId = route.name === "crews" ? route.crewId : undefined;
  const selectedChannelId = route.name === "crews" ? route.channelId : undefined;

  // Auto-pick the first crew when the user lands without a selection.
  useEffect(() => {
    if (route.name !== "crews") return;
    if (selectedCrewId || visibleCrews.length === 0) return;
    navigate({ name: "crews", crewId: visibleCrews[0].id });
  }, [visibleCrews, selectedCrewId, navigate, route.name]);

  useEffect(() => {
    if (!selectedCrewId) {
      setChannels([]);
      return;
    }
    return watchCrewChannels(selectedCrewId, setChannels);
  }, [selectedCrewId]);

  useEffect(() => {
    if (!selectedCrewId) {
      setMembers([]);
      return;
    }
    return watchCrewMembers(selectedCrewId, setMembers);
  }, [selectedCrewId]);

  // Watch custom roles for the current crew so MembersList can render
  // members in their role color + group them Discord-style. Empty
  // when no roles are defined (most crews) — the list falls back to
  // a single "Membres" group.
  useEffect(() => {
    if (!selectedCrewId) {
      setCustomRoles([]);
      return;
    }
    return watchCrewCustomRoles(selectedCrewId, setCustomRoles);
  }, [selectedCrewId]);

  const myMember = useMemo(
    () => (me ? members.find((m) => m.uid === me.uid) ?? null : null),
    [members, me],
  );

  // Auto-pick the first channel when none selected for the current crew.
  useEffect(() => {
    if (route.name !== "crews") return;
    if (!selectedCrewId) return;
    if (selectedChannelId || channels.length === 0) return;
    navigate({ name: "crews", crewId: selectedCrewId, channelId: channels[0].id });
  }, [channels, selectedCrewId, selectedChannelId, navigate, route.name]);

  const selectedCrew = useMemo(
    () => visibleCrews.find((c) => c.id === selectedCrewId) ?? null,
    [visibleCrews, selectedCrewId],
  );
  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  const handleLeaveCrew = async () => {
    if (!me || !selectedCrew) return;
    if (selectedCrew.isMaster) return;
    if (
      !confirm(
        `Quitter le crew "${selectedCrew.name}" ? Tu pourras le rejoindre à nouveau plus tard si tu as le code ou s'il est public.`,
      )
    )
      return;
    try {
      await leaveCrew(selectedCrew.id, me.uid);
      sounds.click();
      navigate({ name: "crews" });
    } catch (err) {
      console.warn("[crews] leave failed:", err);
      sounds.error();
    }
  };

  // Empty-state : on n'affiche le placeholder « Aucun clan / Rejoindre /
  // Créer » que si on est SÛRS qu'il n'y a pas de crew (les watchers
  // ont fini leur premier snapshot). Sans ça, Firestore peut prendre
  // ~500 ms à répondre au boot et on flash inutilement le placeholder
  // alors que l'user a en fait des crews. Le cache localStorage hot-
  // seed `crewsPrimed` à `true` immédiatement quand des crews y sont,
  // donc l'utilisateur récurrent ne voit plus jamais ce flash.
  const fullyPrimed = crewsPrimed && (!me || myCrewIdsPrimed);

  // Pas encore primed + pas de cache → skeleton minimal (ligne floue).
  // Évite à la fois le flash "Aucun clan" ET le flash de la layout
  // principale vide. Quand les watchers fire, on transitionne fluide.
  if (!fullyPrimed && visibleCrews.length === 0) {
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="flex flex-col items-center gap-3 opacity-50">
          <Castle className="size-10 animate-pulse text-fg-dim" strokeWidth={1.5} />
          <div className="text-xs uppercase tracking-[0.25em] text-fg-dim">
            Chargement des crews…
          </div>
        </div>
      </div>
    );
  }

  if (fullyPrimed && visibleCrews.length === 0) {
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="max-w-md rounded-3xl glass p-10 text-center">
          <Castle className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
          <h2 className="font-display text-2xl">Aucun clan pour l'instant</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Rejoins un crew public, utilise un code d'invitation, ou crée le tien.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setBrowseOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
            >
              <Compass className="size-4" /> Découvrir
            </button>
            <button
              onClick={() => setCodeOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 ring-1 ring-cyan-500/30 hover:bg-cyan-500/25"
            >
              <KeyRound className="size-4" /> Code
            </button>
            {canCreateCrew && (
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-300 ring-1 ring-amber-500/30 hover:bg-amber-500/25"
              >
                <Plus className="size-4" /> Créer
              </button>
            )}
          </div>
        </div>
        <BrowseCrewsModal
          open={browseOpen}
          onClose={() => setBrowseOpen(false)}
          myCrewIds={myCrewIds}
          onJoined={(id) => navigate({ name: "crews", crewId: id })}
        />
        <JoinByCodeModal
          open={codeOpen}
          onClose={() => setCodeOpen(false)}
          onJoined={(id) => navigate({ name: "crews", crewId: id })}
        />
        <CreateCrewModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => navigate({ name: "crews", crewId: id })}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Crews rail ────────────────────────────────────── */}
      <aside className="flex w-20 shrink-0 flex-col items-center justify-between gap-2 border-r border-white/[0.06] bg-bg-soft/40 py-4">
        <div className="flex flex-col items-center gap-2">
          {visibleCrews.map((c) => {
            const active = c.id === selectedCrewId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate({ name: "crews", crewId: c.id })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  sounds.click();
                  setCtxMenu({
                    crew: c,
                    position: { x: e.clientX + 8, y: e.clientY },
                  });
                }}
                title={`${c.name} — clic droit pour les options`}
                className={cn(
                  "no-drag relative grid size-12 place-items-center rounded-2xl text-xl transition-all",
                  active
                    ? "scale-105 ring-2"
                    : "ring-1 ring-white/[0.06] hover:ring-white/20",
                )}
                style={
                  {
                    background:
                      c.iconUrl
                        ? "transparent"
                        : active
                          ? `color-mix(in srgb, ${c.color} 22%, var(--color-bg-elevated))`
                          : "var(--color-bg-elevated)",
                    color: c.color,
                    boxShadow: active ? `0 0 18px ${c.color}66` : undefined,
                    ["--tw-ring-color" as string]: active ? c.color : undefined,
                  } as React.CSSProperties
                }
              >
                {c.iconUrl ? (
                  <img
                    src={c.iconUrl}
                    alt=""
                    className="size-full rounded-2xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  c.emblem || c.name.slice(0, 1)
                )}
                {c.isMaster && (
                  <span
                    title="Crew maître — tout le launcher"
                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-amber-400 text-[8px] font-bold text-bg-base ring-2 ring-bg-soft"
                  >
                    ★
                  </span>
                )}
                {active && (
                  <span
                    className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                    style={{ background: c.color }}
                  />
                )}
              </button>
            );
          })}
          <div className="my-1 h-px w-8 bg-white/[0.06]" />
          {/* Action buttons : browse, join by code, create */}
          <button
            type="button"
            onClick={() => setBrowseOpen(true)}
            title="Découvrir des crews publics"
            className="no-drag grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30 transition-all hover:bg-emerald-500/15"
          >
            <Compass className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setCodeOpen(true)}
            title="Rejoindre par code"
            className="no-drag grid size-12 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/30 transition-all hover:bg-cyan-500/15"
          >
            <KeyRound className="size-5" />
          </button>
          {canCreateCrew ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              title="Créer un crew"
              className="no-drag grid size-12 place-items-center rounded-2xl bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30 transition-all hover:bg-amber-500/15"
            >
              <Plus className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate({ name: "vip" })}
              title="Création de crew réservée aux supporters"
              className="no-drag grid size-12 place-items-center rounded-2xl bg-white/[0.03] text-fg-dim ring-1 ring-white/[0.06] transition-all hover:bg-white/[0.05]"
            >
              <Crown className="size-5" />
            </button>
          )}
        </div>
      </aside>

      {/* ─── Channels rail ─────────────────────────────────── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.06] bg-bg-soft/30">
        <div
          className="flex items-center gap-2 border-b border-white/[0.06] p-4"
          style={{
            background: selectedCrew
              ? `linear-gradient(180deg, ${selectedCrew.color}15, transparent)`
              : undefined,
          }}
        >
          {selectedCrew?.iconUrl ? (
            <img
              src={selectedCrew.iconUrl}
              alt=""
              className="size-8 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="text-2xl">{selectedCrew?.emblem ?? "🏰"}</span>
          )}
          <div className="min-w-0 flex-1">
            <div
              className="truncate font-display text-lg"
              style={{ color: selectedCrew?.color }}
            >
              {selectedCrew?.name ?? "—"}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-dim">
              {selectedCrew?.isMaster ? (
                <>★ Communauté</>
              ) : selectedCrew?.isPublic ? (
                <>🌐 Public</>
              ) : (
                <>
                  <Lock className="size-3" /> Privé
                </>
              )}
            </div>
          </div>
          {/* Settings gear retiré : accès via clic-droit sur
              l'icône du crew dans le rail gauche → menu custom →
              "Configuration". Garde l'UX cohérente avec le pattern
              annoncé. */}
          {selectedCrew && !selectedCrew.isMaster && (
            <button
              type="button"
              onClick={handleLeaveCrew}
              title="Quitter ce crew"
              className="grid size-8 place-items-center rounded-lg text-fg-dim transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <LogOut className="size-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {channels.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fg-dim">
              Pas encore de salon.{" "}
              {selectedCrew?.ownerUid === me?.uid
                ? "Va dans l'admin pour en créer."
                : "L'admin du crew doit en créer."}
            </div>
          ) : (
            channels.map((ch) => {
              const active = ch.id === selectedChannelId;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() =>
                    selectedCrewId &&
                    navigate({ name: "crews", crewId: selectedCrewId, channelId: ch.id })
                  }
                  title={ch.description || ch.name}
                  className={cn(
                    "no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                    active
                      ? "bg-white/[0.06] text-fg-primary"
                      : "text-fg-muted hover:bg-white/[0.03] hover:text-fg-primary",
                  )}
                >
                  <Hash className="size-3.5 shrink-0 text-fg-dim" />
                  <span className="truncate">{ch.name}</span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ─── Messages pane ─────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {selectedChannel && selectedCrew ? (
          <ChannelView
            crew={selectedCrew}
            channel={selectedChannel}
            myUid={me?.uid ?? ""}
            myName={me?.displayName ?? null}
            myAvatar={me?.photoURL ?? null}
            myMember={myMember}
          />
        ) : (
          <div className="grid flex-1 place-items-center text-fg-dim">
            <span className="text-sm">Sélectionne un salon</span>
          </div>
        )}
      </main>

      {/* ─── Member list (right) ───────────────────────────── */}
      {selectedCrew && (
        <MembersList
          crew={selectedCrew}
          members={members}
          customRoles={customRoles}
          myUid={me?.uid ?? ""}
          myRole={myMember?.role ?? null}
        />
      )}

      {/* Modals */}
      <BrowseCrewsModal
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        myCrewIds={myCrewIds}
        onJoined={(id) => navigate({ name: "crews", crewId: id })}
      />
      <JoinByCodeModal
        open={codeOpen}
        onClose={() => setCodeOpen(false)}
        onJoined={(id) => navigate({ name: "crews", crewId: id })}
      />
      <CreateCrewModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => navigate({ name: "crews", crewId: id })}
      />
      {/* Right-click context menu on a crew icon — anchored at the
          click coordinates. Closed via outside-click / Esc / action.
          Role is derived best-effort : if the right-clicked crew is
          the currently selected one, we reuse the live members list ;
          otherwise we fall back to "member" (still authed since
          myCrewIds contains it) and let the Configuration page do
          the precise lookup itself. The owner-vs-not distinction is
          the only one that matters for action visibility. */}
      {ctxMenu && me && (
        <CrewContextMenuWrapper
          open
          crew={ctxMenu.crew}
          myUid={me.uid}
          myRole={
            ctxMenu.crew.ownerUid === me.uid
              ? "owner"
              : ctxMenu.crew.id === selectedCrewId
                ? (members.find((m) => m.uid === me.uid)?.role ?? "member")
                : "member"
          }
          position={ctxMenu.position}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

