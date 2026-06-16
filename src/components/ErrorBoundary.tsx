import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui/button";

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
        <main
          className="mx-auto flex min-h-screen max-w-lg flex-col items-start justify-center gap-4 p-6"
          role="alert"
        >
          <h1 className="text-fluid-xl font-bold">Etwas ist schiefgegangen</h1>
          <p className="text-muted-foreground">
            SubTracked ist auf einen unerwarteten Fehler gestoßen. Deine Daten sind sicher — sie
            liegen lokal in der Datenbank.
          </p>
          <pre className="w-full overflow-x-auto rounded-lg bg-muted p-3 text-sm text-destructive">
            {this.state.error.message}
          </pre>
          <Button type="button" onClick={this.handleReload}>
            App neu laden
          </Button>
        </main>
      );
    }
    return this.props.children;
  }
}
