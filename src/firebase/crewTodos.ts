// Liste de tâches collaborative par crew. Sub-collection
// `/crews/{crewId}/todos/{todoId}`. Members peuvent créer / claimer /
// completer ; owner / admin peut tout faire.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebase } from "./config";

export type TodoStatus = "todo" | "in-progress" | "done";
export type TodoPriority = "low" | "normal" | "high";

export type CrewTodo = {
  id: string;
  title: string;
  body: string;
  authorUid: string;
  authorName: string | null;
  assignedUids: string[];
  status: TodoStatus;
  priority: TodoPriority;
  position: number;
  createdAt: number;
  completedAt: number | null;
  completedByUid: string | null;
};

export function watchCrewTodos(
  crewId: string,
  callback: (todos: CrewTodo[]) => void,
): Unsubscribe {
  const fb = getFirebase();
  if (!fb) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(fb.db, "crews", crewId, "todos"),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CrewTodo[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: typeof data.title === "string" ? data.title : "",
          body: typeof data.body === "string" ? data.body : "",
          authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
          authorName: typeof data.authorName === "string" ? data.authorName : null,
          assignedUids: Array.isArray(data.assignedUids)
            ? (data.assignedUids as unknown[]).filter((u): u is string => typeof u === "string")
            : [],
          status: validStatus(data.status),
          priority: validPriority(data.priority),
          position: typeof data.position === "number" ? data.position : 0,
          createdAt: tsToMs(data.createdAt) ?? 0,
          completedAt: tsToMs(data.completedAt),
          completedByUid:
            typeof data.completedByUid === "string" ? data.completedByUid : null,
        };
      });
      callback(list);
    },
    (err) => {
      console.warn("[crewTodos] watch failed:", err);
      callback([]);
    },
  );
}

export async function createTodo(
  crewId: string,
  title: string,
  body: string,
  authorUid: string,
  authorName: string | null,
  priority: TodoPriority = "normal",
): Promise<string> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = await addDoc(collection(fb.db, "crews", crewId, "todos"), {
    title,
    body,
    authorUid,
    authorName,
    assignedUids: [],
    status: "todo" as TodoStatus,
    priority,
    position: Date.now(),
    createdAt: serverTimestamp(),
    completedAt: null,
    completedByUid: null,
  });
  return ref.id;
}

export async function updateTodoStatus(
  crewId: string,
  todoId: string,
  status: TodoStatus,
  byUid: string,
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const ref = doc(fb.db, "crews", crewId, "todos", todoId);
  if (status === "done") {
    await updateDoc(ref, {
      status,
      completedAt: serverTimestamp(),
      completedByUid: byUid,
    });
  } else {
    await updateDoc(ref, {
      status,
      completedAt: null,
      completedByUid: null,
    });
  }
}

export async function toggleAssignee(
  crewId: string,
  todoId: string,
  uid: string,
  current: string[],
): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  const next = current.includes(uid)
    ? current.filter((u) => u !== uid)
    : [...current, uid];
  await updateDoc(doc(fb.db, "crews", crewId, "todos", todoId), {
    assignedUids: next,
  });
}

export async function deleteTodo(crewId: string, todoId: string): Promise<void> {
  const fb = getFirebase();
  if (!fb) throw new Error("Firebase not configured");
  await deleteDoc(doc(fb.db, "crews", crewId, "todos", todoId));
}

function validStatus(value: unknown): TodoStatus {
  if (value === "in-progress" || value === "done") return value;
  return "todo";
}
function validPriority(value: unknown): TodoPriority {
  if (value === "low" || value === "high") return value;
  return "normal";
}
function tsToMs(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}
