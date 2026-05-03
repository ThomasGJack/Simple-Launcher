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
const SessionsPage = lazy(() =>
  import("@/pages/SessionsPage").then((m) => ({ default: m.SessionsPage })),
);
const CrewsPage = lazy(() =>
  import("@/pages/CrewsPage").then((m) => ({ default: m.CrewsPage })),
);
const VipPage = lazy(() =>
  import("@/pages/VipPage").then((m) => ({ default: m.VipPage })),
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
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
  return route.name;
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
    case "admin":
      return <AdminPage />;
    case "admin-builder":
      return <AdminPageBuilder />;
    case "community":
      return <CommunityPage />;
    case "sessions":
      return <SessionsPage />;
    case "crews":
      return <CrewsPage />;
    case "vip":
      return <VipPage />;
    case "messages":
      return <MessagesPage />;
    case "user-profile":
      return <PublicProfilePage />;
    case "login":
      return <LoginPage />;
    default:
      return <HomePage />;
  }
}
