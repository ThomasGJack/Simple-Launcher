import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { listen } from "@tauri-apps/api/event";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { getFirebase } from "@/firebase/config";
import { recordPlaytime } from "@/firebase/playtime";
import type { ModuleExitEvent } from "@/lib/modules";

function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);
  const route = useUIStore((s) => s.route);
  const navigate = useUIStore((s) => s.navigate);

  useEffect(() => {
    const fb = getFirebase();
    if (!fb) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(fb.auth, (u) => setUser(u));
    return () => unsubscribe();
  }, [setUser, setLoading]);

  useEffect(() => {
    if (loading) return;
    if (!user && route.name !== "login") {
      navigate({ name: "login" });
    } else if (user && route.name === "login") {
      navigate({ name: "home" });
    }
  }, [loading, user, route, navigate]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const promise = listen<ModuleExitEvent>("module-exited", (event) => {
      const { moduleId, durationMs } = event.payload;
      if (durationMs <= 0) return;
      recordPlaytime(uid, moduleId, durationMs).catch((err) =>
        console.warn("[playtime] write failed:", err),
      );
    });
    return () => {
      promise.then((u) => u()).catch(() => {});
    };
  }, [user]);

  if (loading) {
    return (
      <div className="grid h-screen place-items-center bg-bg-base">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
          <span className="text-xs uppercase tracking-[0.25em] text-fg-muted">Chargement</span>
        </div>
      </div>
    );
  }

  return <AppShell />;
}

export default App;
