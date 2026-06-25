<#
.SYNOPSIS
  One-shot setup for clvoice-mcp on Windows.

.DESCRIPTION
  Installs deps, builds, detects the microphone, asks for a Groq API key, and
  registers the MCP server (user scope). Hotkey + transcript cleanup are ON by
  default in the server, so no extra env is needed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup.ps1
#>
param(
  [string]$GroqKey,
  [string]$MicDevice,
  [string]$Lang           = "vi",                      # spoken language: vi (default), en, or auto
  [string]$Stt            = "groq",                    # STT engine: groq or gemini
  [string]$GroqModel      = "whisper-large-v3-turbo",  # set whisper-large-v3 for higher accuracy
  [string]$CleanModel     = "llama-3.3-70b-versatile", # Groq chat model for transcript cleanup
  [string]$Hotkey         = "true",                    # host push-to-talk watcher in the server
  [string]$Clean          = "true",                    # clean filler words via Groq LLM
  [string]$AutoPaste      = "true",                    # auto-paste (Ctrl+V) into focused window
  [int]   $DefaultSeconds = 15,                        # default record duration (MCP tool path)
  [int]   $MaxSeconds     = 60,                        # hard cap on record duration
  [switch]$NoStatusLine
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Write-Host "=== clvoice-mcp setup ===`n"

function Have($c) { return $null -ne (Get-Command $c -ErrorAction SilentlyContinue) }

# 1. Prerequisites
if (-not (Have node))   { Write-Error "Node.js not found. Install Node >= 18 first."; exit 1 }
if (-not (Have npm))    { Write-Error "npm not found."; exit 1 }
if (-not (Have ffmpeg)) { Write-Warning "ffmpeg not found on PATH - recording will fail until you install it (https://ffmpeg.org)." }
if (-not (Have claude)) { Write-Warning "claude CLI not found - install Claude Code, then re-run, or register manually." }

# 2. Install + build
Write-Host "[1/4] Installing dependencies + building..."
Push-Location $root
try {
  & npm install --silent
  & npm run build
} finally {
  Pop-Location
}
$dist = Join-Path $root "dist\index.js"
if (-not (Test-Path $dist)) { Write-Error "Build failed: $dist not found."; exit 1 }
Write-Host "      build OK -> $dist"

# 3. Microphone
if (-not $MicDevice) {
  Write-Host "`n[2/4] Detecting microphones..."
  $out = (& ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1 | Out-String)
  $mics = @(); $inAudio = $false
  foreach ($line in ($out -split "`n")) {
    if ($line -match "DirectShow audio devices") { $inAudio = $true;  continue }
    if ($line -match "DirectShow video devices") { $inAudio = $false; continue }
    if ($line -match "Alternative name") { continue }
    if ($line -match '"([^"]+)"') {
      $name = $Matches[1]
      if ($line -match "\(audio\)") { $mics += $name }
      elseif ($inAudio -and ($line -notmatch "\(video\)")) { $mics += $name }
    }
  }
  $mics = @($mics | Select-Object -Unique)
  if ($mics.Count -eq 0) {
    Write-Warning "No microphone detected."
    $MicDevice = Read-Host "      Enter mic device name manually"
  } elseif ($mics.Count -eq 1) {
    $MicDevice = $mics[0]; Write-Host "      Using: $MicDevice"
  } else {
    for ($i = 0; $i -lt $mics.Count; $i++) { Write-Host ("      [{0}] {1}" -f $i, $mics[$i]) }
    $sel = Read-Host "      Pick mic number"
    $MicDevice = $mics[[int]$sel]
  }
}

# 4. Groq key
if (-not $GroqKey) {
  Write-Host "`n[3/4] Groq API key (free: https://console.groq.com/keys)"
  $GroqKey = Read-Host "      Paste Groq API key"
}
if (-not $GroqKey) { Write-Error "Groq API key required."; exit 1 }

# 5. Register MCP (all settings written explicitly so they're easy to see/tweak)
Write-Host "`n[4/4] Registering MCP server (user scope)..."
if (Have claude) {
  & claude mcp remove clvoice --scope user 2>$null | Out-Null
  & claude mcp add clvoice --scope user `
      --env "GROQ_API_KEY=$GroqKey" `
      --env "CLVOICE_MIC_DEVICE=$MicDevice" `
      --env "CLVOICE_STT=$Stt" `
      --env "CLVOICE_LANG=$Lang" `
      --env "CLVOICE_GROQ_MODEL=$GroqModel" `
      --env "CLVOICE_HOTKEY=$Hotkey" `
      --env "CLVOICE_CLEAN=$Clean" `
      --env "CLVOICE_CLEAN_MODEL=$CleanModel" `
      --env "CLVOICE_AUTO_PASTE=$AutoPaste" `
      --env "CLVOICE_DEFAULT_SECONDS=$DefaultSeconds" `
      --env "CLVOICE_MAX_SECONDS=$MaxSeconds" `
      -- node $dist
  Write-Host "`nRegistered. Verify: claude mcp list"
} else {
  Write-Warning "claude CLI missing - add this to ~/.claude.json mcpServers manually:"
  Write-Host @"
  "clvoice": {
    "type": "stdio",
    "command": "node",
    "args": ["$($dist -replace '\\','\\\\')"],
    "env": {
      "GROQ_API_KEY": "$GroqKey",
      "CLVOICE_MIC_DEVICE": "$MicDevice",
      "CLVOICE_STT": "$Stt",
      "CLVOICE_LANG": "$Lang",
      "CLVOICE_GROQ_MODEL": "$GroqModel",
      "CLVOICE_HOTKEY": "$Hotkey",
      "CLVOICE_CLEAN": "$Clean",
      "CLVOICE_CLEAN_MODEL": "$CleanModel",
      "CLVOICE_AUTO_PASTE": "$AutoPaste",
      "CLVOICE_DEFAULT_SECONDS": "$DefaultSeconds",
      "CLVOICE_MAX_SECONDS": "$MaxSeconds"
    }
  }
"@
}

# Status line: auto-merge into ~/.claude/settings.json (preserves other keys; backup made)
$wrapper = Join-Path $root "scripts\clvoice-statusline.cjs"
if (-not $NoStatusLine) {
  $settingsPath = Join-Path $env:USERPROFILE ".claude\settings.json"
  try {
    if (Test-Path $settingsPath) {
      Copy-Item $settingsPath "$settingsPath.bak" -Force
      $cfg = Get-Content $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    } else {
      New-Item -ItemType Directory -Force (Split-Path $settingsPath) | Out-Null
      $cfg = [pscustomobject]@{}
    }
    $slObj = [pscustomobject]@{ type = "command"; command = ("node `"$wrapper`""); padding = 0; refreshInterval = 1 }
    if ($cfg.PSObject.Properties.Name -contains "statusLine") { $cfg.statusLine = $slObj }
    else { $cfg | Add-Member -NotePropertyName statusLine -NotePropertyValue $slObj }
    [IO.File]::WriteAllText($settingsPath, ($cfg | ConvertTo-Json -Depth 40))
    Write-Host "`nStatus line configured in $settingsPath (backup: settings.json.bak)"
  } catch {
    Write-Warning "Could not auto-configure status line: $($_.Exception.Message)"
    Write-Host 'Add manually to ~/.claude/settings.json:'
    Write-Host ("  `"statusLine`": { `"type`": `"command`", `"command`": `"node \`"" + ($wrapper -replace '\\','\\\\') + "\`"`", `"padding`": 0, `"refreshInterval`": 1 }")
  }
} else {
  Write-Host "`nSkipped status line (-NoStatusLine)."
}

Write-Host "`nDone. Restart Claude Code, wait ~5s, then HOLD Ctrl+`` to dictate (release to send)."
