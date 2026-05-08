import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  CheckSquare,
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Square,
  CircleDot,
  CircleCheck,
  CircleSlash,
} from "lucide-react";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { useAuthStore } from "@/store/auth";
import { sounds } from "@/lib/sounds";
import { cn } from "@/lib/cn";
import {
  watchWikiPages,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  type WikiPage,
} from "@/firebase/crewWiki";
import {
  watchCrewTodos,
  createTodo,
  updateTodoStatus,
  deleteTodo,
  type CrewTodo,
  type TodoStatus,
} from "@/firebase/crewTodos";

/**
 * Modal "outils" du crew — 2 onglets : Wiki (pages markdown
 * collaboratives) et Tâches (TODO list partagée). Mounted via un
 * bouton dans CrewSettingsModal (ou un menu contextuel).
 */
export function CrewToolsModal({
  crewId,
  crewName,
  onClose,
}: {
  crewId: string;
  crewName: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"wiki" | "todos">("wiki");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="no-drag fixed inset-0 z-[60] grid place-items-center bg-bg-base/75 p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-bg-soft ring-1 ring-white/[0.08]"
      >
        <header className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-fg-dim">
              Outils du crew
            </div>
            <h2 className="font-display text-xl text-fg-primary">{crewName}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-fg-muted hover:bg-white/[0.05] hover:text-fg-primary"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex border-b border-white/[0.06] px-6">
          <TabButton
            active={tab === "wiki"}
            onClick={() => setTab("wiki")}
            icon={BookOpen}
            label="Wiki"
          />
          <TabButton
            active={tab === "todos"}
            onClick={() => setTab("todos")}
            icon={CheckSquare}
            label="Tâches"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "wiki" ? (
            <WikiTab crewId={crewId} />
          ) : (
            <TodosTab crewId={crewId} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-3 text-sm font-medium transition border-b-2",
        active
          ? "text-fg-primary border-accent"
          : "text-fg-muted border-transparent hover:text-fg-primary",
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

// ─── Wiki tab ─────────────────────────────────────────────────────────

function WikiTab({ crewId }: { crewId: string }) {
  const me = useAuthStore((s) => s.user);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });

  useEffect(() => {
    return watchWikiPages(crewId, (p) => {
      setPages(p);
      if (!selectedId && p.length > 0) setSelectedId(p[0].id);
    });
  }, [crewId, selectedId]);

  const selected = pages.find((p) => p.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!me) return;
    const id = await createWikiPage(
      crewId,
      "Nouvelle page",
      "",
      me.uid,
      me.displayName ?? null,
      pages.length,
    );
    setSelectedId(id);
    setEditing(true);
    setDraft({ title: "Nouvelle page", body: "" });
    sounds.click();
  };

  const handleStartEdit = () => {
    if (!selected) return;
    setDraft({ title: selected.title, body: selected.body });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selected || !me) return;
    await updateWikiPage(
      crewId,
      selected.id,
      { title: draft.title.trim() || "Sans titre", body: draft.body },
      me.uid,
      me.displayName ?? null,
    );
    setEditing(false);
    sounds.success();
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Supprimer la page « ${selected.title} » ?`)) return;
    await deleteWikiPage(crewId, selected.id);
    setSelectedId(null);
    sounds.click();
  };

  return (
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      {/* Liste des pages */}
      <div className="flex flex-col gap-1">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          <span>Pages ({pages.length})</span>
          <button
            onClick={handleCreate}
            className="rounded-md bg-white/[0.04] p-1 text-fg-muted hover:bg-white/[0.08] hover:text-accent"
            title="Nouvelle page"
          >
            <Plus className="size-3" />
          </button>
        </div>
        {pages.length === 0 ? (
          <p className="text-xs text-fg-dim">
            Pas de pages. Crée la première !
          </p>
        ) : (
          pages.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelectedId(p.id);
                setEditing(false);
              }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-left text-xs transition",
                selectedId === p.id
                  ? "bg-accent/15 text-fg-primary ring-1 ring-accent/30"
                  : "text-fg-muted hover:bg-white/[0.05]",
              )}
            >
              {p.title}
            </button>
          ))
        )}
      </div>

      {/* Page */}
      <div>
        {!selected ? (
          <div className="grid h-40 place-items-center text-sm text-fg-muted">
            Sélectionne ou crée une page.
          </div>
        ) : editing ? (
          <div className="flex flex-col gap-3">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="Titre"
              className="rounded-lg bg-bg-base/60 px-3 py-2 text-base font-semibold text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
            />
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={12}
              placeholder="Contenu en markdown — **gras**, *italique*, [lien](url), # titres..."
              className="rounded-lg bg-bg-base/60 px-3 py-2 font-mono text-xs text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveEdit}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-base"
              >
                <Check className="mr-1 inline size-3" /> Enregistrer
              </button>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs text-fg-muted hover:bg-white/[0.1]"
              >
                Annuler
              </button>
              <span className="ml-auto text-[10px] text-fg-dim">
                Markdown supporté
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-xl text-fg-primary">
                {selected.title}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleStartEdit}
                  className="rounded-md bg-white/[0.04] p-1.5 text-fg-muted hover:bg-white/[0.08] hover:text-accent"
                  title="Modifier"
                >
                  <Edit2 className="size-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-md bg-white/[0.04] p-1.5 text-fg-muted hover:bg-white/[0.08] hover:text-danger"
                  title="Supprimer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="text-[10px] text-fg-dim">
              Édité par {selected.authorName ?? "Anonyme"}
            </div>
            {selected.body ? (
              <div
                className="prose prose-invert mt-2 max-w-none text-sm text-fg-muted [&_a]:text-accent [&_a]:underline [&_h1]:font-display [&_h1]:text-fg-primary [&_h2]:font-display [&_h2]:text-fg-primary [&_strong]:text-fg-primary"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(
                    marked.parse(selected.body, { async: false, gfm: true, breaks: true }) as string,
                  ),
                }}
              />
            ) : (
              <div className="mt-2 text-sm italic text-fg-dim">
                Pas encore de contenu — clique sur le crayon pour éditer.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Todos tab ────────────────────────────────────────────────────────

function TodosTab({ crewId }: { crewId: string }) {
  const me = useAuthStore((s) => s.user);
  const [todos, setTodos] = useState<CrewTodo[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    return watchCrewTodos(crewId, setTodos);
  }, [crewId]);

  const handleAdd = async () => {
    if (!me) return;
    const text = draft.trim();
    if (!text) return;
    await createTodo(crewId, text, "", me.uid, me.displayName ?? null);
    setDraft("");
    sounds.click();
  };

  const handleStatusCycle = async (todo: CrewTodo) => {
    if (!me) return;
    const next: TodoStatus =
      todo.status === "todo"
        ? "in-progress"
        : todo.status === "in-progress"
          ? "done"
          : "todo";
    await updateTodoStatus(crewId, todo.id, next, me.uid);
    if (next === "done") sounds.success();
    else sounds.click();
  };

  const handleDelete = async (todo: CrewTodo) => {
    if (!confirm(`Supprimer la tâche « ${todo.title} » ?`)) return;
    await deleteTodo(crewId, todo.id);
    sounds.click();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.06]">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) handleAdd();
          }}
          placeholder="Nouvelle tâche — ex: « construire la base nord »"
          className="flex-1 bg-transparent text-sm text-fg-primary outline-none placeholder:text-fg-dim"
        />
        <button
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg-base disabled:opacity-50"
        >
          <Plus className="size-3" /> Ajouter
        </button>
      </div>

      {todos.length === 0 ? (
        <div className="grid h-32 place-items-center text-sm text-fg-muted">
          Pas de tâches. Lance la dynamique !
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence>
            {todos.map((todo) => (
              <motion.div
                key={todo.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 30 }}
                className={cn(
                  "group flex items-center gap-3 rounded-xl bg-white/[0.025] p-3 ring-1 ring-white/[0.05]",
                  todo.status === "done" && "opacity-60",
                )}
              >
                <button
                  onClick={() => handleStatusCycle(todo)}
                  className="shrink-0 rounded-md p-1 text-fg-muted transition hover:bg-white/[0.05]"
                  title={
                    todo.status === "todo"
                      ? "Marquer en cours"
                      : todo.status === "in-progress"
                        ? "Marquer terminé"
                        : "Re-marquer à faire"
                  }
                >
                  {todo.status === "todo" && <Square className="size-5" />}
                  {todo.status === "in-progress" && (
                    <CircleDot className="size-5 text-amber-400" />
                  )}
                  {todo.status === "done" && (
                    <CircleCheck className="size-5 text-success" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-sm text-fg-primary",
                      todo.status === "done" && "line-through",
                    )}
                  >
                    {todo.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-fg-dim">
                    <span>par {todo.authorName ?? "Anonyme"}</span>
                    {todo.completedByUid && todo.status === "done" && (
                      <>
                        <span>·</span>
                        <span>fini par un membre</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(todo)}
                  className="rounded-md p-1 text-fg-dim opacity-0 transition hover:bg-white/[0.05] hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// Inutilisé mais l'import CircleSlash empêche un warning de tsc dans
// certaines configs strict — gardé en cas d'usage futur (status
// "cancelled" potentiel).
void CircleSlash;
