/**
 * `npm run doctor` — prints everything needed to work out why the dev server
 * will not come up, in one block you can paste to someone.
 *
 * Nothing here changes anything. It only looks.
 */

import { execSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";
const DIM = "\u001b[2m";
const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";

const ok = (m) => console.log(`  ${GREEN}✓${RESET} ${m}`);
const bad = (m) => console.log(`  ${RED}✗${RESET} ${m}`);
const warn = (m) => console.log(`  ${YELLOW}!${RESET} ${m}`);

const quiet = (cmd) => {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
};

/** Can we bind the port? If not, something else already has it. */
const portFree = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });

console.log(`\n${BOLD}Sponsor Command — setup check${RESET}\n`);

// --- machine ---------------------------------------------------------------
console.log(`${BOLD}Machine${RESET}`);
console.log(`  ${DIM}os${RESET}       ${process.platform} ${process.arch}`);
console.log(`  ${DIM}node${RESET}     ${process.versions.node}`);
console.log(`  ${DIM}npm${RESET}      ${quiet("npm --version") ?? "not found"}`);

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 18 || (major === 18 && minor < 18)) {
  bad(`Node ${process.versions.node} is too old — Next.js 15 needs 18.18 or newer.`);
  console.log(`    ${DIM}nvm install 20 && nvm use 20${RESET}`);
} else {
  ok("Node version is fine.");
}

// --- repository ------------------------------------------------------------
console.log(`\n${BOLD}Repository${RESET}`);

const branch = quiet("git rev-parse --abbrev-ref HEAD");
const commit = quiet("git rev-parse --short HEAD");
console.log(`  ${DIM}folder${RESET}   ${process.cwd()}`);
console.log(`  ${DIM}branch${RESET}   ${branch ?? "not a git repository"}`);
console.log(`  ${DIM}commit${RESET}   ${commit ?? "—"}`);

if (!existsSync(join(process.cwd(), "package.json"))) {
  bad("No package.json here. You are in the wrong folder — cd into the Jarvis directory.");
} else {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
  if (pkg.name !== "zmm-sponsor-command") {
    bad(`This is "${pkg.name}", not the dashboard. Wrong folder, or wrong branch.`);
    console.log(`    ${DIM}git checkout claude/nifty-ride-et5emr${RESET}`);
  } else {
    ok("In the right project.");
  }
}

if (branch && branch !== "claude/nifty-ride-et5emr") {
  warn(`On branch "${branch}". The dashboard lives on claude/nifty-ride-et5emr.`);
  console.log(`    ${DIM}git checkout claude/nifty-ride-et5emr${RESET}`);
}

// --- dependencies ----------------------------------------------------------
console.log(`\n${BOLD}Dependencies${RESET}`);

if (!existsSync(join(process.cwd(), "node_modules"))) {
  bad("node_modules is missing. Run: npm install");
} else if (!existsSync(join(process.cwd(), "node_modules", "next"))) {
  bad("Next.js is not installed. Run: npm install");
} else {
  ok("Installed.");
}

// --- data ------------------------------------------------------------------
console.log(`\n${BOLD}Data${RESET}`);

const seed = join(process.cwd(), "seed", "pipeline.json");
if (existsSync(seed)) {
  try {
    const parsed = JSON.parse(readFileSync(seed, "utf8"));
    ok(`Seed present — ${parsed.brands?.length ?? 0} brands.`);
  } catch {
    bad("seed/pipeline.json is present but unreadable. Run: npm run seed");
  }
} else {
  bad("seed/pipeline.json is missing. Run: npm run seed");
}

const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const envLocal = existsSync(join(process.cwd(), ".env.local"));
console.log(
  `  ${DIM}mode${RESET}     ${hasSupabase ? "connected (Supabase)" : "local (seeded file, no sign-in)"}`,
);
if (!hasSupabase && envLocal) {
  warn(".env.local exists but Supabase is not configured in this shell — that is fine for local mode.");
}

// --- port ------------------------------------------------------------------
console.log(`\n${BOLD}Port${RESET}`);

const free3000 = await portFree(3000);
if (free3000) {
  ok("Port 3000 is free — the server will come up at http://localhost:3000");
} else {
  warn("Port 3000 is already in use by something else.");
  console.log(
    `    ${DIM}Next.js will pick the next free port and print it. Use the URL it prints.${RESET}`,
  );
  for (const port of [3001, 3002, 3003]) {
    if (await portFree(port)) {
      console.log(`    ${DIM}Likely: http://localhost:${port}${RESET}`);
      break;
    }
  }
}

console.log(
  `\n${BOLD}Next${RESET}\n  Run ${BOLD}npm run dev${RESET}, leave that terminal open, and use the URL it prints.\n`,
);
