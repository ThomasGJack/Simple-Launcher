import { useEffect, useMemo, useState } from "react";
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
  Search,
  Calendar,
  Flag,
  AlertTriangle,
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
  updateTodoPriority,
  updateTodoDueDate,
  deleteTodo,
  type CrewTodo,
  type TodoStatus,
  type TodoPriority,
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
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"order" | "recent" | "alpha">("order");

  useEffect(() => {
    return watchWikiPages(crewId, (p) => {
      setPages(p);
      if (!selectedId && p.length > 0) setSelectedId(p[0].id);
    });
  }, [crewId, selectedId]);

  // Filtre + sort des pages selon la search query + le sort mode.
  // - "order" : ordre de position (par défaut, comme avant)
  // - "recent" : par updatedAt desc
  // - "alpha" : par titre alphabétique
  const visiblePages = useMemo(() => {
    let arr = pages;
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = pages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.body.toLowerCase().includes(q),
      );
    }
    const sorted = [...arr];
    if (sortMode === "recent") {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sortMode === "alpha") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [pages, search, sortMode]);

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
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      {/* Liste des pages avec search + sort */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-fg-dim">
          <span>Pages ({visiblePages.length}/{pages.length})</span>
          <button
            onClick={handleCreate}
            className="rounded-md bg-white/[0.04] p-1 text-fg-muted hover:bg-white/[0.08] hover:text-accent"
            title="Nouvelle page"
          >
            <Plus className="size-3" />
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-fg-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chercher…"
            className="w-full rounded-md bg-bg-base/60 py-1 pl-7 pr-2 text-[11px] text-fg-primary outline-none ring-1 ring-white/[0.08] focus:ring-accent/40"
          />
        </div>

        {/* Sort buttons */}
        <div className="flex gap-0.5 rounded-md bg-bg-base/40 p-0.5 text-[9px] uppercase tracking-wider">
          {(["order", "recent", "alpha"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              className={cn(
                "flex-1 rounded px-1 py-0.5 transition",
                sortMode === m
                  ? "bg-accent/15 text-accent"
                  : "text-fg-dim hover:bg-white/[0.04] hover:text-fg-muted",
              )}
            >
              {m === "order" ? "Ordre" : m === "recent" ? "Récent" : "A→Z"}
            </button>
          ))}
        </div>

        {pages.length === 0 ? (
          <p className="text-xs text-fg-dim">
            Pas de pages. Crée la première !
          </p>
        ) : visiblePages.length === 0 ? (
          <p className="text-xs text-fg-dim">
            Aucun résultat pour « {search} ».
          </p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {visiblePages.map((p) => (
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
            ))}
          </div>
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
  const [draftPriority, setDraftPriority] = useState<TodoPriority>("normal");
  const [draftDueDate, setDraftDueDate] = useState<string>(""); // ISO date string yyyy-mm-dd
  const [filter, setFilter] = useState<"all" | TodoStatus>("all");
  const [sortBy, setSortBy] = useState<"date" | "priority">("date");

  useEffect(() => {
    return watchCrewTodos(crewId, setTodos);
  }, [crewId]);

  const visibleTodos = useMemo(() => {
    let arr = filter === "all" ? todos : todos.filter((t) => t.status === filter);
    arr = [...arr];
    if (sortBy === "priority") {
      const rank: Record<TodoPriority, number> = { high: 0, normal: 1, low: 2 };
      arr.sort((a, b) => rank[a.priority] - rank[b.priority]);
    }
    // sortBy === "date" garde l'ordre de createdAt desc déjà fourni par
    // le watcher Firestore — pas de re-sort.
    return arr;
  }, [todos, filter, sortBy]);

  const counts = useMemo(() => {
    return {
      all: todos.length,
      todo: todos.filter((t) => t.status === "todo").length,
      "in-progress": todos.filter((t) => t.status === "in-progress").length,
      done: todos.filter((t) => t.status === "done").length,
    };
  }, [todos]);

  const handleAdd = async () => {
    if (!me) return;
    const text = draft.trim();
    if (!text) return;
    const dueDateMs = draftDueDate
      ? new Date(draftDueDate).getTime() || null
      : null;
    await createTodo(crewId, text, "", me.uid, me.displayName ?? null, {
      priority: draftPriority,
      dueDate: dueDateMs,
    });
    setDraft("");
    setDraftPriority("normal");
    setDraftDueDate("");
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

  const cyclePriority = async (todo: CrewTodo) => {
    const next: TodoPriority =
      todo.priority === "low" ? "normal" : todo.priority === "normal" ? "high" : "low";
    await updateTodoPriority(crewId, todo.id, next);
    sounds.click();
  };

  const setDueDate = async (todo: CrewTodo, dateStr: string) => {
    const ms = dateStr ? new Date(dateStr).getTime() || null : null;
    await updateTodoDueDate(crewId, todo.id, ms);
    sounds.click();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Composer enrichi : titre + priorité + due date */}
      <div className="rounded-xl bg-bg-base/40 p-3 ring-1 ring-white/[0.06]">
        <div className="flex items-center gap-2">
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
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <div className="inline-flex gap-0.5 rounded-md bg-bg-base/60 p-0.5 ring-1 ring-white/[0.04]">
            {(["low", "normal", "high"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setDraftPriority(p)}
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 transition",
                  draftPriority === p
                    ? priorityClass(p, "active")
                    : "text-fg-dim hover:bg-white/[0.04]",
                )}
              >
                <Flag className="size-2.5" />
                {p === "low" ? "Basse" : p === "normal" ? "Normale" : "Haute"}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1 rounded-md bg-bg-base/60 px-2 py-0.5 ring-1 ring-white/[0.04]">
            <Calendar className="size-2.5 text-fg-dim" />
            <input
              type="date"
              value={draftDueDate}
              onChange={(e) => setDraftDueDate(e.target.value)}
              className="bg-transparent text-[11px] text-fg-muted outline-none [color-scheme:dark]"
            />
            {draftDueDate && (
              <button
                onClick={() => setDraftDueDate("")}
                className="text-fg-dim hover:text-danger"
                title="Effacer la date"
              >
                <X className="size-2.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filtres + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-0.5 rounded-md bg-bg-base/40 p-0.5 text-[10px] uppercase tracking-wider">
          <FilterChip
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="Tout"
            count={counts.all}
          />
          <FilterChip
            active={filter === "todo"}
            onClick={() => setFilter("todo")}
            label="À faire"
            count={counts.todo}
          />
          <FilterChip
            active={filter === "in-progress"}
            onClick={() => setFilter("in-progress")}
            label="En cours"
            count={counts["in-progress"]}
          />
          <FilterChip
            active={filter === "done"}
            onClick={() => setFilter("done")}
            label="Terminé"
            count={counts.done}
          />
        </div>
        <div className="flex gap-0.5 rounded-md bg-bg-base/40 p-0.5 text-[10px] uppercase tracking-wider">
          <FilterChip
            active={sortBy === "date"}
            onClick={() => setSortBy("date")}
            label="Récent"
          />
          <FilterChip
            active={sortBy === "priority"}
            onClick={() => setSortBy("priority")}
            label="Priorité"
          />
        </div>
      </div>

      {visibleTodos.length === 0 ? (
        <div className="grid h-32 place-items-center text-sm text-fg-muted">
          {todos.length === 0
            ? "Pas de tâches. Lance la dynamique !"
            : `Aucune tâche ${filter === "all" ? "" : `dans « ${filter} »`}.`}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence>
            {visibleTodos.map((todo) => (
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cyclePriority(todo)}
                      title={`Priorité : ${todo.priority} (cliquer pour cycler)`}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-bold uppercase ring-1 transition hover:opacity-80",
                        priorityClass(todo.priority, "badge"),
                      )}
                    >
                      <Flag className="size-2" />
                      {todo.priority === "low"
                        ? "Bas"
                        : todo.priority === "normal"
                          ? "Norm"
                          : "Haut"}
                    </button>
                    <div
                      className={cn(
                        "min-w-0 truncate text-sm text-fg-primary",
                        todo.status === "done" && "line-through",
                      )}
                    >
                      {todo.title}
                    </div>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-fg-dim">
                    <span>par {todo.authorName ?? "Anonyme"}</span>
                    {todo.dueDate && (
                      <>
                        <span>·</span>
                        <DueDateBadge dueDate={todo.dueDate} done={todo.status === "done"} />
                      </>
                    )}
                    {todo.completedByUid && todo.status === "done" && (
                      <>
                        <span>·</span>
                        <span>fini</span>
                      </>
                    )}
                    <input
                      type="date"
                      value={
                        todo.dueDate
                          ? new Date(todo.dueDate).toISOString().slice(0, 10)
                          : ""
                      }
                      onChange={(e) => setDueDate(todo, e.target.value)}
                      className="ml-auto bg-transparent text-[10px] text-fg-dim outline-none opacity-0 transition group-hover:opacity-100 [color-scheme:dark]"
                      title="Définir une date d'échéance"
                    />
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

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 transition",
        active
          ? "bg-accent/15 text-accent"
          : "text-fg-dim hover:bg-white/[0.04] hover:text-fg-muted",
      )}
    >
      {label}
      {count !== undefined && (
        <span className="rounded-full bg-bg-base/40 px-1 text-[8px] font-mono">
          {count}
        </span>
      )}
    </button>
  );
}

function priorityClass(p: TodoPriority, kind: "active" | "badge"): string {
  if (kind === "badge") {
    return p === "high"
      ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
      : p === "low"
        ? "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30"
        : "bg-amber-500/15 text-amber-300 ring-amber-500/30";
  }
  return p === "high"
    ? "bg-rose-500/20 text-rose-300"
    : p === "low"
      ? "bg-cyan-500/20 text-cyan-300"
      : "bg-amber-500/20 text-amber-300";
}

function DueDateBadge({ dueDate, done }: { dueDate: number; done: boolean }) {
  const date = new Date(dueDate);
  const now = Date.now();
  const overdue = !done && dueDate < now;
  const soon = !done && !overdue && dueDate - now < 86_400_000 * 2; // < 2j
  const formatted = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] ring-1",
        overdue
          ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
          : soon
            ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
            : "bg-white/[0.04] text-fg-muted ring-white/[0.06]",
      )}
    >
      {overdue && <AlertTriangle className="size-2" />}
      {!overdue && <Calendar className="size-2" />}
      {formatted}
    </span>
  );
}

// Inutilisé mais l'import CircleSlash empêche un warning de tsc dans
// certaines configs strict — gardé en cas d'usage futur (status
// "cancelled" potentiel).
void CircleSlash;
