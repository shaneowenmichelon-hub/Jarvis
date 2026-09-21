/**
 * The local store.
 *
 * Backs `npm run dev` when no Supabase project is configured, so the dashboard
 * runs on a laptop with nothing to set up. State lives in a JSON file, seeded
 * from `seed/pipeline.json` on first boot, and edits persist across restarts —
 * moving a card and reloading behaves exactly as it will in production.
 *
 * Deliberately not clever: one file, read and rewritten whole. It holds a few
 * dozen brands, and being able to open the file in an editor and see what the
 * app thinks is worth more here than throughput.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { BrandRow, MessageRow, ScanRunRow, Stage, StageSource } from "./types";

export interface StageEventRow {
  id: number;
  brand_id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  source: StageSource;
  actor: string | null;
  note: string | null;
  created_at: string;
}

export interface InboxRow {
  id: string;
  email: string;
  connected_by: string | null;
  connected_at: string;
  last_scan_at: string | null;
  active: boolean;
}

export interface PatternRow {
  pattern: string;
  reason: string | null;
  added_by?: string | null;
}

export interface LocalDatabase {
  scanned_at: string;
  brands: BrandRow[];
  messages: MessageRow[];
  stage_events: StageEventRow[];
  scan_runs: ScanRunRow[];
  gmail_accounts: InboxRow[];
  ignored_senders: PatternRow[];
  blocked_entities: PatternRow[];
}

const DB_PATH = join(process.cwd(), ".local-data", "db.json");
const SEED_PATH = join(process.cwd(), "seed", "pipeline.json");

let cache: LocalDatabase | null = null;

/** Serialises writes so two requests cannot clobber each other's changes. */
let queue: Promise<unknown> = Promise.resolve();

export async function readDatabase(): Promise<LocalDatabase> {
  // Deleting .local-data is the documented way to start over, and people do it
  // with the server still running. Without this check the in-memory copy would
  // survive, the reset would appear to do nothing, and the next edit would
  // write the old state straight back out.
  if (cache && !existsSync(DB_PATH)) cache = null;

  if (cache) return cache;

  if (existsSync(DB_PATH)) {
    cache = JSON.parse(await readFile(DB_PATH, "utf8")) as LocalDatabase;
    return cache;
  }

  if (!existsSync(SEED_PATH)) {
    throw new Error(
      `No local data and no seed at ${SEED_PATH}. Run: node scripts/build-seed.mjs`,
    );
  }

  const seed = JSON.parse(await readFile(SEED_PATH, "utf8")) as LocalDatabase;
  cache = seed;
  await persist(seed);
  return seed;
}

async function persist(db: LocalDatabase): Promise<void> {
  await mkdir(dirname(DB_PATH), { recursive: true });
  await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`);
}

/** Read-modify-write, one caller at a time. */
export async function mutate<T>(fn: (db: LocalDatabase) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await readDatabase();
    const result = await fn(db);
    cache = db;
    await persist(db);
    return result;
  });

  // Keep the chain alive even if this caller's work threw.
  queue = run.catch(() => undefined);
  return run;
}

/** Throw away local edits and start again from the seed. */
export async function resetDatabase(): Promise<void> {
  cache = null;
  const seed = JSON.parse(await readFile(SEED_PATH, "utf8")) as LocalDatabase;
  cache = seed;
  await persist(seed);
}
