/**
 * Runs automatically before `npm run dev` (npm calls the `predev` script).
 *
 * Its whole job is to turn the two failures that actually happen into a
 * sentence someone can act on, rather than a stack trace forty lines deep:
 * a Node version Next.js will not run on, and a missing seed file.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

let fatal = false;

// --- Node version ----------------------------------------------------------
// Next.js 15 needs 18.18 or newer. On anything older the failure surfaces as
// a syntax error inside a dependency, which tells you nothing.
const MIN = [18, 18, 0];
const current = process.versions.node.split(".").map(Number);

const olderThanMin =
  current[0] < MIN[0] || (current[0] === MIN[0] && current[1] < MIN[1]);

if (olderThanMin) {
  fatal = true;
  console.error(
    `\n${RED}Node ${process.versions.node} is too old.${RESET} This needs Node 18.18 or newer — 20 LTS is a safe choice.\n` +
      `${DIM}  nvm install 20 && nvm use 20${RESET}\n` +
      `${DIM}  or download from https://nodejs.org${RESET}\n`,
  );
}

// --- Seed data -------------------------------------------------------------
const seed = join(process.cwd(), "seed", "pipeline.json");

if (!existsSync(seed)) {
  fatal = true;
  console.error(
    `\n${RED}Missing seed/pipeline.json.${RESET} Local mode reads it instead of a database.\n` +
      `${DIM}  node scripts/build-seed.mjs${RESET}\n`,
  );
}

// --- Which mode is this about to start in? ---------------------------------
if (!fatal) {
  const local = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (local) {
    console.log(
      `\n${YELLOW}Local mode${RESET} — no Supabase configured, so this reads seed/pipeline.json and sign-in is off.\n` +
        `${DIM}Leave this terminal running, then open the URL printed below. Closing it stops the server.${RESET}\n`,
    );
  } else {
    console.log(`\n${YELLOW}Connected mode${RESET} — using Supabase.\n`);
  }
}

process.exit(fatal ? 1 : 0);
