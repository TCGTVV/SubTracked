# Befehle

Alles aus dem Projektroot. Paketmanager ist `pnpm` (Version via `packageManager`-Field in `package.json` festgenagelt, Node ≥ 22.13 nötig).

## Setup

```
pnpm install
```

`prepare`-Script setzt automatisch die Lefthook-Pre-Commit-Hooks. Neue Cloner brauchen keinen Init-Schritt.

## Dev-Run

```
pnpm tauri dev
```

Auf Linux/Wayland wäre WebKit ohne `WEBKIT_DISABLE_DMABUF_RENDERER=1` direkt mit `Gdk Error 71 (Protokollfehler)` abgestürzt — die Env-Var ist im pnpm-`tauri`-Script bereits gesetzt (siehe `package.json`), daher reicht der einfache Aufruf. Auf macOS/Windows bleibt die Var wirkungslos.

## Build (Installer für aktuelles OS)

```
pnpm tauri build
```

Artefakte unter `src-tauri/target/release/bundle/`.

## Frontend-only

```
pnpm dev          # Vite-Devserver (Port 1420, strict)
pnpm build        # tsc + vite build (TypeScript-Check + Bundle)
pnpm preview
```

## Qualität & Tests (Stand 2026-06-05)

```
pnpm lint                                       # Biome check (clean exit gefordert)
pnpm lint:fix                                   # Biome check --write (Auto-Fixes anwenden)
pnpm test                                       # vitest watch
pnpm test:run                                   # vitest run (einmalig, CI-Modus)
pnpm exec lefthook run pre-commit --force       # alle vier Hooks lokal trockenlauf
cd src-tauri && cargo fmt --check
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

Beim echten `git commit` läuft Lefthook automatisch und feuert dieselben vier Checks parallel (~1,5 s, Rust-Jobs werden auf Non-Rust-Commits dank `root: src-tauri/` automatisch geskippt). CI auf GitHub fährt dieselbe Befehls-Reihenfolge.

## Shell

Default-Shell ist **fish** — Bash-Syntax `VAR=value cmd` funktioniert dort nicht direkt; für Inline-Env-Vars entweder `env VAR=value cmd` oder `bash -c '...'` nutzen. Der oben genannte `WEBKIT_DISABLE_DMABUF_RENDERER=1`-Aufruf läuft in `bash` aus der Bash-Tool-Umgebung problemlos.
