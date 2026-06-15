import "./index.css";
// Legacy-Styles für noch nicht migrierte Komponenten (Phase 2 entfernt das).
// Nach index.css importiert; globale Element-Regeln wurden gestrippt.
import "./App.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
