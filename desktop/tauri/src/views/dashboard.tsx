import { useEffect, useMemo, useState } from "react";
import SessionLauncher, { type CliAccounts, type CliName } from "./session-launcher";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface CliSnapshot {
  ids: string[];
  defaultId: string;
  status: "ready" | "error";
  raw: string;
}

type CliDetails = Record<CliName, CliSnapshot>;

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
  const blocks = [`exit_code=${result.code}`];
  if (result.stdout.trim()) blocks.push(`stdout:\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim()) blocks.push(`stderr:\n${result.stderr.trimEnd()}`);
  return blocks.join("\n\n");
}

function nowLabel(): string {
  return new Date().toLocaleString();
}

export default function DashboardView() {
  const [selectedCli, setSelectedCli] = useState<CliName>("codex");
  const [cliDetails, setCliDetails] = useState<CliDetails>({
    codex: { ids: [], defaultId: "", status: "ready", raw: "" },
    claude: { ids: [], defaultId: "", status: "ready", raw: "" },
    gemini: { ids: [], defaultId: "", status: "ready", raw: "" },
  });
  const [defaultInput, setDefaultInput] = useState("");
  const [overview, setOverview] = useState("Loading account overview...");
  const [status, setStatus] = useState("");
  const [recentActions, setRecentActions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

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
        nextDetails[cli] = {
          ids: parseAccountIds(result.stdout),
          defaultId: parseDefaultId(result.stdout),
          status: result.code === 0 ? "ready" : "error",
          raw: formatResult(result),
        };
      });
      setCliDetails(nextDetails);
      pushAction("Dashboard data refreshed");
    } catch (error) {
      setOverview(`Failed to load dashboard data: ${(error as Error).message}`);
      setStatus(`Refresh failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
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
          status: <strong>{cliDetails[selectedCli].status}</strong> | default: <strong>{cliDetails[selectedCli].defaultId || "N/A"}</strong>
        </p>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          available IDs: {accountOptions.join(", ") || "none"}
        </p>

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
