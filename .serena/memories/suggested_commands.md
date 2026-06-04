# Befehle

Alles aus dem Projektroot. Paketmanager ist `pnpm`.

## Setup
```
pnpm install
```

## Dev-Run

```
pnpm tauri dev
```

Auf Linux/Wayland wäre WebKit ohne `WEBKIT_DISABLE_DMABUF_RENDERER=1` direkt mit `Gdk Error 71 (Protokollfehler)` abgestürzt — die Env-Var ist im pnpm-`tauri`-Script bereits gesetzt (siehe `package.json`), daher reicht der einfache Aufruf. Auf macOS/Windows bleibt die Var wirkungslos.

Ohne Wayland-Problem (X11, macOS, Windows):
```
pnpm tauri dev
```

## Build (Installer für aktuelles OS)
```
pnpm tauri build
```

## Frontend-only
```
pnpm dev          # Vite-Devserver (Port 1420, strict)
pnpm build        # tsc + vite build (TypeScript-Check + Bundle)
pnpm preview
```

## Shell

Default-Shell ist **fish** — Bash-Syntax `VAR=value cmd` funktioniert dort nicht direkt; für Inline-Env-Vars entweder `env VAR=value cmd` oder `bash -c '...'` nutzen. Der oben genannte `WEBKIT_DISABLE_DMABUF_RENDERER=1`-Aufruf läuft in `bash` aus der Bash-Tool-Umgebung problemlos.
