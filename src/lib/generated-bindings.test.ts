import { describe, expect, it } from "vitest";

// ts-rs mappt i64 standardmaessig auf TS `bigint`; unsere i64-Felder (id, amountCents, ...)
// brauchen deshalb #[ts(type = "number")] in src-tauri/src/db.rs, weil Tauris IPC JSON-Zahlen
// transportiert, keine BigInts. Dieser Test faengt ein vergessenes Override auf einem neuen
// i64-Feld ab, bevor es im Frontend zu kaputter Zahlen-Arithmetik fuehrt.
const generated = import.meta.glob("../generated/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("generierte ts-rs-Bindings", () => {
  it("Verzeichnis enthaelt generierte Dateien", () => {
    expect(Object.keys(generated).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(generated))("%s enthaelt kein bigint", (_path, content) => {
    expect(content).not.toContain("bigint");
  });
});
