import { useEffect, useMemo, useState } from "react";

export type CliName = "codex" | "claude" | "gemini";
export type CliAccounts = Record<CliName, string[]>;

interface LaunchRequest {
  cli: CliName;
  accountId: string;
  prompt?: string;
}

interface SessionLauncherProps {
  accountsByCli?: CliAccounts;
  busy?: boolean;
  onLaunch?: (request: LaunchRequest) => Promise<void>;
}

type LaunchPhase = "idle" | "launching" | "ok" | "error";

interface LaunchUiState {
  phase: LaunchPhase;
  message: string;
  hint: string;
}

interface LaunchTimeoutError extends Error {
  code: "launch_timeout";
}

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

const CLI_LABEL: Record<CliName, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
};

const CLI_ROWS: CliName[] = ["codex", "claude", "gemini"];
const LAUNCH_TIMEOUT_MS = 15000;
const DEFAULT_HISTORY_LIMIT = 12;
const EMPTY_ACCOUNTS: CliAccounts = { codex: [], claude: [], gemini: [] };

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

function nowLabel(): string {
  return new Date().toLocaleTimeString();
}

function createTimeoutError(): LaunchTimeoutError {
  const err = new Error(`launch did not complete within ${Math.round(LAUNCH_TIMEOUT_MS / 1000)}s`) as LaunchTimeoutError;
  err.code = "launch_timeout";
  return err;
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(createTimeoutError()), ms);
  });
}

function emptyLaunchState(): LaunchUiState {
  return { phase: "idle", message: "", hint: "" };
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

function classifyFailure(cli: CliName, error: unknown): { message: string; hint: string } {
  const raw = (error as Error)?.message || String(error || "unknown launch error");
  const normalized = raw.toLowerCase();
  if ((error as LaunchTimeoutError)?.code === "launch_timeout" || normalized.includes("timeout")) {
    return {
      message: "Launcher timed out while waiting for response.",
      hint: `Diagnosis: check desktop logs and run "aih ${cli} ls" to verify account state, then retry.`,
    };
  }
  if (normalized.includes("tauri") || normalized.includes("invoke") || normalized.includes("bridge")) {
    return {
      message: "Desktop bridge is unavailable for launch.",
      hint: "Diagnosis: reopen desktop app and verify tauri backend is running.",
    };
  }
  if (normalized.includes("account")) {
    return {
      message: `Launch rejected by ${CLI_LABEL[cli]} account validation.`,
      hint: `Diagnosis: run "aih ${cli} ls", confirm account exists, and reselect account.`,
    };
  }
  return {
    message: `Launch failed: ${raw}`,
    hint: `Diagnosis: rerun "aih ${cli} ls" and retry. If failure persists, capture stderr from desktop logs.`,
  };
}

export default function SessionLauncher(props: SessionLauncherProps = {}) {
  const launchBusy = Boolean(props.busy);
  const accountsByCli = props.accountsByCli || EMPTY_ACCOUNTS;

  const [prompt, setPrompt] = useState("");
  const [selectedByCli, setSelectedByCli] = useState<Record<CliName, string>>({
    codex: "",
    claude: "",
    gemini: "",
  });
  const [lastRequestByCli, setLastRequestByCli] = useState<Partial<Record<CliName, LaunchRequest>>>({});
  const [launchByCli, setLaunchByCli] = useState<Record<CliName, LaunchUiState>>({
    codex: emptyLaunchState(),
    claude: emptyLaunchState(),
    gemini: emptyLaunchState(),
  });

  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyStatus, setHistoryStatus] = useState("");
  const [recentSessions, setRecentSessions] = useState<SessionHistoryEntry[]>([]);
  const [resumeStateBySession, setResumeStateBySession] = useState<Record<string, LaunchUiState>>({});

  useEffect(() => {
    setSelectedByCli((prev) => {
      const next = { ...prev };
      let changed = false;
      CLI_ROWS.forEach((cli) => {
        const options = accountsByCli[cli] || [];
        const current = prev[cli];
        if (!options.length && current !== "") {
          next[cli] = "";
          changed = true;
          return;
        }
        if (options.length && (!current || !options.includes(current))) {
          next[cli] = options[0];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [accountsByCli]);

  const cliRows = useMemo(() => CLI_ROWS, []);

  async function launchViaDesktopBridge(request: LaunchRequest): Promise<void> {
    await invokeTauri<number>("launch_aih_session", {
      cli: request.cli,
      accountId: request.accountId,
      prompt: request.prompt || null,
    });
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
    void refreshRecentSessions();
  }, []);

  async function resumeSession(sessionId: string): Promise<void> {
    const promptText = prompt.trim() || "继续当前任务并闭环";
    setResumeStateBySession((prev) => ({
      ...prev,
      [sessionId]: {
        phase: "launching",
        message: "Resuming selected session...",
        hint: "",
      },
    }));

    try {
      const result = await invokeTauri<CommandResult>("run_aih", {
        args: ["codex", "auto", "exec", "resume", sessionId, promptText],
      });
      if (result.code !== 0) {
        throw new Error(`resume_failed code=${result.code}`);
      }

      setResumeStateBySession((prev) => ({
        ...prev,
        [sessionId]: {
          phase: "ok",
          message: `Resume command submitted at ${nowLabel()}.`,
          hint: `Fallback: aih codex auto exec resume ${sessionId} "${promptText}"`,
        },
      }));
      await refreshRecentSessions();
    } catch (error) {
      const raw = (error as Error)?.message || "resume_failed";
      setResumeStateBySession((prev) => ({
        ...prev,
        [sessionId]: {
          phase: "error",
          message: `Resume failed: ${raw}`,
          hint: `Diagnosis: run "aih codex auto exec resume ${sessionId} \"${promptText}\"" in terminal to inspect stderr.`,
        },
      }));
    }
  }

  async function triggerLaunch(cli: CliName, request: LaunchRequest): Promise<void> {
    setLastRequestByCli((prev) => ({ ...prev, [cli]: request }));
    setLaunchByCli((prev) => ({
      ...prev,
      [cli]: { phase: "launching", message: "Launching session...", hint: "" },
    }));

    try {
      const launchAction = props.onLaunch || launchViaDesktopBridge;
      await Promise.race([launchAction(request), timeoutAfter(LAUNCH_TIMEOUT_MS)]);
      setLaunchByCli((prev) => ({
        ...prev,
        [cli]: {
          phase: "ok",
          message: `Launch request submitted at ${nowLabel()}.`,
          hint: "If no session appears, retry once and inspect desktop runtime logs.",
        },
      }));
    } catch (error) {
      const failure = classifyFailure(cli, error);
      setLaunchByCli((prev) => ({
        ...prev,
        [cli]: {
          phase: "error",
          message: failure.message,
          hint: failure.hint,
        },
      }));
    }
  }

  return (
    <section style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Session Launcher</h3>
      <p style={{ marginTop: 0, color: "#4b5563" }}>
        One-click entry for codex/claude/gemini with optional startup prompt.
      </p>

      <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
        Optional prompt
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="one-shot instruction (optional)"
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
        />
      </label>

      <div style={{ display: "grid", gap: 10 }}>
        {cliRows.map((cli) => {
          const accounts = accountsByCli[cli] || [];
          const selected = selectedByCli[cli] || "";
          const launchState = launchByCli[cli];
          const canLaunch = Boolean(selected) && !launchBusy && launchState.phase !== "launching";
          const canRetry = launchState.phase === "error" && Boolean(lastRequestByCli[cli]);

          return (
            <article
              key={cli}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 10,
                display: "grid",
                gap: 8,
                background: "#fafafa",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>{CLI_LABEL[cli]}</strong>
                <span style={{ color: "#6b7280", fontSize: 13 }}>
                  {accounts.length ? `${accounts.length} accounts` : "No account"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label>
                  Account
                  <select
                    value={selected}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedByCli((prev) => ({ ...prev, [cli]: value }));
                    }}
                    style={{ marginLeft: 8 }}
                    disabled={!accounts.length || launchBusy}
                  >
                    {!accounts.length ? <option value="">N/A</option> : null}
                    {accounts.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  disabled={!canLaunch}
                  onClick={() => {
                    const accountId = selectedByCli[cli] || "";
                    if (!accountId) {
                      setLaunchByCli((prev) => ({
                        ...prev,
                        [cli]: {
                          phase: "error",
                          message: "No account selected for launch.",
                          hint: `Diagnosis: run "aih ${cli} ls" and ensure at least one account is available.`,
                        },
                      }));
                      return;
                    }
                    void triggerLaunch(cli, {
                      cli,
                      accountId,
                      prompt: prompt.trim() || undefined,
                    });
                  }}
                >
                  {launchState.phase === "launching" ? `Launching ${CLI_LABEL[cli]}...` : `Launch ${CLI_LABEL[cli]}`}
                </button>
                {canRetry ? (
                  <button
                    onClick={() => {
                      const request = lastRequestByCli[cli];
                      if (!request) return;
                      void triggerLaunch(cli, request);
                    }}
                    disabled={launchBusy || launchState.phase === "launching"}
                  >
                    Retry Last Launch
                  </button>
                ) : null}
              </div>
              {launchState.message ? (
                <div
                  style={{
                    marginTop: 4,
                    borderRadius: 6,
                    padding: "8px 10px",
                    background: launchState.phase === "error" ? "#fef2f2" : "#f0f9ff",
                    color: launchState.phase === "error" ? "#991b1b" : "#0c4a6e",
                    border: launchState.phase === "error" ? "1px solid #fecaca" : "1px solid #bae6fd",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{launchState.message}</div>
                  {launchState.hint ? <div>{launchState.hint}</div> : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div style={{ marginTop: 14, borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <strong>Recent Sessions (Codex)</strong>
          <button onClick={() => void refreshRecentSessions()} disabled={historyBusy}>
            {historyBusy ? "Refreshing..." : "Refresh Sessions"}
          </button>
        </div>
        <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>
          Continue-chat targets historical session_id directly.
        </p>

        {historyStatus ? (
          <div style={{ fontSize: 13, color: historyStatus.toLowerCase().includes("failed") ? "#991b1b" : "#0c4a6e" }}>
            {historyStatus}
          </div>
        ) : null}

        {recentSessions.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {recentSessions.map((entry) => {
              const resumeState = resumeStateBySession[entry.sessionId];
              const resumeBusy = resumeState?.phase === "launching";
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
                    <div>
                      <button
                        onClick={() => void resumeSession(entry.sessionId)}
                        disabled={resumeBusy || historyBusy}
                      >
                        {resumeBusy ? "Continuing..." : "Continue Chat"}
                      </button>
                    </div>
                    {resumeState?.message ? (
                      <div
                        style={{
                          borderRadius: 6,
                          padding: "8px 10px",
                          background: resumeState.phase === "error" ? "#fef2f2" : "#f0f9ff",
                          color: resumeState.phase === "error" ? "#991b1b" : "#0c4a6e",
                          border: resumeState.phase === "error" ? "1px solid #fecaca" : "1px solid #bae6fd",
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{resumeState.message}</div>
                        {resumeState.hint ? <div>{resumeState.hint}</div> : null}
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
    </section>
  );
}
