"use client";

import { useState } from "react";

export function AgentDownloadButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/setup");
      if (!res.ok) throw new Error("Konfiguration nicht verfügbar");
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { config, agentToken, appUrl } = data;
      const repo = "https://github.com/philippgassenmedia-cyber/masters-brand-monitor.git";
      const isWindows = navigator.platform.toLowerCase().includes("win") ||
        navigator.userAgent.toLowerCase().includes("windows");

      let content: string;
      let filename: string;

      if (isWindows) {
        filename = "DPMA-Agent-Starten.bat";
        content = buildWindowsScript(appUrl, agentToken, repo, config);
      } else {
        filename = "DPMA-Agent-Starten.command";
        content = buildMacScript(appUrl, agentToken, repo, config);
      }

      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={download}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-white/90 disabled:opacity-50"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {loading ? "Lädt…" : "DPMA-Agent herunterladen"}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

function buildWindowsScript(appUrl: string, agentToken: string, repo: string, config: Record<string, string>): string {
  return `@echo off
chcp 65001 >nul
title DPMA Register-Agent
echo.
echo ========================================
echo   DPMA Register-Agent
echo ========================================
echo.

:: Dieses Script muss nur einmal heruntergeladen werden.
:: API-Keys werden automatisch vom Server geholt.
set "APP_URL=${appUrl}"
set "AGENT_TOKEN=${agentToken}"

:: Node.js prüfen
where node >nul 2>&1
if %errorlevel% equ 0 goto :node_ok
if exist "%ProgramFiles%\\nodejs\\node.exe" (
  set "PATH=%ProgramFiles%\\nodejs;%PATH%"
  goto :node_ok
)
if exist "%ProgramFiles(x86)%\\nodejs\\node.exe" (
  set "PATH=%ProgramFiles(x86)%\\nodejs;%PATH%"
  goto :node_ok
)
if exist "%APPDATA%\\nvm\\current\\node.exe" (
  set "PATH=%APPDATA%\\nvm\\current;%PATH%"
  goto :node_ok
)
if exist "%LOCALAPPDATA%\\nvm\\current\\node.exe" (
  set "PATH=%LOCALAPPDATA%\\nvm\\current;%PATH%"
  goto :node_ok
)
echo [FEHLER] Node.js nicht gefunden. Von https://nodejs.org installieren.
pause & exit /b 1

:node_ok
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

:: Git prüfen
where git >nul 2>&1
if %errorlevel% equ 0 goto :git_ok
if exist "%ProgramFiles%\\Git\\cmd\\git.exe" (
  set "PATH=%ProgramFiles%\\Git\\cmd;%PATH%"
  goto :git_ok
)
if exist "%ProgramFiles(x86)%\\Git\\cmd\\git.exe" (
  set "PATH=%ProgramFiles(x86)%\\Git\\cmd;%PATH%"
  goto :git_ok
)
if exist "%LOCALAPPDATA%\\Programs\\Git\\cmd\\git.exe" (
  set "PATH=%LOCALAPPDATA%\\Programs\\Git\\cmd;%PATH%"
  goto :git_ok
)
echo [FEHLER] Git nicht gefunden. Von https://git-scm.com/download/win installieren.
pause & exit /b 1

:git_ok
echo [OK] Git gefunden.

:: Projekt einrichten
if not exist "C:\\dpma-agent\\package.json" (
  echo [1/3] Projekt wird heruntergeladen...
  mkdir "C:\\dpma-agent" 2>nul
  cd /d "C:\\dpma-agent"
  git clone ${repo} .
  echo [2/3] Abhaengigkeiten werden installiert...
  call npm install
) else (
  cd /d "C:\\dpma-agent"
  echo Projekt aktualisieren...
  git pull
  call npm install --silent
)

:: Aktuelle API-Keys vom Server holen
echo Lade Konfiguration vom Server...
powershell -NoProfile -Command "$r=try{(Invoke-WebRequest '%APP_URL%/api/agent/config?token=%AGENT_TOKEN%' -UseBasicParsing -TimeoutSec 15).Content | ConvertFrom-Json}catch{$null}; if($r){('set \\"SUPABASE_URL='+$r.SUPABASE_URL+'\\"'),('set \\"SUPABASE_SERVICE_ROLE_KEY='+$r.SUPABASE_SERVICE_ROLE_KEY+'\\"'),('set \\"GEMINI_API_KEY='+$r.GEMINI_API_KEY+'\\"') | Out-File -FilePath $env:TEMP\\\\agentenv.bat -Encoding ASCII}" 2>nul

if not exist "%TEMP%\\agentenv.bat" (
  echo [WARNUNG] Server nicht erreichbar - verwende gespeicherte Keys.
  set "SUPABASE_URL=${config.NEXT_PUBLIC_SUPABASE_URL}"
  set "SUPABASE_SERVICE_ROLE_KEY=${config.SUPABASE_SERVICE_ROLE_KEY}"
  set "GEMINI_API_KEY=${config.GEMINI_API_KEY}"
  goto :start_agent
)
call "%TEMP%\\agentenv.bat"
del "%TEMP%\\agentenv.bat" >nul 2>&1
echo [OK] Konfiguration geladen.

:start_agent
echo.
echo [3/3] Agent wird gestartet...
echo Der Agent wartet auf Scan-Auftraege. Dieses Fenster offen lassen!
echo Zum Stoppen: Strg+C
echo.

call "C:\\dpma-agent\\node_modules\\.bin\\tsx.cmd" scripts\\dpma-agent.ts
pause
`.replace(/\$\{repo\}/g, repo).replace(/\$\{appUrl\}/g, appUrl).replace(/\$\{agentToken\}/g, agentToken);
}

function buildMacScript(appUrl: string, agentToken: string, repo: string, config: Record<string, string>): string {
  return `#!/bin/bash
# DPMA Register-Agent — Doppelklick zum Starten
# Dieses Script muss nur einmal heruntergeladen werden.

APP_URL="${appUrl}"
AGENT_TOKEN="${agentToken}"

echo ""; echo "========================================"; echo "  DPMA Register-Agent"; echo "========================================"

if ! command -v node &>/dev/null; then
  echo "[FEHLER] Node.js nicht gefunden. Von https://nodejs.org installieren."
  read -p "Enter drücken..."; exit 1
fi
echo "[OK] Node.js $(node --version)"

if ! command -v git &>/dev/null; then
  echo "[FEHLER] Git nicht gefunden."
  read -p "Enter drücken..."; exit 1
fi
echo "[OK] Git gefunden."

if [ ! -f "$HOME/dpma-agent/package.json" ]; then
  echo "[1/3] Projekt wird heruntergeladen..."
  mkdir -p "$HOME/dpma-agent" && cd "$HOME/dpma-agent"
  git clone ${repo} .
  echo "[2/3] Abhaengigkeiten werden installiert..."
  npm install
else
  cd "$HOME/dpma-agent"
  echo "Projekt aktualisieren..."; git pull; npm install --silent
fi

echo "Lade Konfiguration vom Server..."
CONFIG=$(curl -sf --max-time 15 "$APP_URL/api/agent/config?token=$AGENT_TOKEN" 2>/dev/null)
if [ -n "$CONFIG" ]; then
  export SUPABASE_URL=$(echo "$CONFIG" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).SUPABASE_URL" 2>/dev/null || echo "${config.NEXT_PUBLIC_SUPABASE_URL}")
  export SUPABASE_SERVICE_ROLE_KEY=$(echo "$CONFIG" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).SUPABASE_SERVICE_ROLE_KEY" 2>/dev/null || echo "${config.SUPABASE_SERVICE_ROLE_KEY}")
  export GEMINI_API_KEY=$(echo "$CONFIG" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).GEMINI_API_KEY" 2>/dev/null || echo "${config.GEMINI_API_KEY}")
  echo "[OK] Konfiguration geladen."
else
  echo "[WARNUNG] Server nicht erreichbar - verwende gespeicherte Keys."
  export SUPABASE_URL="${config.NEXT_PUBLIC_SUPABASE_URL}"
  export SUPABASE_SERVICE_ROLE_KEY="${config.SUPABASE_SERVICE_ROLE_KEY}"
  export GEMINI_API_KEY="${config.GEMINI_API_KEY}"
fi

echo ""; echo "[3/3] Agent wird gestartet. Zum Stoppen: Ctrl+C"; echo ""
node "$HOME/dpma-agent/node_modules/.bin/tsx" scripts/dpma-agent.ts
read -p "Enter drücken..."
`.replace(/\$\{repo\}/g, repo).replace(/\$\{appUrl\}/g, appUrl).replace(/\$\{agentToken\}/g, agentToken);
}
