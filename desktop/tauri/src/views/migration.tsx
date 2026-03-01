import { useState } from "react";

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

function formatResult(result: CommandResult): string {
  const lines = [`exit_code=${result.code}`];
  if (result.stdout.trim()) lines.push(`stdout:\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim()) lines.push(`stderr:\n${result.stderr.trimEnd()}`);
  return lines.join("\n\n");
}

export default function MigrationView() {
  const [exportFile, setExportFile] = useState("backup.aes");
  const [selectors, setSelectors] = useState("");
  const [importFile, setImportFile] = useState("backup.aes");
  const [overwrite, setOverwrite] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("No migration command executed.");

  async function runExport() {
    const exportTarget = exportFile.trim();
    if (!exportTarget) {
      setStatus("Export file path is required.");
      return;
    }
    const selectorList = selectors
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const args = ["export", exportTarget, ...selectorList];
    setRunning(true);
    try {
      const result = await invokeTauri<CommandResult>("run_aih", { args });
      setStatus(formatResult(result));
    } catch (error) {
      setStatus(`Export failed: ${(error as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function runImport() {
    const importTarget = importFile.trim();
    if (!importTarget) {
      setStatus("Import file path is required.");
      return;
    }

    const args = overwrite ? ["import", "-o", importTarget] : ["import", importTarget];
    setRunning(true);
    try {
      const result = await invokeTauri<CommandResult>("run_aih", { args });
      setStatus(formatResult(result));
    } catch (error) {
      setStatus(`Import failed: ${(error as Error).message}`);
    } finally {
      setRunning(false);
    }
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
            Run Export
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
            Run Import
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Command Output</h3>
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
          {status}
        </pre>
      </div>
    </section>
  );
}
