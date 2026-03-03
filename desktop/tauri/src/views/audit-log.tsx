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
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Loading audit entries...");
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string>("");

  async function loadEntries() {
    setLoading(true);
    setStatus("");
    try {
      const result = await invokeTauri<AuditEntry[]>("read_audit_log", { limit });
      setEntries(result);
      setStatus(`Loaded ${result.length} entries.`);
      setPage(1);
      setSelectedKey("");
    } catch (error) {
      setStatus(`Failed to load audit log: ${(error as Error).message}`);
      setEntries([]);
      setPage(1);
      setSelectedKey("");
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

  const decoratedEntries = useMemo(() => {
    return entries.map((entry, index) => {
      const key = `${entry.ts}-${entry.action}-${index}`;
      const contextText = stringifyContext(entry.context);
      return {
        ...entry,
        key,
        contextText,
        searchableText: `${entry.ts}\n${entry.action}\n${contextText}`.toLowerCase(),
      };
    });
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return decoratedEntries.filter((entry) => {
      const actionMatches = actionFilter === "all" || entry.action === actionFilter;
      if (!actionMatches) return false;
      if (!normalizedQuery) return true;
      return entry.searchableText.includes(normalizedQuery);
    });
  }, [actionFilter, decoratedEntries, query]);

  useEffect(() => {
    setPage(1);
  }, [query, actionFilter, pageSize]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  }, [filteredEntries.length, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  const pageEntries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, page, pageSize]);

  useEffect(() => {
    if (pageEntries.length === 0) {
      setSelectedKey("");
      return;
    }
    const selectedStillVisible = pageEntries.some((entry) => entry.key === selectedKey);
    if (!selectedStillVisible) {
      setSelectedKey(pageEntries[0].key);
    }
  }, [pageEntries, selectedKey]);

  const selectedEntry = useMemo(() => {
    return pageEntries.find((entry) => entry.key === selectedKey) ?? null;
  }, [pageEntries, selectedKey]);

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

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Per page:
          <select
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value) || 25)}
            style={{ marginLeft: 8 }}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
          Prev
        </button>
        <span style={{ color: "#4b5563" }}>
          Page {page} / {totalPages}
        </span>
        <button onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
          Next
        </button>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Audit Events</h3>
        {filteredEntries.length === 0 ? (
          <p style={{ margin: 0, color: "#4b5563" }}>No matching audit entries found.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
            <div style={{ maxHeight: 420, overflow: "auto", display: "grid", gap: 8 }}>
              {pageEntries.map((entry) => {
                const selected = entry.key === selectedKey;
                return (
                  <button
                    key={entry.key}
                    onClick={() => setSelectedKey(entry.key)}
                    style={{
                      border: selected ? "1px solid #2563eb" : "1px solid #e5e7eb",
                      borderRadius: 6,
                      padding: 10,
                      background: selected ? "#eff6ff" : "#fafafa",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong>{entry.action}</strong>
                      <span style={{ color: "#4b5563" }}>{entry.ts}</span>
                    </div>
                    <p style={{ margin: "8px 0 0", color: "#4b5563" }}>
                      {entry.contextText.slice(0, 140)}
                      {entry.contextText.length > 140 ? "..." : ""}
                    </p>
                  </button>
                );
              })}
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 10, background: "#f9fafb" }}>
              <h4 style={{ margin: "0 0 8px" }}>Details</h4>
              {selectedEntry ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <strong>{selectedEntry.action}</strong>
                    <span style={{ color: "#4b5563" }}>{selectedEntry.ts}</span>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      background: "#f3f4f6",
                      borderRadius: 4,
                      padding: 8,
                      overflow: "auto",
                      maxHeight: 330,
                    }}
                  >
                    {selectedEntry.contextText}
                  </pre>
                </div>
              ) : (
                <p style={{ margin: 0, color: "#4b5563" }}>Select one entry on the left to inspect details.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
