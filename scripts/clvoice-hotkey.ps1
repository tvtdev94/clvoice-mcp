<#
.SYNOPSIS
  clvoice push-to-talk hotkey watcher (Windows).

.DESCRIPTION
  Hold the hotkey (default Ctrl+Alt+Space) to record, release to stop. On
  release the audio is transcribed (Gemini) and pasted into the focused window
  for editing. Uses GetAsyncKeyState polling (no keyboard hook -> AV-safe) and
  controls ffmpeg directly (stop via "q" so the WAV is finalized cleanly).

  Feedback so you know its state without looking:
    - high beep  + "RECORDING" when recording starts
    - low beep   + "transcribing" when you release
    - short beep + transcript text when done (or an error beep on failure)

.EXAMPLE
  pwsh -File scripts/clvoice-hotkey.ps1 -ApiKey "AIza..." -MicDevice "Microphone (2- USB PnP Audio Device)"
#>
param(
  [string]$ApiKey    = $env:GEMINI_API_KEY,
  [string]$GroqKey   = $env:GROQ_API_KEY,
  [string]$Stt       = $env:CLVOICE_STT,
  [string]$MicDevice = $env:CLVOICE_MIC_DEVICE,
  [string]$Model     = $env:CLVOICE_GEMINI_MODEL,
  [string]$Key       = '`',       # main key: F1-F12, letter/digit, SPACE, or OEM (` - = [ ] ; ' , . / \)
  [switch]$NoCtrl,
  [switch]$Alt,
  [switch]$Shift,
  [switch]$NoBeep
)

$ErrorActionPreference = "Stop"

$root  = Split-Path -Parent $PSScriptRoot
$node  = Join-Path $root "dist\transcribe-file.js"
if (-not (Test-Path $node)) {
  Write-Error "Not found: $node  (run 'npm run build' first)"
  exit 1
}

if ($ApiKey)    { $env:GEMINI_API_KEY = $ApiKey }
if ($GroqKey)   { $env:GROQ_API_KEY = $GroqKey }
if ($Stt)       { $env:CLVOICE_STT = $Stt }
if ($MicDevice) { $env:CLVOICE_MIC_DEVICE = $MicDevice }
if ($Model)     { $env:CLVOICE_GEMINI_MODEL = $Model }
if (($env:CLVOICE_STT -eq "groq") -and -not $env:GROQ_API_KEY) {
  Write-Warning "CLVOICE_STT=groq but GROQ_API_KEY not set - transcription will fail."
} elseif (($env:CLVOICE_STT -ne "groq") -and -not $env:GEMINI_API_KEY) {
  Write-Warning "GEMINI_API_KEY not set - transcription will fail. Pass -ApiKey or set the env var."
}
$dev = $env:CLVOICE_MIC_DEVICE

# State file read by the Claude Code statusline wrapper (clvoice-statusline.cjs).
$stateFile = Join-Path $env:TEMP "clvoice-state.txt"
function Set-State([string]$s) { try { [System.IO.File]::WriteAllText($stateFile, $s) } catch {} }
Set-State ""

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CLVKey {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  public static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }
}
"@

$VK_CONTROL = 0x11; $VK_MENU = 0x12; $VK_SHIFT = 0x10
$OEM = @{ '`'=0xC0; 'GRAVE'=0xC0; 'BACKTICK'=0xC0; '-'=0xBD; '='=0xBB; '['=0xDB; ']'=0xDD; ';'=0xBA; "'"=0xDE; ','=0xBC; '.'=0xBE; '/'=0xBF; '\'=0xDC }
function Get-MainVk([string]$k) {
  $k = $k.ToUpper()
  if ($k -eq "SPACE") { return 0x20 }
  if ($k -match '^F([1-9]|1[0-2])$') { return 0x70 + [int]$Matches[1] - 1 }  # F1..F12
  if ($OEM.ContainsKey($k)) { return $OEM[$k] }
  if ($k.Length -eq 1) { return [int][char]$k }
  throw "Unsupported key '$k' (use F1-F12, a letter/digit, SPACE, or OEM key like ` - = [ ] ; ' , . / \)"
}
$mainVk    = Get-MainVk $Key
$needCtrl  = -not $NoCtrl
$needAlt   = [bool]$Alt
$needShift = [bool]$Shift

function Test-Combo {
  $ok = [CLVKey]::Down($mainVk)
  if ($needCtrl)  { $ok = $ok -and [CLVKey]::Down($VK_CONTROL) }
  if ($needAlt)   { $ok = $ok -and [CLVKey]::Down($VK_MENU) }
  if ($needShift) { $ok = $ok -and [CLVKey]::Down($VK_SHIFT) }
  return $ok
}
function Beep-Safe([int]$f, [int]$d) { if (-not $NoBeep) { try { [console]::Beep($f, $d) } catch {} } }

function Start-Recording([string]$wav) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "ffmpeg"
  $psi.Arguments = "-hide_banner -loglevel error -f dshow -i `"audio=$dev`" -af highpass=f=80,dynaudnorm -ar 16000 -ac 1 -y `"$wav`""
  $psi.RedirectStandardInput = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  return [System.Diagnostics.Process]::Start($psi)
}
function Stop-Recording($proc) {
  try { $proc.StandardInput.Write("q"); $proc.StandardInput.Flush() } catch {}
  if (-not $proc.WaitForExit(4000)) { try { $proc.Kill() } catch {} }
}

$combo = @()
if ($needCtrl) { $combo += "Ctrl" }; if ($needAlt) { $combo += "Alt" }; if ($needShift) { $combo += "Shift" }
$combo += $Key.ToUpper()

Write-Host "clvoice push-to-talk"
Write-Host "  Hold     : $($combo -join '+')  (hold to talk, release to send)"
Write-Host "  Mic      : $((($dev), '(auto)')[[int]([string]::IsNullOrEmpty($dev))])"
Write-Host "Ready. Hold the hotkey and speak. Ctrl+C to quit.`n"

while ($true) {
  if (Test-Combo) {
    $wav = Join-Path $env:TEMP ("clvoice-ptt-" + [guid]::NewGuid().ToString() + ".wav")
    $proc = Start-Recording $wav
    # dshow needs ~0.3-0.5s to actually open the mic; beep only AFTER that so the
    # user doesn't start talking before capture begins (otherwise the first word
    # is clipped). The wait doubles as recording warm-up.
    Start-Sleep -Milliseconds 400
    Set-State "REC"
    Beep-Safe 1100 90
    Write-Host "[clvoice] RECORDING... (release to stop)" -ForegroundColor Red

    # Record until the main key is released.
    while ([CLVKey]::Down($mainVk)) { Start-Sleep -Milliseconds 30 }

    # Brief lead-out so the trailing word isn't cut off on release.
    Start-Sleep -Milliseconds 150
    Stop-Recording $proc
    Set-State "STT"
    Beep-Safe 600 90
    Write-Host "[clvoice] transcribing..." -ForegroundColor Yellow

    try {
      & node "$node" "$wav"
      Beep-Safe 1500 70
    } catch {
      Write-Warning "transcribe failed: $($_.Exception.Message)"
      Beep-Safe 300 200
    }
    Set-State ""
    Start-Sleep -Milliseconds 250
  }
  Start-Sleep -Milliseconds 40
}
