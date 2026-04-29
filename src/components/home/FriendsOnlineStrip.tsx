import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { watchAllUsers, statusFromLastSeen, type UserPresence } from "@/firebase/presence";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";

/**
 * Compact strip showing how many friends are online + a few avatars + the
 * single most recent activity. Hidden entirely when nobody is online so it
 * doesn't visually pollute the homepage during quiet hours.
 */
export function FriendsOnlineStrip() {
  const me = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const [users, setUsers] = useState<UserPresence[]>([]);

  useEffect(() => watchAllUsers(setUsers), []);

  const online = users
    .filter((u) => u.uid !== me?.uid && statusFromLastSeen(u.lastSeen) === "online")
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));

  if (online.length === 0) return null;

  const sample = online.slice(0, 4);
  const playing = online.find((u) => u.currentActivity);
  const summary = playing
    ? `${playing.displayName?.split(" ")[0] ?? "Quelqu'un"} joue à ${playing.currentActivity?.moduleName ?? "un jeu"}`
    : `${online.length} ${online.length > 1 ? "amis sont en ligne" : "ami est en ligne"}`;

  return (
    <motion.button
      type="button"
      onClick={() => navigate({ name: "community" })}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className="no-drag mb-4 flex w-full items-center gap-3 rounded-full glass px-4 py-2.5 text-left ring-1 ring-emerald-400/20 transition-shadow hover:ring-emerald-400/40 hover:shadow-[0_0_24px_rgba(74,222,128,0.25)]"
    >
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
      </span>
      <div className="flex shrink-0 -space-x-2">
        {sample.map((u) =>
          u.avatarUrl ? (
            <img
              key={u.uid}
              src={u.avatarUrl}
              alt=""
              className="size-7 rounded-full object-cover ring-2 ring-bg-base"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              key={u.uid}
              className="grid size-7 place-items-center rounded-full bg-bg-elevated text-[10px] uppercase ring-2 ring-bg-base"
            >
              {(u.displayName ?? "?").slice(0, 1)}
            </div>
          ),
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-fg-primary">
          <span className="font-semibold">{online.length}</span>
          {" "}
          <span className="text-fg-muted">en ligne</span>
        </div>
        <div className="truncate text-[11px] text-fg-dim">{summary}</div>
      </div>
      <Users className="size-4 shrink-0 text-fg-muted transition-colors group-hover:text-emerald-300" />
    </motion.button>
  );
}
