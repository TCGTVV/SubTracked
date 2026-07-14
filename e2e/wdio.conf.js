import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcTauriDir = path.resolve(__dirname, "../src-tauri");
// Linux-Binary ohne Extension (`mainBinaryName` in tauri.conf.json). Diese
// Suite laeuft aktuell nur auf dem Linux-CI-Runner (siehe .github/workflows/e2e.yml) --
// tauri-driver braucht auf Linux WebKitWebDriver (System-Paket `webkit2gtk-driver`),
// das es auf der lokalen Dev-Maschine (CachyOS/Arch) nicht gibt. Lokal daher nicht
// lauffaehig, nur in CI verifiziert.
const appBinaryPath = path.join(srcTauriDir, "target", "debug", "subtracked");

// Wird ueber beforeSession gesetzt und in afterSession wieder beendet.
let tauriDriver;

export const config = {
  runner: "local",
  // tauri-driver hoert per Default auf 127.0.0.1:4444 -- ohne explizites
  // hostname/port versucht wdio, eine lokale Browser-Session zu starten
  // (Fehler: "No browserName defined"), statt sich mit tauri-driver zu verbinden.
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  specs: ["./test/specs/**/*.js"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application: appBinaryPath,
      },
    },
  ],
  logLevel: "warn",
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },
  reporters: ["spec"],

  // App-Binary muss existieren, bevor die WebDriver-Session startet.
  onPrepare: () => {
    const result = spawnSync("cargo", ["build"], {
      cwd: srcTauriDir,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error("cargo build fehlgeschlagen");
    }
  },

  // tauri-driver proxied die WebDriver-Requests an WebKitWebDriver (Linux) /
  // die jeweilige OS-eigene Implementierung.
  beforeSession: () => {
    tauriDriver = spawn(path.join(process.env.HOME, ".cargo", "bin", "tauri-driver"), [], {
      stdio: [null, process.stdout, process.stderr],
    });
  },
  afterSession: () => {
    tauriDriver?.kill();
  },
};
