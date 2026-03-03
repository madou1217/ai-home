import { useMemo, useState } from "react";

type CliName = "codex" | "claude" | "gemini";

interface AuthCommandData {
  cliName: string;
  accountId: string;
  apiKeyConfigured: boolean;
  apiKeyPreview?: string | null;
  baseUrl?: string | null;
  command: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface AuthCommandResponse {
  namespace: string;
  action: string;
  ok: boolean;
  code: string;
  message: string;
  data: AuthCommandData;
  commands: string[];
  errorCodes: string[];
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

const CLI_OPTIONS: CliName[] = ["codex", "claude", "gemini"];
const CLI_LABEL: Record<CliName, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
};

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invokeFn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invokeFn) throw new Error("tauri_invoke_unavailable");
  return invokeFn<T>(cmd, args ?? {});
}

function maskApiKey(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function validAccountId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function validBaseUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "unknown_error");
}

export default function AuthSettingsView() {
  const [cli, setCli] = useState<CliName>("codex");
  const [accountId, setAccountId] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [result, setResult] = useState<AuthCommandResponse | null>(null);

  const accountIdOk = useMemo(() => validAccountId(accountId), [accountId]);
  const baseUrlOk = useMemo(() => validBaseUrl(baseUrlInput), [baseUrlInput]);
  const baseUrlDisabled = cli === "gemini";

  const canLoad = accountIdOk && !busy;
  const canSave =
    accountIdOk &&
    !busy &&
    baseUrlOk &&
    (!!apiKeyInput.trim() || (!!baseUrlInput.trim() && !baseUrlDisabled));
  const canOAuth = accountIdOk && !busy;

  async function runAction(
    actionName: string,
    cmd: string,
    args?: Record<string, unknown>,
    onSuccess?: (resp: AuthCommandResponse) => void
  ) {
    setBusy(true);
    setStatus(`${actionName}...`);
    try {
      const resp = await invokeTauri<AuthCommandResponse>(cmd, args);
      setResult(resp);
      setStatus(`${actionName} finished: ${resp.code}`);
      if (onSuccess) onSuccess(resp);
    } catch (error) {
      setStatus(`${actionName} failed: ${parseError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function loadConfig() {
    if (!canLoad) return;
    void runAction("Load config", "auth_get_config", { cli, accountId }, (resp) => {
      setApiKeyInput("");
      setBaseUrlInput(resp.data.baseUrl || "");
    });
  }

  function saveConfig() {
    if (!canSave) return;
    const payload: Record<string, unknown> = { cli, accountId };
    if (apiKeyInput.trim()) payload.apiKey = apiKeyInput.trim();
    if (!baseUrlDisabled && baseUrlInput.trim()) payload.baseUrl = baseUrlInput.trim();

    void runAction("Save config", "auth_set_config", payload);
  }

  function triggerOAuth() {
    if (!canOAuth) return;
    void runAction("OAuth trigger", "auth_trigger_oauth", { cli, accountId });
  }

  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        background: "#ffffff",
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Auth Settings</h2>
      <p style={{ margin: "0 0 16px", color: "#4b5563" }}>
        Configure OAuth/API credentials by cli + account id, and verify current stored settings.
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>CLI</span>
          <select value={cli} onChange={(e) => setCli(e.target.value as CliName)} disabled={busy}>
            {CLI_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {CLI_LABEL[item]}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Account ID</span>
          <input
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="e.g. 1001"
            disabled={busy}
          />
          {!accountIdOk && accountId ? (
            <span style={{ color: "#b91c1c", fontSize: 12 }}>Account ID must be numeric.</span>
          ) : null}
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>API Key</span>
          <input
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Paste new API key to update"
            disabled={busy}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Base URL</span>
          <input
            value={baseUrlInput}
            onChange={(e) => setBaseUrlInput(e.target.value)}
            placeholder={baseUrlDisabled ? "Not supported for Gemini" : "https://api.example.com/v1"}
            disabled={busy || baseUrlDisabled}
          />
          {!baseUrlOk ? (
            <span style={{ color: "#b91c1c", fontSize: 12 }}>Base URL must be a valid http/https URL.</span>
          ) : null}
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={loadConfig} disabled={!canLoad}>
          Load Config
        </button>
        <button type="button" onClick={saveConfig} disabled={!canSave}>
          Save API Key / Base URL
        </button>
        <button type="button" onClick={triggerOAuth} disabled={!canOAuth}>
          Trigger OAuth
        </button>
      </div>

      <p style={{ margin: "14px 0 8px", fontWeight: 600 }}>Status</p>
      <pre
        style={{
          margin: 0,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 10,
          whiteSpace: "pre-wrap",
        }}
      >
        {status}
      </pre>

      <p style={{ margin: "14px 0 8px", fontWeight: 600 }}>Last Result</p>
      <pre
        style={{
          margin: 0,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: 10,
          whiteSpace: "pre-wrap",
        }}
      >
        {result
          ? JSON.stringify(
              {
                action: result.action,
                ok: result.ok,
                code: result.code,
                message: result.message,
                cli: result.data.cliName,
                accountId: result.data.accountId,
                apiKeyConfigured: result.data.apiKeyConfigured,
                apiKeyPreview: result.data.apiKeyPreview || maskApiKey(apiKeyInput.trim()),
                baseUrl: result.data.baseUrl || "",
                command: result.data.command,
                exitCode: result.data.exitCode,
              },
              null,
              2
            )
          : "No command result yet."}
      </pre>
    </section>
  );
}
