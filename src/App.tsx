import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/auth";
import { useUIStore } from "@/store/ui";
import { getFirebase } from "@/firebase/config";

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
    const unsubscribe = onAuthStateChanged(fb.auth, (user) => setUser(user));
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
