import { useEffect, useMemo, useState } from "react";
import SessionsView from "./sessions";

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

const CLI_LABEL: Record<CliName, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
};

const CLI_ROWS: CliName[] = ["codex", "claude", "gemini"];
const LAUNCH_TIMEOUT_MS = 15000;
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

      <SessionsView prompt={prompt} />
    </section>
  );
}
