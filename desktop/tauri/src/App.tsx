import { useState } from "react";
import DashboardView from "./views/dashboard";
import MigrationView from "./views/migration";
import AuditLogView from "./views/audit-log";

type TabKey = "dashboard" | "migration" | "audit";

const TAB_LABELS: Record<TabKey, string> = {
  dashboard: "Dashboard",
  migration: "Migration",
  audit: "Audit Log",
};

export default function App() {
  const [tab, setTab] = useState<TabKey>("dashboard");

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
          Desktop control center for dashboard monitoring, one-click session launch, migration, and audit visibility.
        </p>
      </header>

      <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => {
          const selected = key === tab;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
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

      {tab === "dashboard" && <DashboardView />}
      {tab === "migration" && <MigrationView />}
      {tab === "audit" && <AuditLogView />}
    </main>
  );
}
