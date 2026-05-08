// Helpers pour la visibilité des modules — gère le canal pre-release
// (modules en `prereleaseChannel: "beta"`) et le tracking de la
// version locale du modpack pour détecter les mises à jour.

import { isAdminUid } from "./admin";
import type { LauncherModule, MinecraftModule } from "@/types/module";

export type ModuleVisibilityContext = {
  /** UID du user courant. */
  uid: string | null;
  /** True si l'option "Activer le canal beta" est cochée dans Settings. */
  betaEnabled: boolean;
};

/**
 * Détermine si un module doit être visible pour le user courant.
 * Les modules `prereleaseChannel: "beta"` ne sont visibles que :
 *   - aux admins du launcher (toujours)
 *   - aux users avec `enableBetaChannel` ET dans la whitelist
 *     `prereleaseTesterUids` du module
 *
 * Les modules sans `prereleaseChannel` (ou `"stable"`) sont visibles
 * à tous (default).
 */
export function isModuleVisible(
  module: LauncherModule,
  ctx: ModuleVisibilityContext,
): boolean {
  if (module.prereleaseChannel !== "beta") return true;
  if (ctx.uid && isAdminUid(ctx.uid)) return true;
  if (!ctx.betaEnabled) return false;
  if (!ctx.uid) return false;
  return (module.prereleaseTesterUids ?? []).includes(ctx.uid);
}

/** Filtre une liste de modules selon le contexte de visibilité. */
export function filterVisibleModules(
  modules: LauncherModule[],
  ctx: ModuleVisibilityContext,
): LauncherModule[] {
  return modules.filter((m) => isModuleVisible(m, ctx));
}

// ─── Auto-update modpack tracking ────────────────────────────────────
//
// Pour les modules Minecraft avec `modpackVersion` set côté Firestore,
// on track la version locale (= dernière installée par le user) en
// localStorage. Comparaison remote vs local = détection de mise à jour.

const LS_PREFIX = "module.modpackVersion.";

export function getLocalModpackVersion(moduleId: string): string | null {
  try {
    return localStorage.getItem(LS_PREFIX + moduleId);
  } catch {
    return null;
  }
}

export function setLocalModpackVersion(moduleId: string, version: string): void {
  try {
    localStorage.setItem(LS_PREFIX + moduleId, version);
  } catch {
    /* ignore */
  }
}

export function clearLocalModpackVersion(moduleId: string): void {
  try {
    localStorage.removeItem(LS_PREFIX + moduleId);
  } catch {
    /* ignore */
  }
}

/**
 * Renvoie true si une nouvelle version du modpack est dispo : le
 * doc Firestore a `modpackVersion` set et il diffère de la version
 * locale persistée.
 */
export function hasModpackUpdate(module: MinecraftModule): boolean {
  const remote = module.modpackVersion;
  if (!remote) return false;
  const local = getLocalModpackVersion(module.id);
  // Si pas de version locale persistée mais le module est déjà
  // installé (le user l'a installé avant qu'on track la version),
  // on considère qu'il est à jour. Le tracking commencera à la
  // prochaine install / update.
  if (!local) return false;
  return local !== remote;
}
