import axe from "axe-core";

/**
 * Führt axe-core über den gerenderten DOM und wirft bei Verstößen einen
 * Fehler mit lesbarer Zusammenfassung (Regel, Impact, betroffene Knoten).
 * Default-Wurzel ist document.body, weil Radix Dialog-Content dorthin portalt.
 */
export async function expectNoAxeViolations(root: Element = document.body): Promise<void> {
  const results = await axe.run(root, {
    rules: {
      // Braucht echtes Layout/Farb-Rendering, das jsdom nicht liefert.
      "color-contrast": { enabled: false },
      // Best-Practice-Regel für ganze Seiten; Komponenten-Tests rendern Fragmente.
      region: { enabled: false },
    },
  });
  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (v) =>
          `${v.id} (${v.impact ?? "?"}): ${v.help}\n${v.nodes.map((n) => `  → ${n.html}`).join("\n")}`,
      )
      .join("\n\n");
    throw new Error(`axe-Verstöße gefunden:\n\n${summary}`);
  }
}
