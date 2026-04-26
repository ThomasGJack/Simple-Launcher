import { AnimatePresence, motion } from "framer-motion";
import { TitleBar } from "@/components/window/TitleBar";
import { Sidebar } from "@/components/layout/Sidebar";
import { AnimatedBackground } from "@/components/layout/AnimatedBackground";
import { useUIStore } from "@/store/ui";
import { HomePage } from "@/pages/HomePage";
import { LibraryPage } from "@/pages/LibraryPage";
import { LoginPage } from "@/pages/LoginPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { UpdateBanner } from "@/components/updater/UpdateBanner";

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
              key={route.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-full"
            >
              {renderRoute(route.name)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <UpdateBanner />
    </div>
  );
}

function renderRoute(name: string) {
  switch (name) {
    case "home":
      return <HomePage />;
    case "library":
      return <LibraryPage />;
    case "module":
      return <LibraryPage />;
    case "settings":
      return <SettingsPage />;
    case "profile":
      return <ProfilePage />;
    case "login":
      return <LoginPage />;
    default:
      return <HomePage />;
  }
}
