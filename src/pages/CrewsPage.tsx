import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Castle, Hash, Send } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import {
  watchCrews,
  watchCrewChannels,
  watchChannelMessages,
  sendChannelMessage,
  type Crew,
  type CrewChannel,
  type CrewMessage,
} from "@/firebase/crews";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";

/**
 * Discord-like clan/crew page. Three-column layout:
 *   • left rail: list of crews (icons / names)
 *   • middle rail: channels of the selected crew
 *   • main: messages of the selected channel + composer
 *
 * Crews and channels are configured by the admin in the Admin panel.
 * Messages are sent by any authed user.
 */
export function CrewsPage() {
  const me = useAuthStore((s) => s.user);
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);

  const [crews, setCrews] = useState<Crew[]>([]);
  const [channels, setChannels] = useState<CrewChannel[]>([]);

  useEffect(() => watchCrews(setCrews), []);

  const selectedCrewId = route.name === "crews" ? route.crewId : undefined;
  const selectedChannelId = route.name === "crews" ? route.channelId : undefined;

  // Auto-pick the first crew when the user lands without a selection.
  useEffect(() => {
    if (selectedCrewId || crews.length === 0) return;
    navigate({ name: "crews", crewId: crews[0].id });
  }, [crews, selectedCrewId, navigate]);

  useEffect(() => {
    if (!selectedCrewId) {
      setChannels([]);
      return;
    }
    return watchCrewChannels(selectedCrewId, setChannels);
  }, [selectedCrewId]);

  // Auto-pick the first channel when none selected for the current crew.
  useEffect(() => {
    if (!selectedCrewId) return;
    if (selectedChannelId || channels.length === 0) return;
    navigate({ name: "crews", crewId: selectedCrewId, channelId: channels[0].id });
  }, [channels, selectedCrewId, selectedChannelId, navigate]);

  const selectedCrew = useMemo(
    () => crews.find((c) => c.id === selectedCrewId) ?? null,
    [crews, selectedCrewId],
  );
  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) ?? null,
    [channels, selectedChannelId],
  );

  if (crews.length === 0) {
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="max-w-md rounded-3xl glass p-10 text-center">
          <Castle className="mx-auto mb-3 size-10 text-fg-dim" strokeWidth={1.5} />
          <h2 className="font-display text-2xl">Aucun clan pour l'instant</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Demande à l'admin d'en créer un depuis le panel d'administration. Une fois en ligne,
            les salons textuels apparaîtront ici.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ─── Crews rail ────────────────────────────────────── */}
      <aside className="flex w-20 shrink-0 flex-col items-center gap-2 border-r border-white/[0.06] bg-bg-soft/40 py-4">
        {crews.map((c) => {
          const active = c.id === selectedCrewId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate({ name: "crews", crewId: c.id })}
              title={c.name}
              className={cn(
                "no-drag relative grid size-12 place-items-center rounded-2xl text-xl transition-all",
                active
                  ? "scale-105 ring-2"
                  : "ring-1 ring-white/[0.06] hover:ring-white/20",
              )}
              style={{
                background: active
                  ? `color-mix(in srgb, ${c.color} 22%, var(--color-bg-elevated))`
                  : "var(--color-bg-elevated)",
                color: c.color,
                boxShadow: active ? `0 0 18px ${c.color}66` : undefined,
                ["--tw-ring-color" as string]: active ? c.color : undefined,
              } as React.CSSProperties}
            >
              {c.emblem || c.name.slice(0, 1)}
              {active && (
                <span
                  className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                  style={{ background: c.color }}
                />
              )}
            </button>
          );
        })}
      </aside>

      {/* ─── Channels rail ─────────────────────────────────── */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.06] bg-bg-soft/30">
        <div
          className="flex items-center gap-2 border-b border-white/[0.06] p-4"
          style={{ background: selectedCrew ? `linear-gradient(180deg, ${selectedCrew.color}15, transparent)` : undefined }}
        >
          <span className="text-2xl">{selectedCrew?.emblem ?? "🏰"}</span>
          <div className="min-w-0">
            <div className="truncate font-display text-lg" style={{ color: selectedCrew?.color }}>
              {selectedCrew?.name ?? "—"}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {channels.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fg-dim">
              Pas encore de salon. L'admin doit en créer.
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
        {selectedChannel && selectedCrewId ? (
          <ChannelView
            crewId={selectedCrewId}
            channel={selectedChannel}
            myUid={me?.uid ?? ""}
            myName={me?.displayName ?? null}
            myAvatar={me?.photoURL ?? null}
          />
        ) : (
          <div className="grid flex-1 place-items-center text-fg-dim">
            <span className="text-sm">Sélectionne un salon</span>
          </div>
        )}
      </main>
    </div>
  );
}

function ChannelView({
  crewId,
  channel,
  myUid,
  myName,
  myAvatar,
}: {
  crewId: string;
  channel: CrewChannel;
  myUid: string;
  myName: string | null;
  myAvatar: string | null;
}) {
  const [messages, setMessages] = useState<CrewMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => watchChannelMessages(crewId, channel.id, setMessages), [crewId, channel.id]);

  // Auto-scroll to bottom when messages arrive (only if user was near bottom).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !myUid || sending) return;
    setSending(true);
    setText("");
    try {
      await sendChannelMessage(crewId, channel.id, trimmed, myUid, myName, myAvatar);
      sounds.click();
    } catch (err) {
      console.warn("[crews] send failed:", err);
      setText(trimmed); // restore on failure
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header className="flex items-center gap-2 border-b border-white/[0.06] bg-bg-soft/30 px-5 py-3">
        <Hash className="size-4 text-fg-dim" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{channel.name}</div>
          {channel.description && (
            <div className="truncate text-xs text-fg-muted">{channel.description}</div>
          )}
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-5 py-4">
        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <div className="grid h-full place-items-center text-fg-dim">
              <div className="text-center">
                <Hash className="mx-auto mb-2 size-8 text-fg-dim" strokeWidth={1.5} />
                <div className="text-sm">Premier message dans #{channel.name} ?</div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m, i) => {
                const prev = i > 0 ? messages[i - 1] : null;
                const grouped =
                  prev && prev.senderUid === m.senderUid && m.sentAt - prev.sentAt < 5 * 60_000;
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex gap-3"
                  >
                    {grouped ? (
                      <div className="w-9 shrink-0" />
                    ) : m.senderAvatar ? (
                      <img
                        src={m.senderAvatar}
                        alt=""
                        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-bg-elevated text-xs uppercase text-fg-muted ring-1 ring-white/10">
                        {(m.senderName ?? "?").slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {!grouped && (
                        <div className="flex items-baseline gap-2">
                          <span className="font-medium text-fg-primary">
                            {m.senderName ?? "Anonyme"}
                          </span>
                          <span className="text-[10px] text-fg-dim">
                            {formatStamp(m.sentAt)}
                          </span>
                        </div>
                      )}
                      <div className="break-words text-sm leading-relaxed text-fg-muted">
                        {m.text}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-white/[0.06] bg-bg-soft/30 p-4">
        <div className="flex items-end gap-2 rounded-2xl bg-bg-base/40 p-2 ring-1 ring-white/[0.06] focus-within:ring-accent/40">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={`Écrire dans #${channel.name}…`}
            rows={1}
            className="no-drag flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-fg-primary placeholder:text-fg-dim focus:outline-none"
            style={{ maxHeight: 200 }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="no-drag grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-bg-base shadow-[0_0_14px_var(--color-accent-soft)] disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}

function formatStamp(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Aujourd'hui ${time}`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) + " " + time;
}
