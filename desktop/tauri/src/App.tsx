import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from "react";
import DashboardView from "./views/dashboard";
import SessionLauncherView from "./views/session-launcher";
import SessionsView from "./views/sessions";
import MigrationView from "./views/migration";
import AuditLogView from "./views/audit-log";

type TabKey = "dashboard" | "launcher" | "sessions" | "migration" | "audit";

const TAB_LABELS: Record<TabKey, string> = {
  dashboard: "Dashboard",
  launcher: "Session Launcher",
  sessions: "Sessions",
  migration: "Migration",
  audit: "Audit Log",
};

const TAB_ORDER: TabKey[] = ["dashboard", "launcher", "sessions", "migration", "audit"];
const DEFAULT_TAB: TabKey = "dashboard";

function parseHashToTab(hashValue: string): TabKey | null {
  const normalized = hashValue.replace(/^#/, "").trim().toLowerCase();
  if (!normalized) return DEFAULT_TAB;
  return TAB_ORDER.includes(normalized as TabKey) ? (normalized as TabKey) : null;
}

function syncHash(tab: TabKey) {
  const nextHash = `#${tab}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, "", nextHash);
  }
}

type AppShellErrorBoundaryProps = {
  onReset: () => void;
  children: ReactNode;
};

type AppShellErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class AppShellErrorBoundary extends Component<AppShellErrorBoundaryProps, AppShellErrorBoundaryState> {
  state: AppShellErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: Error): AppShellErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Unknown rendering error",
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[desktop-app-shell] render failed", {
      error,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onReset();
  };

  render() {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>UI Failed To Render</h2>
          <p style={{ margin: "0 0 12px" }}>
            The current view crashed. You can return to Dashboard and retry.
          </p>
          <p style={{ margin: "0 0 12px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
            {this.state.message}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              borderRadius: 8,
              border: "1px solid #dc2626",
              background: "#dc2626",
              color: "#ffffff",
              padding: "8px 12px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Back To Dashboard
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

function renderView(tab: TabKey) {
  if (tab === "dashboard") return <DashboardView />;
  if (tab === "launcher") return <SessionLauncherView />;
  if (tab === "sessions") return <SessionsView />;
  if (tab === "migration") return <MigrationView />;
  return <AuditLogView />;
}

export default function App() {
  const [tab, setTab] = useState<TabKey>(() => parseHashToTab(window.location.hash) || DEFAULT_TAB);
  const [routeError, setRouteError] = useState<string>("");
  const [boundaryKey, setBoundaryKey] = useState(0);

  useEffect(() => {
    const resolveFromHash = () => {
      const resolved = parseHashToTab(window.location.hash);
      if (!resolved) {
        setRouteError(`Unknown route '${window.location.hash}'. Redirected to ${DEFAULT_TAB}.`);
        setTab(DEFAULT_TAB);
        syncHash(DEFAULT_TAB);
        return;
      }
      setRouteError("");
      setTab(resolved);
      syncHash(resolved);
    };

    resolveFromHash();
    window.addEventListener("hashchange", resolveFromHash);
    return () => window.removeEventListener("hashchange", resolveFromHash);
  }, []);

  useEffect(() => {
    syncHash(tab);
  }, [tab]);

  const navTabs = useMemo(() => TAB_ORDER, []);

  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: 1080,
        padding: "24px 20px 32px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#111827",
      }}
    >
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>AI Home Desktop</h1>
        <p style={{ margin: "8px 0 0", color: "#4b5563" }}>
          Desktop control center for dashboard monitoring, session launch/management, migration, and audit visibility.
        </p>
      </header>

      {routeError ? (
        <p
          role="status"
          style={{
            margin: "0 0 12px",
            borderRadius: 8,
            padding: "8px 10px",
            border: "1px solid #fde68a",
            background: "#fffbeb",
            color: "#92400e",
          }}
        >
          {routeError}
        </p>
      ) : null}

      <nav aria-label="Primary" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {navTabs.map((key) => {
          const selected = key === tab;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-current={selected ? "page" : undefined}
              style={{
                borderRadius: 8,
                border: selected ? "1px solid #2563eb" : "1px solid #d1d5db",
                background: selected ? "#2563eb" : "#ffffff",
                color: selected ? "#ffffff" : "#111827",
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {TAB_LABELS[key]}
            </button>
          );
        })}
      </nav>

      <AppShellErrorBoundary
        key={boundaryKey}
        onReset={() => {
          setTab(DEFAULT_TAB);
          setBoundaryKey((v) => v + 1);
        }}
      >
        {renderView(tab)}
      </AppShellErrorBoundary>
    </main>
  );
}
