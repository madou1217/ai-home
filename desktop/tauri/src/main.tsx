import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

declare global {
  interface Window {
    __TAURI__?: {
      invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      core?: {
        invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
    __AIH_BOOTSTRAP__?: {
      status: "runtime-ready" | "runtime-degraded";
      reason: string;
      checkedAt: string;
    };
  }
}

type BootstrapStatus = "runtime-ready" | "runtime-degraded";

interface BootstrapSnapshot {
  status: BootstrapStatus;
  reason: string;
}

function invokeBridge<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const invokeFn = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invokeFn) {
    return Promise.reject(new Error("tauri_invoke_unavailable"));
  }
  return invokeFn<T>(cmd, args ?? {});
}

async function probeRuntimeReadiness(): Promise<BootstrapSnapshot> {
  try {
    await Promise.race([
      invokeBridge("core_namespace_info", {}),
      new Promise((_, reject) => setTimeout(() => reject(new Error("probe_timeout")), 1200)),
    ]);
    return { status: "runtime-ready", reason: "core_namespace_info_ok" };
  } catch (error) {
    const message = (error as Error)?.message || "runtime_probe_failed";
    return { status: "runtime-degraded", reason: message };
  }
}

function StatusBanner(props: { snapshot: BootstrapSnapshot }) {
  if (props.snapshot.status === "runtime-ready") return null;
  return (
    <div
      role="status"
      style={{
        border: "1px solid #f59e0b",
        background: "#fffbeb",
        color: "#92400e",
        borderRadius: 8,
        padding: "8px 10px",
        margin: "12px auto",
        maxWidth: 1080,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      runtime-degraded: {props.snapshot.reason}. UI is available with limited backend capability.
    </div>
  );
}

async function bootstrap() {
  const mountNode = document.getElementById("root");
  if (!mountNode) {
    throw new Error("root element not found");
  }

  const snapshot = await probeRuntimeReadiness();
  window.__AIH_BOOTSTRAP__ = {
    status: snapshot.status,
    reason: snapshot.reason,
    checkedAt: new Date().toISOString(),
  };

  createRoot(mountNode).render(
    <React.StrictMode>
      <StatusBanner snapshot={snapshot} />
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
