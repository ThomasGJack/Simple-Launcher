import { lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TitleBar } from "@/components/window/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { AnimatedBackground } from "@/components/layout/AnimatedBackground";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { useUIStore, type Route } from "@/store/ui";
// Home + Library + Login are eagerly imported because they're the first
// pages a user lands on — paying a Suspense fallback there would feel
// laggy. Everything else is code-split into its own chunk so the initial
// JS bundle stays lean (~300 KB gzipped instead of 1+ MB).
import { HomePage } from "@/pages/HomePage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LoginPage } from "@/pages/LoginPage";
import { UpdateBanner } from "@/components/updater/UpdateBanner";

const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const AchievementsPage = lazy(() =>
  import("@/pages/AchievementsPage").then((m) => ({ default: m.AchievementsPage })),
);
const AdminPage = lazy(() =>
  import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const AdminPageBuilder = lazy(() =>
  import("@/pages/AdminPageBuilder").then((m) => ({ default: m.AdminPageBuilder })),
);
const ModuleDetailPage = lazy(() =>
  import("@/pages/ModuleDetailPage").then((m) => ({ default: m.ModuleDetailPage })),
);
const CommunityPage = lazy(() =>
  import("@/pages/CommunityPage").then((m) => ({ default: m.CommunityPage })),
);
const MessagesPage = lazy(() =>
  import("@/pages/MessagesPage").then((m) => ({ default: m.MessagesPage })),
);
const PublicProfilePage = lazy(() =>
  import("@/pages/PublicProfilePage").then((m) => ({ default: m.PublicProfilePage })),
);
const CrewsPage = lazy(() =>
  import("@/pages/CrewsPage").then((m) => ({ default: m.CrewsPage })),
);
const CrewConfigPage = lazy(() =>
  import("@/pages/CrewConfigPage").then((m) => ({ default: m.CrewConfigPage })),
);
const VipPage = lazy(() =>
  import("@/pages/VipPage").then((m) => ({ default: m.VipPage })),
);
const NotificationsPage = lazy(() =>
  import("@/pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })),
);

export function AppShell() {
  const route = useUIStore((s) => s.route);

  return (
    <div className="flex h-screen flex-col bg-bg-base text-fg-primary">
      <TitleBar />

      <div className="relative flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="relative flex-1 overflow-hidden">
          <AnimatedBackground />

          <AnimatePresence mode="wait">
            <motion.div
              key={routeKey(route)}
              {...routeTransition(route.name)}
              className="relative h-full"
            >
              <ErrorBoundary scope={`route:${route.name}`}>
                <Suspense fallback={<PageSkeleton />}>{renderRoute(route.name)}</Suspense>
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <UpdateBanner />
    </div>
  );
}

function routeKey(route: Route): string {
  if (route.name === "module") return `module:${route.moduleId}`;
  if (route.name === "admin-builder") return `admin-builder:${route.moduleId}`;
  if (route.name === "crew-config") return `crew-config:${route.crewId}`;
  return route.name;
}

/**
 * Per-route Framer Motion transition variants. Most pages use a
 * gentle fade + small Y shift, but the "drill-down" routes (module
 * detail, crew-config, admin-builder, user-profile) get a slide-from-
 * right effect that visually communicates "you went deeper" — and
 * mirrors the back button taking you in the reverse direction.
 *
 * The drill-down routes are a fixed allowlist : we don't try to
 * detect navigation direction at runtime (would require a route
 * history stack), just hardcode which pages are "sub-pages".
 */
const DRILL_DOWN_ROUTES = new Set<string>([
  "module",
  "admin-builder",
  "crew-config",
  "user-profile",
  "achievements",
  "notifications",
]);

function routeTransition(name: string) {
  const isDrill = DRILL_DOWN_ROUTES.has(name);
  if (isDrill) {
    return {
      initial: { opacity: 0, x: 24 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -16 },
      transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
    } as const;
  }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
  } as const;
}

function renderRoute(name: string) {
  switch (name) {
    case "home":
      return <HomePage />;
    case "library":
      return <LibraryPage />;
    case "module":
      return <ModuleDetailPage />;
    case "settings":
      return <SettingsPage />;
    case "profile":
      return <ProfilePage />;
    case "achievements":
      return <AchievementsPage />;
    case "admin":
      return <AdminPage />;
    case "admin-builder":
      return <AdminPageBuilder />;
    case "community":
      return <CommunityPage />;
    case "crews":
      return <CrewsPage />;
    case "crew-config":
      return <CrewConfigPage />;
    case "vip":
      return <VipPage />;
    case "messages":
      return <MessagesPage />;
    case "user-profile":
      return <PublicProfilePage />;
    case "notifications":
      return <NotificationsPage />;
    case "login":
      return <LoginPage />;
    default:
      return <HomePage />;
  }
}
