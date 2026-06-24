import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { openSync, writeSync, closeSync, readFileSync, unlinkSync } from "node:fs";

/**
 * Hosts the push-to-talk hotkey watcher inside the MCP server process so it runs
 * for the lifetime of the Claude Code session (no separate window / Startup
 * entry). Opt-in via CLVOICE_HOTKEY. Windows only.
 *
 * Multiple Claude Code windows each start a server; a lockfile ensures only one
 * runs the watcher (no double-recording). A takeover poll lets a surviving
 * session pick up the watcher when the lock owner exits or crashes, so the
 * hotkey keeps working as long as at least one session is open.
 */

const LOCK_FILE = join(tmpdir(), "clvoice-hotkey.lock");
const POLL_MS = 5000;

let watcherChild: ChildProcess | null = null;
let pollTimer: NodeJS.Timeout | null = null;

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === "EPERM"; // exists but not signalable
  }
}

function readLockPid(): number | null {
  try {
    const pid = Number.parseInt(readFileSync(LOCK_FILE, "utf8").trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function writeLock(): boolean {
  try {
    const fd = openSync(LOCK_FILE, "wx"); // exclusive create — only one winner
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}

/** Acquire the single-instance lock, taking over a stale (dead-PID) lock. */
function acquireLock(): boolean {
  if (writeLock()) return true;
  const pid = readLockPid();
  if (pid !== null && pid !== process.pid && isPidAlive(pid)) return false; // live owner
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
  return writeLock();
}

function releaseLock(): void {
  if (readLockPid() === process.pid) {
    try {
      unlinkSync(LOCK_FILE);
    } catch {
      // ignore
    }
  }
}

function spawnWatcher(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const script = join(here, "..", "scripts", "clvoice-hotkey.ps1");

  // stdout MUST be ignored — this process's stdout carries the MCP protocol.
  const child = spawn(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { stdio: ["ignore", "ignore", "inherit"], windowsHide: true },
  );
  watcherChild = child;
  console.error(`[clvoice] hotkey watcher started (pid ${child.pid ?? "?"}).`);

  child.on("exit", (code) => {
    console.error(`[clvoice] hotkey watcher exited (code ${code ?? "?"}).`);
    if (watcherChild === child) watcherChild = null;
    releaseLock(); // let another session (or our next poll) take over
  });
}

/** Become the watcher owner if the slot is free; yield if we lost the lock. */
function reconcile(): void {
  if (watcherChild) {
    // Self-heal: if a race handed the lock to someone else, drop our watcher.
    if (readLockPid() !== process.pid) {
      try {
        watcherChild.kill();
      } catch {
        // ignore
      }
      watcherChild = null;
    }
    return;
  }
  if (acquireLock()) spawnWatcher();
}

function cleanup(): void {
  if (pollTimer) clearInterval(pollTimer);
  try {
    if (watcherChild && watcherChild.exitCode === null) watcherChild.kill();
  } catch {
    // ignore
  }
  releaseLock();
}

/** Start hosting the hotkey watcher with takeover polling. No-op if unsupported. */
export function startHotkeyWatcher(): void {
  if (process.platform !== "win32") {
    console.error("[clvoice] hotkey watcher: Windows only — skipped.");
    return;
  }

  reconcile(); // immediate attempt
  pollTimer = setInterval(reconcile, POLL_MS);
  pollTimer.unref?.(); // don't keep the process alive just for the poll

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}
