import { useEffect, useMemo, useState } from "react";

interface CommandResult {
  code: number;
  ok: boolean;
  reason_code: string;
  command: string[];
  stdout: string;
  stderr: string;
}

interface SessionHistoryEntry {
  sessionId: string;
  accountId: string;
  cwd: string;
  updatedAt: string;
}

type SessionActionPhase = "idle" | "launching" | "ok" | "error";

interface SessionActionState {
  phase: SessionActionPhase;
  message: string;
  hint: string;
}

interface SessionsViewProps {
  prompt?: string;
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

const DEFAULT_HISTORY_LIMIT = 12;

function nowLabel(): string {
  return new Date().toLocaleTimeString();
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invokeFn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invokeFn) {
    throw new Error("tauri_invoke_unavailable");
  }
  return invokeFn<T>(cmd, args ?? {});
}

function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-9;]*m/g, "");
}

function parseAccountIds(output: string): string[] {
  const idSet = new Set<string>();
  const regex = /Account ID:\s*(\d+)/gi;
  let match: RegExpExecArray | null = regex.exec(output);
  while (match) {
    idSet.add(match[1]);
    match = regex.exec(output);
  }
  return Array.from(idSet).sort((a, b) => Number(a) - Number(b));
}

function parseSessionHistory(rawOutput: string): SessionHistoryEntry[] {
  const lines = stripAnsi(rawOutput).split(/\r?\n/);
  const sessions: SessionHistoryEntry[] = [];
  let current: SessionHistoryEntry | null = null;

  for (const line of lines) {
    const sessionMatch = line.match(/session_id:\s*([0-9a-f-]{36})/i);
    if (sessionMatch?.[1]) {
      if (current?.sessionId) sessions.push(current);
      current = {
        sessionId: sessionMatch[1],
        accountId: "",
        cwd: "",
        updatedAt: "",
      };
      continue;
    }
    if (!current) continue;

    const accountMatch = line.match(/account_id:\s*(\d+)/i);
    if (accountMatch?.[1]) {
      current.accountId = accountMatch[1];
      continue;
    }

    const cwdMatch = line.match(/cwd:\s*(.+)$/i);
    if (cwdMatch?.[1]) {
      current.cwd = cwdMatch[1].trim();
      continue;
    }

    const updatedAtMatch = line.match(/updated_at:\s*(.+)$/i);
    if (updatedAtMatch?.[1]) {
      current.updatedAt = updatedAtMatch[1].trim();
    }
  }

  if (current?.sessionId) sessions.push(current);
  return sessions;
}

function emptySessionActionState(): SessionActionState {
  return { phase: "idle", message: "", hint: "" };
}

export default function SessionsView(props: SessionsViewProps = {}) {
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyStatus, setHistoryStatus] = useState("");
  const [recentSessions, setRecentSessions] = useState<SessionHistoryEntry[]>([]);
  const [sessionStateById, setSessionStateById] = useState<Record<string, SessionActionState>>({});
  const [codexAccounts, setCodexAccounts] = useState<string[]>([]);
  const [manualAccountBySession, setManualAccountBySession] = useState<Record<string, string>>({});

  const promptText = useMemo(() => props.prompt?.trim() || "继续当前任务并闭环", [props.prompt]);

  async function refreshCodexAccounts(): Promise<void> {
    try {
      const result = await invokeTauri<CommandResult>("run_aih", {
        args: ["codex", "ls"],
      });
      const ids = parseAccountIds(`${result.stdout}\n${result.stderr}`);
      setCodexAccounts(ids);
    } catch (_error) {
      setCodexAccounts([]);
    }
  }

  async function refreshRecentSessions(): Promise<void> {
    setHistoryBusy(true);
    try {
      const result = await invokeTauri<CommandResult>("run_aih", {
        args: ["codex", "sessions", "--limit", String(DEFAULT_HISTORY_LIMIT)],
      });
      const combined = `${result.stdout}\n${result.stderr}`;
      if (result.code !== 0) {
        setHistoryStatus(`Session history refresh failed. code=${result.code}`);
        setRecentSessions([]);
        return;
      }

      const parsed = parseSessionHistory(combined);
      setRecentSessions(parsed);
      setManualAccountBySession((prev) => {
        const next = { ...prev };
        parsed.forEach((entry) => {
          const preferred = entry.accountId || codexAccounts[0] || "";
          if (preferred && !next[entry.sessionId]) {
            next[entry.sessionId] = preferred;
          }
        });
        return next;
      });
      setHistoryStatus(
        parsed.length
          ? `Loaded ${parsed.length} recent sessions at ${nowLabel()}.`
          : "No recent codex sessions found for this workspace."
      );
    } catch (error) {
      setHistoryStatus(`Session history refresh failed: ${(error as Error).message}`);
      setRecentSessions([]);
    } finally {
      setHistoryBusy(false);
    }
  }

  useEffect(() => {
    void refreshCodexAccounts();
    void refreshRecentSessions();
  }, []);

  async function continueWithMode(sessionId: string, mode: "auto" | "manual"): Promise<void> {
    const manualAccount = manualAccountBySession[sessionId] || "";
    if (mode === "manual" && !/^\d+$/.test(manualAccount)) {
      setSessionStateById((prev) => ({
        ...prev,
        [sessionId]: {
          phase: "error",
          message: "Manual continue requires a valid account ID.",
          hint: "Diagnosis: refresh account list and select a numeric account ID.",
        },
      }));
      return;
    }

    setSessionStateById((prev) => ({
      ...prev,
      [sessionId]: {
        phase: "launching",
        message: mode === "auto" ? "Continuing with auto account..." : "Continuing with manual account...",
        hint: "",
      },
    }));

    const args = mode === "manual"
      ? ["codex", "auto", "exec", "resume", sessionId, "--account", manualAccount, promptText]
      : ["codex", "auto", "exec", "resume", sessionId, promptText];

    try {
      const result = await invokeTauri<CommandResult>("run_aih", { args });
      if (result.code !== 0) {
        throw new Error(`resume_failed code=${result.code}`);
      }
      setSessionStateById((prev) => ({
        ...prev,
        [sessionId]: {
          phase: "ok",
          message: `Continue command submitted at ${nowLabel()}.`,
          hint: mode === "manual"
            ? `Fallback: aih codex auto exec resume ${sessionId} --account ${manualAccount} "${promptText}"`
            : `Fallback: aih codex auto exec resume ${sessionId} "${promptText}"`,
        },
      }));
      await refreshRecentSessions();
    } catch (error) {
      const raw = (error as Error)?.message || "resume_failed";
      setSessionStateById((prev) => ({
        ...prev,
        [sessionId]: {
          phase: "error",
          message: `Continue failed: ${raw}`,
          hint: mode === "manual"
            ? `Diagnosis: run "aih codex auto exec resume ${sessionId} --account ${manualAccount} \"${promptText}\"" in terminal to inspect stderr.`
            : `Diagnosis: run "aih codex auto exec resume ${sessionId} \"${promptText}\"" in terminal to inspect stderr.`,
        },
      }));
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    setSessionStateById((prev) => ({
      ...prev,
      [sessionId]: {
        phase: "launching",
        message: "Deleting session bindings...",
        hint: "",
      },
    }));
    try {
      const result = await invokeTauri<CommandResult>("run_aih", {
        args: ["codex", "sessions", "delete", sessionId],
      });
      if (result.code !== 0) {
        throw new Error(`delete_failed code=${result.code}`);
      }
      setSessionStateById((prev) => ({
        ...prev,
        [sessionId]: {
          phase: "ok",
          message: `Session deleted at ${nowLabel()}.`,
          hint: "Delete removes task/plan bindings and recent-session entry only for this session_id.",
        },
      }));
      await refreshRecentSessions();
    } catch (error) {
      const raw = (error as Error)?.message || "delete_failed";
      setSessionStateById((prev) => ({
        ...prev,
        [sessionId]: {
          phase: "error",
          message: `Delete failed: ${raw}`,
          hint: `Diagnosis: run "aih codex sessions delete ${sessionId}" in terminal to inspect stderr.`,
        },
      }));
    }
  }

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <strong>Recent Sessions (Codex)</strong>
        <button onClick={() => void refreshRecentSessions()} disabled={historyBusy}>
          {historyBusy ? "Refreshing..." : "Refresh Sessions"}
        </button>
      </div>
      <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>
        Continue supports both manual account override and auto account mode.
      </p>

      {historyStatus ? (
        <div style={{ fontSize: 13, color: historyStatus.toLowerCase().includes("failed") ? "#991b1b" : "#0c4a6e" }}>
          {historyStatus}
        </div>
      ) : null}

      {recentSessions.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {recentSessions.map((entry) => {
            const state = sessionStateById[entry.sessionId] || emptySessionActionState();
            const busy = state.phase === "launching" || historyBusy;
            const selectedManual = manualAccountBySession[entry.sessionId] || entry.accountId || codexAccounts[0] || "";

            return (
              <article key={entry.sessionId} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#ffffff" }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <code style={{ fontSize: 12 }}>{entry.sessionId}</code>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    account_id: {entry.accountId || "N/A"} | updated_at: {entry.updatedAt || "N/A"}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    cwd: {entry.cwd || "N/A"}
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <label style={{ fontSize: 13, color: "#374151" }}>
                      Manual account
                      <select
                        value={selectedManual}
                        onChange={(event) => {
                          const value = event.target.value;
                          setManualAccountBySession((prev) => ({ ...prev, [entry.sessionId]: value }));
                        }}
                        disabled={busy || codexAccounts.length === 0}
                        style={{ marginLeft: 8 }}
                      >
                        {codexAccounts.length === 0 ? <option value="">N/A</option> : null}
                        {codexAccounts.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button onClick={() => void continueWithMode(entry.sessionId, "manual")} disabled={busy || !/^\d+$/.test(selectedManual)}>
                      Continue Manual
                    </button>
                    <button onClick={() => void continueWithMode(entry.sessionId, "auto")} disabled={busy}>
                      Continue Auto
                    </button>
                    <button onClick={() => void deleteSession(entry.sessionId)} disabled={busy}>
                      Delete Session
                    </button>
                  </div>

                  {state.message ? (
                    <div
                      style={{
                        borderRadius: 6,
                        padding: "8px 10px",
                        background: state.phase === "error" ? "#fef2f2" : "#f0f9ff",
                        color: state.phase === "error" ? "#991b1b" : "#0c4a6e",
                        border: state.phase === "error" ? "1px solid #fecaca" : "1px solid #bae6fd",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{state.message}</div>
                      {state.hint ? <div>{state.hint}</div> : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div style={{ color: "#6b7280", fontSize: 13 }}>No session history to display.</div>
      )}
    </div>
  );
}
