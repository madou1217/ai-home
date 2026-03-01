import { useEffect, useMemo, useState } from "react";

interface AuditEntry {
  ts: string;
  action: string;
  context: unknown;
}

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      core?: {
        invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invokeFn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invokeFn) {
    throw new Error("Tauri invoke bridge is unavailable.");
  }
  return invokeFn<T>(cmd, args ?? {});
}

function stringifyContext(context: unknown): string {
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

export default function AuditLogView() {
  const [limit, setLimit] = useState(200);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Loading audit entries...");
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  async function loadEntries() {
    setLoading(true);
    setStatus("");
    try {
      const result = await invokeTauri<AuditEntry[]>("read_audit_log", { limit });
      setEntries(result);
      setStatus(`Loaded ${result.length} entries.`);
      setExpandedKeys({});
    } catch (error) {
      setStatus(`Failed to load audit log: ${(error as Error).message}`);
      setEntries([]);
      setExpandedKeys({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEntries();
  }, []);

  const actionOptions = useMemo(() => {
    const uniqueActions = new Set(entries.map((entry) => entry.action));
    return ["all", ...Array.from(uniqueActions).sort()];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const actionMatches = actionFilter === "all" || entry.action === actionFilter;
      if (!actionMatches) return false;
      if (!normalizedQuery) return true;

      const text = `${entry.ts}\n${entry.action}\n${stringifyContext(entry.context)}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [actionFilter, entries, query]);

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Limit:
          <input
            type="number"
            min={1}
            max={2000}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value) || 1)}
            style={{ marginLeft: 8, width: 100 }}
          />
        </label>
        <button onClick={() => void loadEntries()} disabled={loading}>
          Refresh
        </button>
        <span style={{ color: "#4b5563" }}>{status}</span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Search:
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="timestamp, action, context"
            style={{ marginLeft: 8, width: 280 }}
          />
        </label>
        <label>
          Action:
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} style={{ marginLeft: 8 }}>
            {actionOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <span style={{ color: "#4b5563" }}>
          Showing {filteredEntries.length}/{entries.length}
        </span>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Audit Events</h3>
        {filteredEntries.length === 0 ? (
          <p style={{ margin: 0, color: "#4b5563" }}>No matching audit entries found.</p>
        ) : (
          <div style={{ maxHeight: 420, overflow: "auto", display: "grid", gap: 8 }}>
            {filteredEntries.map((entry, index) => {
              const key = `${entry.ts}-${entry.action}-${index}`;
              const expanded = Boolean(expandedKeys[key]);
              const contextText = stringifyContext(entry.context);
              return (
                <article
                  key={key}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 10, background: "#fafafa" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>{entry.action}</strong>
                    <span style={{ color: "#4b5563" }}>{entry.ts}</span>
                  </div>
                  <button onClick={() => toggleExpanded(key)} style={{ marginTop: 8 }}>
                    {expanded ? "Hide Details" : "Show Details"}
                  </button>
                  {expanded ? (
                    <pre
                      style={{
                        margin: "8px 0 0",
                        whiteSpace: "pre-wrap",
                        background: "#f3f4f6",
                        borderRadius: 4,
                        padding: 8,
                      }}
                    >
                      {contextText}
                    </pre>
                  ) : (
                    <p style={{ margin: "8px 0 0", color: "#4b5563" }}>
                      {contextText.slice(0, 140)}{contextText.length > 140 ? "..." : ""}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
