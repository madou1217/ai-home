import { useMemo, useState } from "react";

type RunPhase = "idle" | "running" | "success" | "error";

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface RunSnapshot {
  phase: RunPhase;
  commandLabel: string;
  result?: CommandResult;
  message: string;
  startedAt?: number;
  finishedAt?: number;
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

function formatResult(result: CommandResult): string {
  const lines = [`exit_code=${result.code}`];
  if (result.stdout.trim()) lines.push(`stdout:\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim()) lines.push(`stderr:\n${result.stderr.trimEnd()}`);
  return lines.join("\n\n");
}

function formatTime(ts?: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

export default function MigrationView() {
  const [exportFile, setExportFile] = useState("backup.aes");
  const [selectors, setSelectors] = useState("");
  const [importFile, setImportFile] = useState("backup.aes");
  const [overwrite, setOverwrite] = useState(false);
  const [snapshot, setSnapshot] = useState<RunSnapshot>({
    phase: "idle",
    commandLabel: "-",
    message: "No migration command executed.",
  });

  const running = snapshot.phase === "running";

  const phaseColor = useMemo(() => {
    if (snapshot.phase === "success") return "#166534";
    if (snapshot.phase === "error") return "#991b1b";
    if (snapshot.phase === "running") return "#1d4ed8";
    return "#4b5563";
  }, [snapshot.phase]);

  async function runCommand(commandLabel: string, args: string[]) {
    const startedAt = Date.now();
    setSnapshot({
      phase: "running",
      commandLabel,
      message: "Command started...",
      startedAt,
    });

    try {
      const result = await invokeTauri<CommandResult>("run_aih", { args });
      const success = result.code === 0;
      setSnapshot({
        phase: success ? "success" : "error",
        commandLabel,
        result,
        message: success ? "Command completed successfully." : "Command finished with errors.",
        startedAt,
        finishedAt: Date.now(),
      });
    } catch (error) {
      setSnapshot({
        phase: "error",
        commandLabel,
        message: `Command failed: ${(error as Error).message}`,
        startedAt,
        finishedAt: Date.now(),
      });
    }
  }

  async function runExport() {
    const exportTarget = exportFile.trim();
    if (!exportTarget) {
      setSnapshot({
        phase: "error",
        commandLabel: "export",
        message: "Export file path is required.",
      });
      return;
    }

    const selectorList = selectors
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    await runCommand("export", ["export", exportTarget, ...selectorList]);
  }

  async function runImport() {
    const importTarget = importFile.trim();
    if (!importTarget) {
      setSnapshot({
        phase: "error",
        commandLabel: "import",
        message: "Import file path is required.",
      });
      return;
    }

    const args = overwrite ? ["import", "-o", importTarget] : ["import", importTarget];
    await runCommand("import", args);
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Export Profiles</h3>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Example selectors: <code>codex:1,2</code> <code>gemini</code>
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            Output file
            <input
              value={exportFile}
              onChange={(event) => setExportFile(event.target.value)}
              style={{ marginLeft: 8, width: "70%" }}
            />
          </label>
          <label>
            Optional selectors
            <input
              value={selectors}
              onChange={(event) => setSelectors(event.target.value)}
              placeholder="codex:1,2 gemini"
              style={{ marginLeft: 8, width: "70%" }}
            />
          </label>
          <button onClick={() => void runExport()} disabled={running}>
            {running && snapshot.commandLabel === "export" ? "Running Export..." : "Run Export"}
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Import Profiles</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            Input file
            <input
              value={importFile}
              onChange={(event) => setImportFile(event.target.value)}
              style={{ marginLeft: 8, width: "70%" }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
              style={{ marginRight: 8 }}
            />
            Overwrite existing accounts (`-o`)
          </label>
          <button onClick={() => void runImport()} disabled={running}>
            {running && snapshot.commandLabel === "import" ? "Running Import..." : "Run Import"}
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Execution Status</h3>
        <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
          <div>
            Phase: <strong style={{ color: phaseColor }}>{snapshot.phase}</strong>
          </div>
          <div>
            Command: <strong>{snapshot.commandLabel}</strong>
          </div>
          <div>
            Started: <strong>{formatTime(snapshot.startedAt)}</strong>
          </div>
          <div>
            Finished: <strong>{formatTime(snapshot.finishedAt)}</strong>
          </div>
          <div>{snapshot.message}</div>
        </div>
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            background: "#f8fafc",
            borderRadius: 6,
            padding: 10,
            minHeight: 80,
          }}
        >
          {snapshot.result ? formatResult(snapshot.result) : "No command output yet."}
        </pre>
      </div>
    </section>
  );
}
