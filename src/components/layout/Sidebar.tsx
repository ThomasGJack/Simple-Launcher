import { motion } from "framer-motion";
import { Home, Library, Settings, LogIn, Shield } from "lucide-react";
import { useUIStore, type Route } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { isAdmin } from "@/lib/admin";
import { cn } from "@/lib/cn";

type NavItem = {
  icon: typeof Home;
  label: string;
  route: Route;
};

const NAV_ITEMS: NavItem[] = [
  { icon: Home, label: "Accueil", route: { name: "home" } },
  { icon: Library, label: "Bibliothèque", route: { name: "library" } },
];

export function Sidebar() {
  const { route, navigate } = useUIStore();
  const user = useAuthStore((s) => s.user);

  const isActive = (target: Route) => target.name === route.name;

  return (
    <aside className="no-drag flex w-20 shrink-0 flex-col items-center justify-between border-r border-white/[0.04] bg-bg-soft/60 py-5 backdrop-blur-md">
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => navigate({ name: "home" })}
          className="group relative grid size-12 place-items-center overflow-hidden rounded-xl transition-transform hover:scale-105"
        >
          <img src="/logo.png" alt="Simple Launcher" className="size-12 object-cover" />
          <div className="absolute inset-0 rounded-xl ring-1 ring-accent/30 group-hover:ring-accent/60 group-hover:shadow-[0_0_24px_var(--color-accent-glow)]" />
        </button>

        <div className="my-2 h-px w-8 bg-white/[0.06]" />

        <nav className="flex flex-col items-center gap-2">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.label}
              icon={item.icon}
              label={item.label}
              active={isActive(item.route)}
              onClick={() => navigate(item.route)}
            />
          ))}
        </nav>
      </div>

      <div className="flex flex-col items-center gap-2">
        {isAdmin(user) && (
          <NavButton
            icon={Shield}
            label="Admin"
            active={isActive({ name: "admin" })}
            onClick={() => navigate({ name: "admin" })}
          />
        )}
        <NavButton
          icon={Settings}
          label="Paramètres"
          active={isActive({ name: "settings" })}
          onClick={() => navigate({ name: "settings" })}
        />

        {user ? (
          <AvatarButton
            photoURL={user.photoURL}
            displayName={user.displayName ?? "Profil"}
            active={isActive({ name: "profile" })}
            onClick={() => navigate({ name: "profile" })}
          />
        ) : (
          <NavButton
            icon={LogIn}
            label="Connexion"
            active={isActive({ name: "login" })}
            onClick={() => navigate({ name: "login" })}
          />
        )}
      </div>
    </aside>
  );
}

function NavButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative grid size-12 place-items-center rounded-xl transition-colors",
        active ? "text-accent" : "text-fg-muted hover:text-fg-primary",
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl bg-accent/10 ring-1 ring-accent/40 shadow-[0_0_24px_var(--color-accent-soft)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <Icon className="relative z-10 size-5" strokeWidth={2} />
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-fg-primary opacity-0 shadow-lg ring-1 ring-white/[0.06] transition-opacity group-hover:opacity-100 z-50">
        {label}
      </span>
    </button>
  );
}

function AvatarButton({
  photoURL,
  displayName,
  active,
  onClick,
}: {
  photoURL: string | null;
  displayName: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="group relative grid size-12 place-items-center rounded-xl">
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-xl ring-2 ring-accent shadow-[0_0_24px_var(--color-accent-glow)]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      {photoURL ? (
        <img
          src={photoURL}
          alt={displayName}
          className={cn(
            "relative z-10 size-9 rounded-lg object-cover transition-all",
            active ? "ring-1 ring-bg-base" : "ring-1 ring-white/10 group-hover:ring-accent/50",
          )}
        />
      ) : (
        <div
          className={cn(
            "relative z-10 grid size-9 place-items-center rounded-lg bg-accent/15 font-display text-sm text-accent",
            active ? "ring-1 ring-bg-base" : "ring-1 ring-white/10 group-hover:ring-accent/50",
          )}
        >
          {displayName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-bg-elevated px-2.5 py-1 text-xs text-fg-primary opacity-0 shadow-lg ring-1 ring-white/[0.06] transition-opacity group-hover:opacity-100 z-50">
        {displayName}
      </span>
    </button>
  );
}
