import { useEffect, useMemo, useState } from "react";

type RunPhase = "idle" | "validating" | "running" | "success" | "error";
type MigrationOperation = "export" | "import";

interface ProgressEvent {
  channel: string;
  current?: number;
  total?: number;
  message: string;
}

interface MigrationResult {
  operation: MigrationOperation;
  success: boolean;
  exitCode: number;
  reasonCode?: string;
  summary?: string;
  command: string[];
  progress: ProgressEvent[];
  stdout: string;
  stderr: string;
}

interface RunSnapshot {
  phase: RunPhase;
  commandLabel: MigrationOperation | "-";
  result?: MigrationResult;
  message: string;
  startedAt?: number;
  finishedAt?: number;
  reasonCode?: string;
}

interface RunAction {
  commandLabel: MigrationOperation;
  command: string;
  payload: Record<string, unknown>;
}

const REASON_GUIDANCE: Record<string, string> = {
  MIGRATION_INVALID_INPUT: "Check file path and selector format, then retry.",
  MIGRATION_SOURCE_NOT_FOUND: "Confirm the source file exists and is readable.",
  MIGRATION_SELECTOR_EMPTY: "No profiles matched selectors. Remove or broaden selectors.",
  MIGRATION_INTERACTIVE_REQUIRED: "Run migration from terminal if interactive prompts are required.",
  MIGRATION_SECRET_INVALID: "Use a non-empty secret and retry.",
  MIGRATION_SECRET_MISMATCH: "Ensure secrets match before retrying.",
  MIGRATION_DECRYPT_FAILED: "Verify archive secret/key and retry import.",
  MIGRATION_ENCRYPT_FAILED: "Check secret/key setup and retry export.",
  MIGRATION_KEY_UNAVAILABLE: "Configure SSH/age keys before running migration.",
  MIGRATION_DEPENDENCY_MISSING: "Install required dependency (age CLI) and retry.",
  MIGRATION_FORMAT_UNSUPPORTED: "Use a supported export archive/version.",
  MIGRATION_PROCESS_EXIT_NONZERO: "Inspect stderr details and retry after fixing root cause.",
};

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

function formatProgress(progress: ProgressEvent[]): string {
  if (!progress.length) return "none";
  return progress
    .map((event) => {
      const hasStage = Number.isFinite(event.current) && Number.isFinite(event.total);
      const stage = hasStage ? ` [${event.current}/${event.total}]` : "";
      return `[${event.channel}]${stage} ${event.message}`;
    })
    .join("\n");
}

function formatResult(result: MigrationResult): string {
  const lines = [
    `operation=${result.operation}`,
    `success=${result.success}`,
    `exit_code=${result.exitCode}`,
  ];
  if (result.reasonCode) lines.push(`reason=${result.reasonCode}`);
  if (result.summary) lines.push(`summary=${result.summary}`);
  if (result.command?.length) lines.push(`command=${result.command.join(" ")}`);
  lines.push(`progress:\n${formatProgress(result.progress || [])}`);
  if (result.stdout.trim()) lines.push(`stdout:\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim()) lines.push(`stderr:\n${result.stderr.trimEnd()}`);
  return lines.join("\n\n");
}

function formatTime(ts?: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const secs = (totalSec % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function resolveRecoveryText(result?: MigrationResult, fallbackMessage?: string): string {
  if (result?.reasonCode && REASON_GUIDANCE[result.reasonCode]) {
    return REASON_GUIDANCE[result.reasonCode];
  }
  if (result?.reasonCode) {
    return `Review command output and retry. reason=${result.reasonCode}`;
  }
  if (fallbackMessage) {
    return "Confirm Tauri bridge/command availability, then retry.";
  }
  return "Adjust input or environment and retry.";
}

export default function MigrationView() {
  const [exportFile, setExportFile] = useState("backup.aes");
  const [selectors, setSelectors] = useState("");
  const [importFile, setImportFile] = useState("backup.aes");
  const [overwrite, setOverwrite] = useState(false);
  const [lastAction, setLastAction] = useState<RunAction | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<RunSnapshot>({
    phase: "idle",
    commandLabel: "-",
    message: "No migration command executed.",
  });

  const running = snapshot.phase === "running" || snapshot.phase === "validating";

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const phaseColor = useMemo(() => {
    if (snapshot.phase === "success") return "#166534";
    if (snapshot.phase === "error") return "#991b1b";
    if (snapshot.phase === "validating") return "#7c3aed";
    if (snapshot.phase === "running") return "#1d4ed8";
    return "#4b5563";
  }, [snapshot.phase]);

  const elapsed = useMemo(() => {
    if (!snapshot.startedAt) return "-";
    const end = running ? clock : (snapshot.finishedAt || clock);
    return formatDuration(Math.max(0, end - snapshot.startedAt));
  }, [snapshot.startedAt, snapshot.finishedAt, running, clock]);

  const recoveryText = useMemo(() => {
    if (snapshot.phase !== "error") return "";
    return resolveRecoveryText(snapshot.result, snapshot.message);
  }, [snapshot.phase, snapshot.result, snapshot.message]);

  async function runCommand(
    commandLabel: MigrationOperation,
    command: string,
    payload: Record<string, unknown>,
  ) {
    const startedAt = Date.now();
    setSnapshot({
      phase: "validating",
      commandLabel,
      message: "Checking migration command availability...",
      startedAt,
    });
    setLastAction({ commandLabel, command, payload });

    try {
      await invokeTauri("migration_namespace_info", {});
      setSnapshot({
        phase: "running",
        commandLabel,
        message: "Command is running...",
        startedAt,
      });

      const result = await invokeTauri<MigrationResult>(command, payload);
      const success = result.success;
      setSnapshot({
        phase: success ? "success" : "error",
        commandLabel,
        result,
        reasonCode: result.reasonCode,
        message: success ? "Command completed successfully." : "Command finished with errors.",
        startedAt,
        finishedAt: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSnapshot({
        phase: "error",
        commandLabel,
        message: `Command failed: ${message}`,
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

    await runCommand("export", "migration_export_trigger", {
      request: {
        targetFile: exportTarget,
        selectors: selectorList,
      },
    });
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

    await runCommand("import", "migration_import_trigger", {
      request: {
        sourceFile: importTarget,
        overwrite,
      },
    });
  }

  async function retryLastAction() {
    if (!lastAction || running) return;
    await runCommand(lastAction.commandLabel, lastAction.command, lastAction.payload);
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
            Elapsed: <strong>{elapsed}</strong>
          </div>
          <div>
            Started: <strong>{formatTime(snapshot.startedAt)}</strong>
          </div>
          <div>
            Finished: <strong>{formatTime(snapshot.finishedAt)}</strong>
          </div>
          <div>{snapshot.message}</div>
          {snapshot.reasonCode ? (
            <div>
              Reason code: <strong>{snapshot.reasonCode}</strong>
            </div>
          ) : null}
          {snapshot.phase === "error" ? (
            <div style={{ color: "#991b1b" }}>
              Next action: <strong>{recoveryText}</strong>
            </div>
          ) : null}
          {snapshot.result?.progress?.length ? (
            <div style={{ display: "grid", gap: 4 }}>
              <strong>Progress timeline</strong>
              {snapshot.result.progress.map((event, idx) => {
                const hasStage = Number.isFinite(event.current) && Number.isFinite(event.total);
                const stage = hasStage ? ` (${event.current}/${event.total})` : "";
                return (
                  <div key={`${event.channel}-${idx}`} style={{ color: "#374151" }}>
                    [{event.channel}]{stage} {event.message}
                  </div>
                );
              })}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => void retryLastAction()} disabled={!lastAction || running}>
              Retry Last Command
            </button>
            <button
              onClick={() => setImportFile(exportFile.trim() || importFile)}
              disabled={running}
            >
              Use Export Path For Import
            </button>
            <button
              onClick={() =>
                setSnapshot({
                  phase: "idle",
                  commandLabel: "-",
                  message: "Status reset. Ready for next migration command.",
                })
              }
              disabled={running}
            >
              Reset Status
            </button>
          </div>
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
