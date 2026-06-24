import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";

const PS_BIN = "powershell";
const PS_FLAGS = ["-NoProfile", "-NonInteractive", "-Command"];

/** Run a PowerShell -Command, rejecting on non-zero exit. */
function runPowerShell(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(PS_BIN, [...PS_FLAGS, command], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`PowerShell exited ${code}: ${stderr.trim().slice(-300)}`));
    });
  });
}

/**
 * Copy text to the Windows clipboard.
 *
 * Routed through a UTF-8 temp file + `Set-Clipboard` so Vietnamese diacritics
 * survive (passing Unicode via argv/stdin encoding is unreliable on Windows).
 */
export async function copyToClipboard(text: string): Promise<void> {
  const tmpFile = join(tmpdir(), `clvoice-clip-${randomUUID()}.txt`);
  // Write without BOM; PowerShell's -Encoding UTF8 decodes it correctly.
  await writeFile(tmpFile, text, { encoding: "utf8" });
  try {
    const escaped = tmpFile.replace(/'/g, "''");
    await runPowerShell(
      `Set-Clipboard -Value (Get-Content -LiteralPath '${escaped}' -Raw -Encoding UTF8)`,
    );
  } finally {
    try {
      await unlink(tmpFile);
    } catch {
      // ignore
    }
  }
}

/**
 * Paste the current clipboard into the focused window by simulating Ctrl+V.
 * Pasting (not typing) keeps Unicode intact. Requires the target window to be
 * foreground; callers should treat failure as non-fatal (clipboard still set).
 */
export async function pasteToActiveWindow(): Promise<void> {
  await runPowerShell(
    "Add-Type -AssemblyName System.Windows.Forms; " +
      "Start-Sleep -Milliseconds 120; " +
      "[System.Windows.Forms.SendKeys]::SendWait('^v')",
  );
}
