import { useEffect, useState } from "react";

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

export default function AuditLogView() {
  const [limit, setLimit] = useState(200);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Loading audit entries...");

  async function loadEntries() {
    setLoading(true);
    setStatus("");
    try {
      const result = await invokeTauri<AuditEntry[]>("read_audit_log", { limit });
      setEntries(result);
      setStatus(`Loaded ${result.length} entries.`);
    } catch (error) {
      setStatus(`Failed to load audit log: ${(error as Error).message}`);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEntries();
  }, []);

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

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Audit Events</h3>
        {entries.length === 0 ? (
          <p style={{ margin: 0, color: "#4b5563" }}>No audit entries found.</p>
        ) : (
          <div style={{ maxHeight: 420, overflow: "auto", display: "grid", gap: 8 }}>
            {entries.map((entry, index) => (
              <article
                key={`${entry.ts}-${entry.action}-${index}`}
                style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 10, background: "#fafafa" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong>{entry.action}</strong>
                  <span style={{ color: "#4b5563" }}>{entry.ts}</span>
                </div>
                <pre
                  style={{
                    margin: "8px 0 0",
                    whiteSpace: "pre-wrap",
                    background: "#f3f4f6",
                    borderRadius: 4,
                    padding: 8,
                  }}
                >
                  {JSON.stringify(entry.context, null, 2)}
                </pre>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
