# Frontend Test Setup: Vitest/RTL/axe-Gotchas

- `vitest.config.ts`: `environment: "jsdom"` (seit 2026-06-07, vorher `node`), `env: { TZ: "UTC" }` für Date-Determinismus, `plugins: [react()]` für JSX-Transform in `.tsx`-Test-Files, `include: ["src/**/*.test.{ts,tsx}"]`, `setupFiles: ["./vitest.setup.ts"]`.
- RTL 16 koppelt Auto-Cleanup an globales `afterEach`, das ohne `globals: true` nicht da ist → `vitest.setup.ts` ruft `cleanup()` explizit nach jedem Test.
- `tsconfig.json` includet `vitest.setup.ts`, damit die Type-Augmentation der jest-dom-Matcher für `tsc --noEmit` sichtbar ist.
- Tauri-Plugins werden mit `vi.mock("@tauri-apps/plugin-...")` gemockt — Pattern in `src/hooks/useNotificationPermission.test.tsx` etabliert.
- Dialoge sind shadcn/Radix (controlled `open`-Prop) — Tests rendern mit `open` statt nativem `<dialog>.setAttribute`.
- Radix portalt Content in `document.body`, daher direkte DOM-Queries über `document`/`screen`, nicht das `render`-`container`.
- Radix-Selects werden nicht interaktiv getestet (Werte via Trigger-`textContent` + `aria-invalid` per Prop).
- `vitest.setup.ts` stubbt für Radix in jsdom `ResizeObserver`/`scrollIntoView`/`hasPointerCapture`/`releasePointerCapture`.
- Accessibility (seit 2026-07-06): `axe-core` (dev-dep) + `expectNoAxeViolations()` in `src/test-utils/axe.ts` (Default-Root `document.body` wegen Radix-Portal; `color-contrast` und `region` in jsdom deaktiviert) — axe-Checks hängen in den bestehenden Testdateien von App-Shell + Dialogen.
- Bekannter Fail (seit mind. 2026-07-14, nicht durch Cargo-Tooling-Arbeit verursacht — auf sauberem `main` reproduziert): 6 Tests in `src/lib/demo.test.ts` schlagen mit `TypeError: Cannot read properties of undefined (reading 'clear')` bei `localStorage.clear()` fehl, plus Warnung "localStorage is not available because --localstorage-file was not provided" — vermutlich Node-Versions-Drift (natives `localStorage`-Global kollidiert mit jsdoms Implementierung). Noch nicht behoben.
