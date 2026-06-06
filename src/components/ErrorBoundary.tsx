import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <main className="container" role="alert">
          <h1>Etwas ist schiefgegangen</h1>
          <p>
            SubTracked ist auf einen unerwarteten Fehler gestoßen. Deine Daten sind sicher — sie
            liegen lokal in der Datenbank.
          </p>
          <pre className="error-details">{this.state.error.message}</pre>
          <button type="button" onClick={this.handleReload}>
            App neu laden
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
