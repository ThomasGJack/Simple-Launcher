import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/auth";
import { getFirebase } from "@/firebase/config";

function App() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    const fb = getFirebase();
    if (!fb) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(fb.auth, (user) => setUser(user));
    return () => unsubscribe();
  }, [setUser, setLoading]);

  return <AppShell />;
}

export default App;
