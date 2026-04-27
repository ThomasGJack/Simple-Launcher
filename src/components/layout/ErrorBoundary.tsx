import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { logger } from "@/lib/logger";

type Props = {
  children: ReactNode;
  /** Optional name surfaced in the error log + UI for context. */
  scope?: string;
};

type State = {
  error: Error | null;
};

/**
 * React error boundary — catches any JS error thrown during rendering of
 * its children and renders a friendly fallback instead of unmounting the
 * whole app to a white screen. Auto-ships the error to the logger so the
 * admin sees it in the hidden Logs panel.
 *
 * Wrap this around the route renderer in AppShell so a crash on one page
 * (say, a malformed module manifest in LibraryPage) doesn't kill the
 * sidebar / titlebar / updater banner around it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Ship to Firestore via the logger. We use `bug` because this is an
    // uncaught render-time crash — high severity, deserves admin attention.
    logger.bug(`React render crash: ${error.message}`, {
      source: this.props.scope ?? "ErrorBoundary",
      metadata: {
        stack: error.stack,
        componentStack: info.componentStack,
      },
    });
  }

  handleReset = () => {
    // Clear the error state — the user may want to retry the same route
    // (e.g. transient network failure on first render). If the bug is
    // deterministic the boundary will catch it again immediately.
    this.setState({ error: null });
  };

  handleHome = () => {
    this.setState({ error: null });
    // Lightweight: route through the URL hash so we don't need to import
    // useUIStore inside a class component.
    if (typeof window !== "undefined") {
      window.location.hash = "#home";
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-12">
        <div className="max-w-md rounded-3xl glass-strong p-8 text-center ring-1 ring-rose-500/20">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30">
            <AlertTriangle className="size-7" strokeWidth={2} />
          </div>
          <h2 className="font-display text-2xl text-fg-primary">Oups, ça a planté</h2>
          <p className="mt-2 text-sm text-fg-muted">
            Cette page a rencontré une erreur inattendue. Le bug a été automatiquement remonté à l'admin.
          </p>
          <div className="mt-4 max-h-32 overflow-auto rounded-xl bg-bg-base/60 p-3 text-left font-mono text-[10px] text-fg-dim ring-1 ring-white/[0.04]">
            {this.state.error.message}
          </div>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="no-drag inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-bg-base shadow-[0_0_20px_var(--color-accent-soft)] hover:shadow-[0_0_28px_var(--color-accent-glow)] transition-shadow"
            >
              <RefreshCw className="size-4" /> Réessayer
            </button>
            <button
              onClick={this.handleHome}
              className="no-drag inline-flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-4 py-2 text-sm text-fg-primary ring-1 ring-white/[0.06] hover:bg-white/[0.08] transition-colors"
            >
              <Home className="size-4" /> Accueil
            </button>
          </div>
        </div>
      </div>
    );
  }
}
