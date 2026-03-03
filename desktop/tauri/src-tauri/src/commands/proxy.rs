use serde::Serialize;
use std::process::Command;

const PROXY_COMMANDS: [&str; 5] = [
  "proxy_namespace_info",
  "proxy_status",
  "proxy_restart",
  "proxy_set_port",
  "proxy_set_api_key",
];
const PROXY_ERROR_CODES: [&str; 3] = [
  "PROXY_INVALID_INPUT",
  "PROXY_EXEC_FAILED",
  "PROXY_COMMAND_FAILED",
];

#[derive(Serialize)]
pub struct ProxyNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
  pub error_codes: Vec<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyControlData {
  pub running: Option<bool>,
  pub pid: Option<u32>,
  pub command: Vec<String>,
  pub stdout: String,
  pub stderr: String,
  pub exit_code: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyControlResponse {
  pub namespace: &'static str,
  pub action: &'static str,
  pub ok: bool,
  pub code: &'static str,
  pub message: String,
  pub data: ProxyControlData,
  pub commands: Vec<&'static str>,
  pub error_codes: Vec<&'static str>,
}

struct ProcessOutput {
  code: i32,
  stdout: String,
  stderr: String,
}

#[tauri::command]
pub fn proxy_namespace_info() -> ProxyNamespaceInfo {
  ProxyNamespaceInfo {
    namespace: "proxy",
    commands: PROXY_COMMANDS.to_vec(),
    error_codes: PROXY_ERROR_CODES.to_vec(),
  }
}

#[tauri::command]
pub fn proxy_status() -> crate::FrontendResult<ProxyControlResponse> {
  run_proxy_action("status", vec!["proxy".to_string(), "status".to_string()])
}

#[tauri::command]
pub fn proxy_restart(port: Option<u16>, api_key: Option<String>) -> crate::FrontendResult<ProxyControlResponse> {
  let mut args = vec!["proxy".to_string(), "restart".to_string()];
  if let Some(p) = port {
    args.push("--port".to_string());
    args.push(p.to_string());
  }
  if let Some(key) = api_key {
    let trimmed = key.trim();
    if trimmed.is_empty() {
      return Err(crate::map_command_error(
        "proxy",
        "PROXY_INVALID_INPUT",
        "api_key must not be empty",
      ));
    }
    args.push("--api-key".to_string());
    args.push(trimmed.to_string());
  }
  run_proxy_action("restart", args)
}

#[tauri::command]
pub fn proxy_set_port(port: u16) -> crate::FrontendResult<ProxyControlResponse> {
  if port == 0 {
    return Err(crate::map_command_error(
      "proxy",
      "PROXY_INVALID_INPUT",
      "port must be between 1 and 65535",
    ));
  }
  run_proxy_action(
    "set_port",
    vec![
      "proxy".to_string(),
      "restart".to_string(),
      "--port".to_string(),
      port.to_string(),
    ],
  )
}

#[tauri::command]
pub fn proxy_set_api_key(api_key: String) -> crate::FrontendResult<ProxyControlResponse> {
  let trimmed = api_key.trim();
  if trimmed.is_empty() {
    return Err(crate::map_command_error(
      "proxy",
      "PROXY_INVALID_INPUT",
      "api_key must not be empty",
    ));
  }
  run_proxy_action(
    "set_api_key",
    vec![
      "proxy".to_string(),
      "restart".to_string(),
      "--api-key".to_string(),
      trimmed.to_string(),
    ],
  )
}

fn run_proxy_action(action: &'static str, args: Vec<String>) -> crate::FrontendResult<ProxyControlResponse> {
  let output = run_aih(&args)?;
  let running = parse_running(&output.stdout);
  let pid = parse_pid(&output.stdout);
  let ok = output.code == 0;

  Ok(ProxyControlResponse {
    namespace: "proxy",
    action,
    ok,
    code: if ok {
      "PROXY_OK"
    } else {
      "PROXY_COMMAND_FAILED"
    },
    message: if ok {
      "proxy command completed".to_string()
    } else {
      "proxy command failed".to_string()
    },
    data: ProxyControlData {
      running,
      pid,
      command: args,
      stdout: output.stdout,
      stderr: output.stderr,
      exit_code: output.code,
    },
    commands: PROXY_COMMANDS.to_vec(),
    error_codes: PROXY_ERROR_CODES.to_vec(),
  })
}

fn run_aih(args: &[String]) -> crate::FrontendResult<ProcessOutput> {
  let resolution = crate::runtime::resolve()?;
  let mut cmd = Command::new(crate::runtime::resolve_node_binary());
  cmd.current_dir(&resolution.root);
  cmd.arg("bin/ai-home.js");
  cmd.args(args);

  let output = cmd.output().map_err(|e| {
    crate::map_command_error(
      "proxy",
      "PROXY_EXEC_FAILED",
      format!("failed to execute proxy command; io_kind={:?}", e.kind()),
    )
  })?;

  Ok(ProcessOutput {
    code: output.status.code().unwrap_or(-1),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
  })
}

fn parse_running(stdout: &str) -> Option<bool> {
  let normalized = stdout.to_lowercase();
  if normalized.contains("proxy is running") {
    return Some(true);
  }
  if normalized.contains("proxy is not running") {
    return Some(false);
  }
  None
}

fn parse_pid(stdout: &str) -> Option<u32> {
  let marker = "(pid=";
  let start = stdout.find(marker)?;
  let pid_start = start + marker.len();
  let suffix = &stdout[pid_start..];
  let end = suffix.find(')')?;
  suffix[..end].trim().parse::<u32>().ok()
}
