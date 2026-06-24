#!/usr/bin/env node
'use strict';

/**
 * Claude Code statusline wrapper for clvoice.
 *
 * Runs the user's existing statusline (~/.claude/statusline.cjs) unchanged, then
 * appends a clvoice line when the push-to-talk watcher is recording/transcribing
 * (state read from %TEMP%/clvoice-state.txt). Idle -> nothing extra is shown.
 *
 * Configure in ~/.claude/settings.json:
 *   "statusLine": { "type": "command",
 *     "command": "node \"C:\\w\\clvoice-mcp\\scripts\\clvoice-statusline.cjs\"",
 *     "padding": 0, "refreshInterval": 1 }
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Read the JSON Claude Code pipes in on stdin (fd 0).
let input = '';
try {
  input = fs.readFileSync(0, 'utf8');
} catch {
  input = '';
}

// Run the original statusline with the same stdin, capture its output.
let base = '';
try {
  const basePath = path.join(os.homedir(), '.claude', 'statusline.cjs');
  if (fs.existsSync(basePath)) {
    const r = spawnSync(process.execPath, [basePath], { input, encoding: 'utf8' });
    base = (r.stdout || '').replace(/\r?\n$/, '');
  }
} catch {
  base = '';
}

// Read clvoice push-to-talk state.
let state = '';
try {
  state = fs.readFileSync(path.join(os.tmpdir(), 'clvoice-state.txt'), 'utf8').trim();
} catch {
  state = '';
}

let clvLine = '';
if (state === 'REC') {
  clvLine = '🔴 clvoice: recording — release to send';
} else if (state === 'STT') {
  clvLine = '⏳ clvoice: transcribing...';
} else if (state === 'CLEAN') {
  clvLine = '✨ clvoice: processing...';
}

const out = clvLine ? (base ? base + '\n' + clvLine : clvLine) : base;
process.stdout.write(out + '\n');
