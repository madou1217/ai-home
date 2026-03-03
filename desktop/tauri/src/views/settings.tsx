import { useMemo, useState } from "react";

type ActiveInterval = "1m" | "3m";
type BackgroundInterval = "1h";

interface UsageSettings {
  active_refresh_interval: ActiveInterval;
  background_refresh_interval: BackgroundInterval;
  threshold_pct: number;
}

const STORAGE_KEY = "aih.desktop.usage.settings";

const DEFAULT_SETTINGS: UsageSettings = {
  active_refresh_interval: "1m",
  background_refresh_interval: "1h",
  threshold_pct: 90,
};

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.threshold_pct;
  if (value < 1) return 1;
  if (value > 99) return 99;
  return Math.round(value);
}

function normalizeSettings(input: Partial<UsageSettings> | null | undefined): UsageSettings {
  const active = input?.active_refresh_interval === "3m" ? "3m" : "1m";
  const background = "1h";
  const threshold = clampThreshold(Number(input?.threshold_pct));
  return {
    active_refresh_interval: active,
    background_refresh_interval: background,
    threshold_pct: threshold,
  };
}

function loadSettings(): UsageSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeSettings(JSON.parse(raw) as Partial<UsageSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: UsageSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export default function UsageSettingsView() {
  const [draft, setDraft] = useState<UsageSettings>(() => loadSettings());
  const [status, setStatus] = useState("Ready");

  const effective = useMemo(() => normalizeSettings(draft), [draft]);

  function onSave() {
    const normalized = normalizeSettings(draft);
    saveSettings(normalized);
    setDraft(normalized);
    setStatus(`Saved at ${new Date().toLocaleString()}`);
  }

  function onReset() {
    setDraft(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    setStatus("Reset to defaults");
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
      <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Usage Settings</h2>
      <p style={{ margin: "0 0 16px", color: "#4b5563" }}>
        Configure active refresh cadence and usage threshold. Settings are persisted locally and the effective runtime values are shown below.
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Active Refresh Interval</span>
          <select
            value={draft.active_refresh_interval}
            onChange={(e) => setDraft((prev) => ({ ...prev, active_refresh_interval: e.target.value as ActiveInterval }))}
          >
            <option value="1m">1 minute</option>
            <option value="3m">3 minutes</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Background Refresh Interval</span>
          <input value="1h (fixed)" disabled />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Usage Threshold (%)</span>
          <input
            type="number"
            min={1}
            max={99}
            value={draft.threshold_pct}
            onChange={(e) => setDraft((prev) => ({ ...prev, threshold_pct: clampThreshold(Number(e.target.value)) }))}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={onSave}>Save</button>
        <button type="button" onClick={onReset}>Reset Defaults</button>
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

      <p style={{ margin: "14px 0 8px", fontWeight: 600 }}>Effective Runtime Values</p>
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
        {JSON.stringify(effective, null, 2)}
      </pre>
    </section>
  );
}
