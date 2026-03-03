import { useEffect, useMemo, useState } from "react";
import SessionLauncher, { type CliAccounts, type CliName } from "./session-launcher";

interface CommandResult {
  code: number;
  ok: boolean;
  reason_code: string;
  command: string[];
  stdout: string;
  stderr: string;
}

interface CliSnapshot {
  ids: string[];
  defaultId: string;
  status: "ready" | "attention" | "error";
  reasonCode: string;
  summary: string;
  nextStep: string;
  raw: string;
}

type CliDetails = Record<CliName, CliSnapshot>;

type GuidanceState = CliSnapshot["status"];

interface Guidance {
  state: GuidanceState;
  summary: string;
  nextStep: string;
}

interface ProxyRuntimeSnapshot {
  running: boolean;
  statusLine: string;
  baseUrl: string;
  pid: string;
  raw: string;
  updatedAt: string;
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

function parseDefaultId(output: string): string {
  const lineDefault = output.match(/Default(?:\s+Account)?\s*:\s*(\d+)/i);
  if (lineDefault?.[1]) return lineDefault[1];

  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const idMatch = line.match(/Account ID:\s*(\d+)/i);
    if (!idMatch?.[1]) continue;
    if (/default|active|\*/i.test(line)) {
      return idMatch[1];
    }
  }
  return "";
}

function formatResult(result: CommandResult): string {
  const blocks = [
    `exit_code=${result.code}`,
    `ok=${result.ok}`,
    `reason_code=${result.reason_code || "AIH_PROCESS_EXIT_NONZERO"}`,
    `command=${(result.command || []).join(" ") || "n/a"}`,
  ];
  if (result.stdout.trim()) blocks.push(`stdout:\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim()) blocks.push(`stderr:\n${result.stderr.trimEnd()}`);
  return blocks.join("\n\n");
}

function normalizeReasonCode(result: CommandResult): string {
  const explicitCode = (result.reason_code || "").trim();
  if (explicitCode) return explicitCode;

  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (combined.includes("core_runtime_not_found")) return "CORE_RUNTIME_NOT_FOUND";
  if (combined.includes("core_node_not_found") || combined.includes("node runtime not found")) {
    return "CORE_NODE_NOT_FOUND";
  }
  return result.code === 0 ? "AIH_OK" : "AIH_PROCESS_EXIT_NONZERO";
}

function guidanceForReasonCode(reasonCode: string): Guidance {
  const map: Record<string, Guidance> = {
    AIH_OK: {
      state: "ready",
      summary: "Account data is healthy.",
      nextStep: "No action needed.",
    },
    AIH_RUNTIME_NOT_FOUND: {
      state: "error",
      summary: "Packaged runtime resources are missing.",
      nextStep: "Set AIH_DESKTOP_ROOT to a directory containing bin/ai-home.js, or reinstall desktop bundle.",
    },
    CORE_RUNTIME_NOT_FOUND: {
      state: "error",
      summary: "Runtime root cannot be resolved.",
      nextStep: "Set AIH_DESKTOP_ROOT correctly, then click Refresh.",
    },
    CORE_NODE_NOT_FOUND: {
      state: "error",
      summary: "Node runtime is not available for desktop backend.",
      nextStep: "Install node or set AIH_DESKTOP_NODE to a valid node binary.",
    },
    CORE_AIH_EXEC_FAILED: {
      state: "error",
      summary: "Desktop backend failed to execute `aih`.",
      nextStep: "Verify node runtime and desktop backend permissions, then retry.",
    },
    AIH_INVALID_ARGS: {
      state: "error",
      summary: "Command arguments are invalid.",
      nextStep: "Reopen dashboard and retry; if persistent, report command payload to maintainer.",
    },
    AIH_ACCOUNT_LIST_FAILED: {
      state: "attention",
      summary: "Account list failed to load for this tool.",
      nextStep: "Run `aih <tool> ls` in terminal to inspect auth/account state.",
    },
    AIH_ACCOUNT_SET_DEFAULT_FAILED: {
      state: "attention",
      summary: "Set-default command failed.",
      nextStep: "Validate account ID exists for selected tool, then retry set-default.",
    },
    AIH_ACCOUNT_ADD_FAILED: {
      state: "attention",
      summary: "Account add/login command failed.",
      nextStep: "Run `aih <tool> add` in terminal and complete interactive auth.",
    },
    AIH_PROCESS_EXIT_NONZERO: {
      state: "error",
      summary: "CLI process exited with non-zero status.",
      nextStep: "Inspect raw stdout/stderr below and follow reported error hint.",
    },
  };
  return map[reasonCode] || map.AIH_PROCESS_EXIT_NONZERO;
}

function nowLabel(): string {
  return new Date().toLocaleString();
}

function parseProxyRuntimeSnapshot(result: CommandResult): ProxyRuntimeSnapshot {
  const text = `${result.stdout}\n${result.stderr}`;
  const running = /\bproxy is running\b/i.test(text);
  const stopped = /\bproxy is not running\b/i.test(text);
  const statusLine = running ? "running" : (stopped ? "stopped" : "unknown");
  const pidMatch = text.match(/\bpid=(\d+)\b/i);
  const baseUrlMatch = text.match(/\bbase_url:\s*(\S+)/i);

  return {
    running,
    statusLine,
    baseUrl: baseUrlMatch?.[1] || "",
    pid: pidMatch?.[1] || "",
    raw: formatResult(result),
    updatedAt: nowLabel(),
  };
}

export default function DashboardView() {
  const [selectedCli, setSelectedCli] = useState<CliName>("codex");
  const [cliDetails, setCliDetails] = useState<CliDetails>({
    codex: { ids: [], defaultId: "", status: "ready", reasonCode: "AIH_OK", summary: "Awaiting refresh.", nextStep: "Click Refresh.", raw: "" },
    claude: { ids: [], defaultId: "", status: "ready", reasonCode: "AIH_OK", summary: "Awaiting refresh.", nextStep: "Click Refresh.", raw: "" },
    gemini: { ids: [], defaultId: "", status: "ready", reasonCode: "AIH_OK", summary: "Awaiting refresh.", nextStep: "Click Refresh.", raw: "" },
  });
  const [defaultInput, setDefaultInput] = useState("");
  const [overview, setOverview] = useState("Loading account overview...");
  const [status, setStatus] = useState("");
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [proxyBusy, setProxyBusy] = useState(false);
  const [proxyPortInput, setProxyPortInput] = useState("8317");
  const [proxyApiKeyInput, setProxyApiKeyInput] = useState("");
  const [proxyApplyStatus, setProxyApplyStatus] = useState("No serve config applied yet.");
  const [proxyRuntime, setProxyRuntime] = useState<ProxyRuntimeSnapshot>({
    running: false,
    statusLine: "unknown",
    baseUrl: "",
    pid: "",
    raw: "No proxy status yet.",
    updatedAt: "",
  });

  const accountOptions = useMemo(() => cliDetails[selectedCli]?.ids || [], [cliDetails, selectedCli]);

  const accountsByCli = useMemo<CliAccounts>(
    () => ({
      codex: cliDetails.codex.ids,
      claude: cliDetails.claude.ids,
      gemini: cliDetails.gemini.ids,
    }),
    [cliDetails]
  );

  const usageSummary = useMemo(() => {
    const toolsReady = (["codex", "claude", "gemini"] as CliName[]).filter(
      (cli) => cliDetails[cli].status === "ready"
    ).length;
    const totalAccounts =
      cliDetails.codex.ids.length + cliDetails.claude.ids.length + cliDetails.gemini.ids.length;
    const defaultsConfigured = (["codex", "claude", "gemini"] as CliName[]).filter(
      (cli) => Boolean(cliDetails[cli].defaultId)
    ).length;

    return {
      toolsReady,
      totalAccounts,
      defaultsConfigured,
    };
  }, [cliDetails]);

  useEffect(() => {
    const inferred = cliDetails[selectedCli]?.defaultId || accountOptions[0] || "";
    setDefaultInput(inferred);
  }, [selectedCli, cliDetails, accountOptions]);

  function pushAction(text: string): void {
    const line = `${nowLabel()} - ${text}`;
    setRecentActions((prev) => [line, ...prev].slice(0, 8));
  }

  async function refreshData() {
    setBusy(true);
    setStatus("");
    try {
      const overviewResult = await invokeTauri<CommandResult>("run_aih", { args: ["ls"] });
      setOverview(formatResult(overviewResult));

      const cliNames: CliName[] = ["codex", "claude", "gemini"];
      const detailResults = await Promise.all(
        cliNames.map((cli) => invokeTauri<CommandResult>("run_aih", { args: [cli, "ls"] }))
      );

      const nextDetails = { ...cliDetails };
      cliNames.forEach((cli, index) => {
        const result = detailResults[index];
        const reasonCode = normalizeReasonCode(result);
        const guidance = guidanceForReasonCode(reasonCode);
        nextDetails[cli] = {
          ids: parseAccountIds(result.stdout),
          defaultId: parseDefaultId(result.stdout),
          status: guidance.state,
          reasonCode,
          summary: guidance.summary,
          nextStep: guidance.nextStep.replace("<tool>", cli),
          raw: formatResult(result),
        };
      });
      setCliDetails(nextDetails);
      pushAction("Dashboard data refreshed");
      await refreshProxyStatus();
    } catch (error) {
      setOverview(`Failed to load dashboard data: ${(error as Error).message}`);
      setStatus(`Refresh failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshProxyStatus() {
    setProxyBusy(true);
    try {
      const result = await invokeTauri<CommandResult>("run_aih", { args: ["proxy", "status"] });
      const snapshot = parseProxyRuntimeSnapshot(result);
      setProxyRuntime(snapshot);
      pushAction(`Proxy status refreshed (${snapshot.statusLine})`);
    } catch (error) {
      setProxyRuntime((prev) => ({
        ...prev,
        raw: `Proxy status failed: ${(error as Error).message}`,
        updatedAt: nowLabel(),
      }));
      setProxyApplyStatus(`Proxy status failed: ${(error as Error).message}`);
    } finally {
      setProxyBusy(false);
    }
  }

  async function applyProxyServeConfig() {
    const port = proxyPortInput.trim();
    if (port && !/^\d+$/.test(port)) {
      setProxyApplyStatus("Port must be a number.");
      return;
    }

    setProxyBusy(true);
    try {
      const args = ["proxy", "restart"];
      if (port) {
        args.push("--port", port);
      }
      if (proxyApiKeyInput.trim()) {
        // proxy serve currently maps api_key semantics to client-key auth.
        args.push("--client-key", proxyApiKeyInput.trim());
      }

      const result = await invokeTauri<CommandResult>("run_aih", { args });
      setProxyApplyStatus(formatResult(result));
      pushAction("Proxy config applied and restart triggered");
      const snapshot = parseProxyRuntimeSnapshot(result);
      if (snapshot.statusLine !== "unknown") {
        setProxyRuntime(snapshot);
      }
      await refreshProxyStatus();
    } catch (error) {
      setProxyApplyStatus(`Apply/restart failed: ${(error as Error).message}`);
    } finally {
      setProxyBusy(false);
    }
  }

  async function setDefaultAccount() {
    if (!defaultInput.trim()) {
      setStatus("Default account ID is required.");
      return;
    }

    setBusy(true);
    try {
      const result = await invokeTauri<CommandResult>("run_aih", {
        args: [selectedCli, "set-default", defaultInput.trim()],
      });
      setStatus(formatResult(result));
      pushAction(`Default account changed: ${selectedCli} -> ${defaultInput.trim()}`);
      await refreshData();
    } catch (error) {
      setStatus(`Set default failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function launchSession(request: { cli: CliName; accountId: string; prompt?: string }) {
    setBusy(true);
    try {
      const pid = await invokeTauri<number>("launch_aih_session", {
        cli: request.cli,
        accountId: request.accountId,
        prompt: request.prompt || null,
      });
      setStatus(`Session process started. pid=${pid}`);
      pushAction(`Launched ${request.cli} session on account ${request.accountId} (pid=${pid})`);
    } catch (error) {
      setStatus(`Launch session failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshData();
  }, []);

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Tool:
          <select
            value={selectedCli}
            onChange={(event) => setSelectedCli(event.target.value as CliName)}
            style={{ marginLeft: 8 }}
          >
            <option value="codex">codex</option>
            <option value="claude">claude</option>
            <option value="gemini">gemini</option>
          </select>
        </label>
        <button onClick={() => void refreshData()} disabled={busy}>
          Refresh
        </button>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Dashboard Summary</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <div style={{ background: "#f8fafc", borderRadius: 6, padding: 10 }}>
            <strong>Tools Ready</strong>
            <div>{usageSummary.toolsReady} / 3</div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 6, padding: 10 }}>
            <strong>Total Accounts</strong>
            <div>{usageSummary.totalAccounts}</div>
          </div>
          <div style={{ background: "#f8fafc", borderRadius: 6, padding: 10 }}>
            <strong>Defaults Configured</strong>
            <div>{usageSummary.defaultsConfigured} / 3</div>
          </div>
        </div>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Account Status ({selectedCli})</h3>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          status: <strong>{cliDetails[selectedCli].status}</strong> | code: <strong>{cliDetails[selectedCli].reasonCode}</strong> | default: <strong>{cliDetails[selectedCli].defaultId || "N/A"}</strong>
        </p>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          available IDs: {accountOptions.join(", ") || "none"}
        </p>
        <div
          style={{
            marginBottom: 10,
            borderRadius: 6,
            padding: "8px 10px",
            background:
              cliDetails[selectedCli].status === "ready"
                ? "#f0fdf4"
                : cliDetails[selectedCli].status === "attention"
                  ? "#fffbeb"
                  : "#fef2f2",
            border:
              cliDetails[selectedCli].status === "ready"
                ? "1px solid #bbf7d0"
                : cliDetails[selectedCli].status === "attention"
                  ? "1px solid #fde68a"
                  : "1px solid #fecaca",
            color:
              cliDetails[selectedCli].status === "ready"
                ? "#166534"
                : cliDetails[selectedCli].status === "attention"
                  ? "#92400e"
                  : "#991b1b",
          }}
        >
          <div style={{ fontWeight: 600 }}>{cliDetails[selectedCli].summary}</div>
          <div>{cliDetails[selectedCli].nextStep}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <label>
            Default ID
            <input
              value={defaultInput}
              onChange={(event) => setDefaultInput(event.target.value)}
              placeholder="e.g. 1"
              style={{ marginLeft: 8 }}
            />
          </label>
          <button onClick={() => void setDefaultAccount()} disabled={busy}>
            Set Default
          </button>
        </div>

        <details>
          <summary>Raw {selectedCli} output</summary>
          <pre
            style={{
              marginTop: 8,
              whiteSpace: "pre-wrap",
              background: "#f8fafc",
              borderRadius: 6,
              padding: 10,
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            {cliDetails[selectedCli].raw || "No output yet."}
          </pre>
        </details>
      </div>

      <SessionLauncher accountsByCli={accountsByCli} busy={busy} onLaunch={launchSession} />

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Proxy Serve Control</h3>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          status: <strong>{proxyRuntime.statusLine}</strong>
          {proxyRuntime.pid ? ` | pid: ${proxyRuntime.pid}` : ""}
          {proxyRuntime.baseUrl ? ` | base_url: ${proxyRuntime.baseUrl}` : ""}
        </p>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          last update: {proxyRuntime.updatedAt || "N/A"}
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <label>
            Port
            <input
              value={proxyPortInput}
              onChange={(event) => setProxyPortInput(event.target.value)}
              placeholder="8317"
              style={{ marginLeft: 8 }}
            />
          </label>
          <label>
            API Key
            <input
              value={proxyApiKeyInput}
              onChange={(event) => setProxyApiKeyInput(event.target.value)}
              placeholder="optional"
              style={{ marginLeft: 8, minWidth: 180 }}
            />
          </label>
          <button onClick={() => void applyProxyServeConfig()} disabled={proxyBusy}>
            Apply + Restart
          </button>
          <button onClick={() => void refreshProxyStatus()} disabled={proxyBusy}>
            Refresh Proxy Status
          </button>
        </div>

        <details>
          <summary>Last apply result</summary>
          <pre
            style={{
              marginTop: 8,
              whiteSpace: "pre-wrap",
              background: "#f8fafc",
              borderRadius: 6,
              padding: 10,
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            {proxyApplyStatus}
          </pre>
        </details>

        <details>
          <summary>Raw proxy status output</summary>
          <pre
            style={{
              marginTop: 8,
              whiteSpace: "pre-wrap",
              background: "#f8fafc",
              borderRadius: 6,
              padding: 10,
              maxHeight: 220,
              overflow: "auto",
            }}
          >
            {proxyRuntime.raw}
          </pre>
        </details>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Recent Actions</h3>
        {recentActions.length === 0 ? (
          <p style={{ margin: 0, color: "#4b5563" }}>No recent actions.</p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {recentActions.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Raw Overview (`aih ls`)</h3>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            background: "#f8fafc",
            borderRadius: 6,
            padding: 10,
            maxHeight: 240,
            overflow: "auto",
          }}
        >
          {overview}
        </pre>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Action Status</h3>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            background: "#f8fafc",
            borderRadius: 6,
            padding: 10,
            minHeight: 42,
          }}
        >
          {status || "No action yet."}
        </pre>
      </div>
    </section>
  );
}
