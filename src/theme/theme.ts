import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "class",
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: "#0f766e",
          contrastText: "#ffffff",
        },
        secondary: {
          main: "#007A8A",
          contrastText: "#ffffff",
        },
        info: {
          main: "#2596be",
          contrastText: "#ffffff",
        },
        background: {
          default: "#f6f6f6",
          paper: "#ffffff",
        },
        text: {
          primary: "#2D3748",
          secondary: "#475569",
        },
        divider: "#e2e8f0",
      },
    },
    dark: {
      palette: {
        primary: {
          main: "#5eead4",
          contrastText: "#0f172a",
        },
        secondary: {
          main: "#4dd0e0",
          contrastText: "#0f172a",
        },
        info: {
          main: "#56c2e6",
          contrastText: "#0f172a",
        },
        background: {
          default: "#0f172a",
          paper: "#1e293b",
        },
        text: {
          primary: "#e2e8f0",
          secondary: "#94a3b8",
        },
        divider: "#334155",
      },
    },
  },
  typography: {
    fontFamily:
      '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    button: {
      textTransform: "none",
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 12,
  },
});
