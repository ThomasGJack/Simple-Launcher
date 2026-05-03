#!/usr/bin/env node
// One-shot Firestore migration : purge the Prism-era fields from every
// Minecraft module document.
//
// Background: when the Prism backend was removed in v26.05.03.8, the
// TypeScript `MinecraftModule` type lost these fields:
//   - curseforgeProjectId
//   - curseforgeFileId
//   - customZipUrl
//   - customZipSize
//   - prismInstanceName
//   - nativeMc            (toggle, every module is native now)
//
// Existing Firestore documents created before that release still carry
// them. They're harmless on disk (TypeScript doesn't see them, the Rust
// side doesn't read them), but they bloat the doc, keep the schema
// confused, and would resurface if anyone ever resurrected reading code.
// This script wipes them.
//
// Auth: uses Application Default Credentials (`gcloud auth
// application-default login` from your terminal). No service account
// JSON checked in. The Firebase project is read from the
// `GOOGLE_CLOUD_PROJECT` env var or falls back to the `simplelaunche`
// project hardcoded below.
//
// Usage:
//   node scripts/cleanup-prism-fields.mjs              ← dry run, lists targets
//   node scripts/cleanup-prism-fields.mjs --apply      ← actually delete
//
// Idempotent: runs safely multiple times. Modules that have no Prism
// fields are skipped without writes.

import admin from "firebase-admin";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "simplelaunche";

const PRISM_FIELDS = [
  "curseforgeProjectId",
  "curseforgeFileId",
  "customZipUrl",
  "customZipSize",
  "prismInstanceName",
  "nativeMc",
];

const APPLY = process.argv.includes("--apply");

function fmt(value) {
  if (value === null || value === undefined) return "(unset)";
  if (typeof value === "string" && value.length > 60) {
    return `"${value.slice(0, 60)}…"`;
  }
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

async function main() {
  console.log(`\n— Firestore cleanup : Prism fields on Minecraft modules —`);
  console.log(`Project : ${PROJECT_ID}`);
  console.log(`Mode    : ${APPLY ? "APPLY (writes)" : "DRY RUN"}\n`);

  admin.initializeApp({
    projectId: PROJECT_ID,
  });
  const db = admin.firestore();

  const snap = await db.collection("modules").get();
  console.log(`Loaded ${snap.size} modules from /modules.`);

  let touched = 0;
  let untouched = 0;
  let nonMinecraft = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.type !== "minecraft") {
      nonMinecraft++;
      continue;
    }

    const present = PRISM_FIELDS.filter((f) => f in data);
    if (present.length === 0) {
      untouched++;
      continue;
    }

    touched++;
    console.log(`\n• ${doc.id} (${data.name ?? "(no name)"})`);
    for (const field of present) {
      console.log(`    - ${field} = ${fmt(data[field])}  → REMOVE`);
    }

    if (APPLY) {
      const updates = {};
      for (const field of present) {
        updates[field] = admin.firestore.FieldValue.delete();
      }
      await doc.ref.update(updates);
      console.log(`    ✓ updated`);
    }
  }

  console.log(`\n— Summary —`);
  console.log(`  Non-Minecraft modules (skipped) : ${nonMinecraft}`);
  console.log(`  Already clean                   : ${untouched}`);
  console.log(`  Cleaned ${APPLY ? "in this run" : "if --apply"}      : ${touched}`);

  if (!APPLY && touched > 0) {
    console.log(
      `\nThis was a dry run. Re-run with --apply to actually delete the fields.`,
    );
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
