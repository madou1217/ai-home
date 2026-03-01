import { useEffect, useMemo, useState } from "react";

export type CliName = "codex" | "claude" | "gemini";
export type CliAccounts = Record<CliName, string[]>;

interface LaunchRequest {
  cli: CliName;
  accountId: string;
  prompt?: string;
}

interface SessionLauncherProps {
  accountsByCli: CliAccounts;
  busy: boolean;
  onLaunch: (request: LaunchRequest) => Promise<void>;
}

const CLI_LABEL: Record<CliName, string> = {
  codex: "Codex",
  claude: "Claude",
  gemini: "Gemini",
};

export default function SessionLauncher(props: SessionLauncherProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedByCli, setSelectedByCli] = useState<Record<CliName, string>>({
    codex: "",
    claude: "",
    gemini: "",
  });

  useEffect(() => {
    const nextSelection = { ...selectedByCli };
    (["codex", "claude", "gemini"] as CliName[]).forEach((cli) => {
      const options = props.accountsByCli[cli] || [];
      if (!options.length) {
        nextSelection[cli] = "";
        return;
      }
      if (!nextSelection[cli] || !options.includes(nextSelection[cli])) {
        nextSelection[cli] = options[0];
      }
    });
    setSelectedByCli(nextSelection);
  }, [props.accountsByCli]);

  const cliRows = useMemo(() => (["codex", "claude", "gemini"] as CliName[]), []);

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
          const accounts = props.accountsByCli[cli] || [];
          const selected = selectedByCli[cli] || "";
          const canLaunch = Boolean(selected) && !props.busy;

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
                    disabled={!accounts.length || props.busy}
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
                  onClick={() =>
                    void props.onLaunch({
                      cli,
                      accountId: selected,
                      prompt: prompt.trim() || undefined,
                    })
                  }
                >
                  Launch {CLI_LABEL[cli]}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
