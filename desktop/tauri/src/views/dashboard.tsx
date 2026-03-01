import { useEffect, useMemo, useState } from "react";

type CliName = "codex" | "claude" | "gemini";
type CliAccounts = Record<CliName, string[]>;

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
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
  const regex = /Account ID:\s*(\d+)/g;
  let match: RegExpExecArray | null = regex.exec(output);
  while (match) {
    idSet.add(match[1]);
    match = regex.exec(output);
  }
  return Array.from(idSet).sort((a, b) => Number(a) - Number(b));
}

function formatResult(result: CommandResult): string {
  const parts = [`exit_code=${result.code}`];
  if (result.stdout.trim()) {
    parts.push(`stdout:\n${result.stdout.trimEnd()}`);
  }
  if (result.stderr.trim()) {
    parts.push(`stderr:\n${result.stderr.trimEnd()}`);
  }
  return parts.join("\n\n");
}

export default function DashboardView() {
  const [selectedCli, setSelectedCli] = useState<CliName>("codex");
  const [accountsByCli, setAccountsByCli] = useState<CliAccounts>({
    codex: [],
    claude: [],
    gemini: [],
  });
  const [defaultId, setDefaultId] = useState("");
  const [launchId, setLaunchId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [overview, setOverview] = useState("Loading account overview...");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const accountOptions = useMemo(() => accountsByCli[selectedCli] || [], [accountsByCli, selectedCli]);

  useEffect(() => {
    if (!accountOptions.length) return;
    if (!defaultId || !accountOptions.includes(defaultId)) {
      setDefaultId(accountOptions[0]);
    }
    if (!launchId || !accountOptions.includes(launchId)) {
      setLaunchId(accountOptions[0]);
    }
  }, [accountOptions, defaultId, launchId]);

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

      const nextState = { codex: [], claude: [], gemini: [] } as CliAccounts;
      cliNames.forEach((cli, index) => {
        nextState[cli] = parseAccountIds(detailResults[index].stdout);
      });
      setAccountsByCli(nextState);
    } catch (error) {
      setOverview(`Failed to load dashboard data: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function setDefaultAccount() {
    if (!defaultId.trim()) {
      setStatus("Default account ID is required.");
      return;
    }
    setBusy(true);
    try {
      const result = await invokeTauri<CommandResult>("run_aih", {
        args: [selectedCli, "set-default", defaultId.trim()],
      });
      setStatus(formatResult(result));
      await refreshData();
    } catch (error) {
      setStatus(`Set default failed: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function launchSession() {
    if (!launchId.trim()) {
      setStatus("Launch account ID is required.");
      return;
    }
    setBusy(true);
    try {
      const pid = await invokeTauri<number>("launch_aih_session", {
        cli: selectedCli,
        accountId: launchId.trim(),
        prompt: prompt.trim() || null,
      });
      setStatus(`Session process started. pid=${pid}`);
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
        <h3 style={{ marginTop: 0 }}>Account Dashboard</h3>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Available IDs for <strong>{selectedCli}</strong>: {accountOptions.join(", ") || "none"}
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <label>
            Default ID
            <input
              value={defaultId}
              onChange={(event) => setDefaultId(event.target.value)}
              placeholder="e.g. 1"
              style={{ marginLeft: 8 }}
            />
          </label>
          <button onClick={() => void setDefaultAccount()} disabled={busy}>
            Set Default
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label>
            Launch ID
            <input
              value={launchId}
              onChange={(event) => setLaunchId(event.target.value)}
              placeholder="e.g. 1"
              style={{ marginLeft: 8 }}
            />
          </label>
          <label>
            Optional prompt
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="one-shot instruction (optional)"
              style={{ marginLeft: 8, width: "100%" }}
            />
          </label>
          <button onClick={() => void launchSession()} disabled={busy}>
            Launch Session
          </button>
        </div>
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
            maxHeight: 280,
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
