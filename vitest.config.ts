import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    env: { TZ: "UTC" },
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // Node >=24 bringt eine eigene (experimentelle) Web-Storage-API mit, die
    // ohne --localstorage-file nicht funktioniert und jsdoms localStorage-Polyfill
    // im Testprozess ueberschattet ("Cannot read properties of undefined
    // (reading 'clear')"). --no-experimental-webstorage ist ein Node-Startflag,
    // wirkt also nur im "forks"-Pool (echte Kindprozesse), nicht im "threads"-Pool
    // (worker_threads teilen die Flags des Elternprozesses). `execArgv` ist seit
    // Vitest 4 ein Top-Level-Option (vorher unter `poolOptions.forks`).
    pool: "forks",
    execArgv: ["--no-experimental-webstorage"],
  },
});
