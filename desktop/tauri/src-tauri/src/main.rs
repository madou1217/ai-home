mod commands {
  pub mod accounts;
  pub mod auth;
  pub mod audit;
  pub mod migration;
  pub mod proxy;
}
mod runtime;

use serde::Serialize;
use serde_json::Value;
use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};

#[derive(Debug, Serialize)]
pub struct FrontendError {
  pub namespace: &'static str,
  pub code: &'static str,
  pub message: String,
}

pub type FrontendResult<T> = Result<T, FrontendError>;

pub fn map_command_error(namespace: &'static str, code: &'static str, message: impl Into<String>) -> FrontendError {
  FrontendError {
    namespace,
    code,
    message: message.into(),
  }
}

const CORE_NS: &str = "core";

#[derive(Serialize)]
struct CoreNamespaceInfo {
  namespace: &'static str,
  version: &'static str,
  commands: Vec<&'static str>,
  error_codes: Vec<&'static str>,
}

#[derive(Serialize)]
struct CommandResult {
  code: i32,
  ok: bool,
  reason_code: &'static str,
  command: Vec<String>,
  stdout: String,
  stderr: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountCommandResult {
  ok: bool,
  code: &'static str,
  message: String,
  cli: String,
  action: String,
  args: Vec<String>,
  result: CommandResult,
}

#[derive(Serialize)]
struct AuditEntry {
  ts: String,
  action: String,
  context: Value,
}

#[tauri::command]
fn core_namespace_info() -> CoreNamespaceInfo {
  CoreNamespaceInfo {
    namespace: CORE_NS,
    version: "2026-03-01",
    commands: vec![
      "core_namespace_info",
      "run_aih",
      "run_account_command",
      "launch_aih_session",
      "read_audit_log",
      "accounts_namespace_info",
      "auth_namespace_info",
      "auth_get_config",
      "auth_set_config",
      "auth_trigger_oauth",
      "migration_namespace_info",
      "migration_export_trigger",
      "migration_import_trigger",
      "audit_namespace_info",
      "audit_query",
      "proxy_namespace_info",
      "proxy_status",
      "proxy_restart",
      "proxy_set_port",
      "proxy_set_api_key",
    ],
    error_codes: vec![
      "CORE_RUNTIME_NOT_FOUND",
      "CORE_REPO_ROOT_NOT_FOUND",
      "CORE_AIH_EXEC_FAILED",
      "CORE_ACCOUNT_INVALID_INPUT",
      "CORE_ACCOUNT_NOT_FOUND",
      "CORE_ACCOUNT_AUTH_REQUIRED",
      "CORE_ACCOUNT_EXEC_FAILED",
      "CORE_ACCOUNT_COMMAND_FAILED",
      "CORE_SESSION_LAUNCH_FAILED",
      "AUDIT_HOME_NOT_SET",
      "AUDIT_LOG_OPEN_FAILED",
      "AUTH_INVALID_INPUT",
      "AUTH_COMMAND_FAILED",
      "PROXY_COMMAND_FAILED",
    ],
  }
}

fn prepare_aih_command(args: &[String]) -> FrontendResult<Command> {
  // Compatibility contract: "failed to locate repository root" is surfaced when runtime cannot be found.
  if let Ok(exe_path) = env::current_exe() {
    let _ = exe_path;
  }
  let resolution = runtime::resolve()?;
  let mut cmd = Command::new(runtime::resolve_node_binary());
  cmd.current_dir(&resolution.root);
  cmd.arg("bin/ai-home.js");
  cmd.args(args);
  Ok(cmd)
}

fn classify_account_failure(stdout: &str, stderr: &str) -> (&'static str, &'static str) {
  let combined = format!("{stdout}\n{stderr}").to_lowercase();

  if combined.contains("usage:") || combined.contains("invalid") {
    return ("CORE_ACCOUNT_INVALID_INPUT", "account command input is invalid");
  }
  if combined.contains("not found") {
    return ("CORE_ACCOUNT_NOT_FOUND", "target account or command context was not found");
  }
  if combined.contains("auth") || combined.contains("login") {
    return ("CORE_ACCOUNT_AUTH_REQUIRED", "account command requires authentication");
  }
  ("CORE_ACCOUNT_COMMAND_FAILED", "account command failed")
}

fn build_account_args(action: &str, cli: &str, account_id: Option<&str>) -> FrontendResult<Vec<String>> {
  let cli_trimmed = cli.trim();
  if cli_trimmed.is_empty() {
    return Err(map_command_error(
      CORE_NS,
      "CORE_ACCOUNT_INVALID_INPUT",
      "cli is required",
    ));
  }

  let args = match action {
    "list" => vec![cli_trimmed.to_string(), "ls".to_string()],
    "set_default" => {
      let account = account_id.unwrap_or("").trim();
      if account.is_empty() {
        return Err(map_command_error(
          CORE_NS,
          "CORE_ACCOUNT_INVALID_INPUT",
          "account_id is required for set_default",
        ));
      }
      vec![
        cli_trimmed.to_string(),
        "set-default".to_string(),
        account.to_string(),
      ]
    }
    "add" => vec![cli_trimmed.to_string(), "add".to_string()],
    _ => {
      return Err(map_command_error(
        CORE_NS,
        "CORE_ACCOUNT_INVALID_INPUT",
        "unsupported account action; use list | set_default | add",
      ));
    }
  };

  Ok(args)
}

#[tauri::command]
fn run_aih(args: Vec<String>) -> FrontendResult<CommandResult> {
  let output = prepare_aih_command(&args)?.output().map_err(|e| {
    let message = match e.kind() {
      std::io::ErrorKind::NotFound => "node runtime not found; install node or set AIH_DESKTOP_NODE",
      _ => "failed to execute aih command",
    };
    map_command_error(
      CORE_NS,
      "CORE_AIH_EXEC_FAILED",
      format!("{message}; io_kind={:?}", e.kind()),
    )
  })?;
  let code = output.status.code().unwrap_or(-1);
  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();
  let (ok, reason_code) = classify_run_aih_result(&args, code, &stdout, &stderr);

  Ok(CommandResult {
    code,
    ok,
    reason_code,
    command: args,
    stdout,
    stderr,
  })
}

#[tauri::command]
fn run_account_command(
  cli: String,
  action: String,
  account_id: Option<String>,
) -> FrontendResult<AccountCommandResult> {
  let args = build_account_args(action.trim(), &cli, account_id.as_deref())?;
  let mut cmd = prepare_aih_command(&args)?;
  let output = cmd.output().map_err(|e| {
    let message = match e.kind() {
      std::io::ErrorKind::NotFound => "node runtime not found; install node or set AIH_DESKTOP_NODE",
      _ => "failed to execute account command",
    };
    map_command_error(
      CORE_NS,
      "CORE_ACCOUNT_EXEC_FAILED",
      format!("{message}; io_kind={:?}", e.kind()),
    )
  })?;

  let result = CommandResult {
    code: output.status.code().unwrap_or(-1),
    ok: output.status.success(),
    reason_code: if output.status.success() { "CORE_ACCOUNT_OK" } else { "CORE_ACCOUNT_FAILED" },
    command: args.clone(),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
  };

  if result.code == 0 {
    let success_code = match action.as_str() {
      "list" => "CORE_ACCOUNT_LIST_OK",
      "set_default" => "CORE_ACCOUNT_SET_DEFAULT_OK",
      "add" => "CORE_ACCOUNT_ADD_OK",
      _ => "CORE_ACCOUNT_OK",
    };
    return Ok(AccountCommandResult {
      ok: true,
      code: success_code,
      message: "account command completed successfully".to_string(),
      cli,
      action,
      args,
      result,
    });
  }

  let (code, message) = classify_account_failure(&result.stdout, &result.stderr);
  Ok(AccountCommandResult {
    ok: false,
    code,
    message: message.to_string(),
    cli,
    action,
    args,
    result,
  })
}

#[tauri::command]
fn launch_aih_session(cli: String, account_id: String, prompt: Option<String>) -> FrontendResult<u32> {
  let mut args = vec![cli, account_id];
  if let Some(prompt_text) = prompt {
    let trimmed = prompt_text.trim();
    if !trimmed.is_empty() {
      args.push(trimmed.to_string());
    }
  }

  let child = prepare_aih_command(&args)?
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| {
      let message = match e.kind() {
        std::io::ErrorKind::NotFound => "node runtime not found; install node or set AIH_DESKTOP_NODE",
        _ => "failed to launch session",
      };
      map_command_error(
        CORE_NS,
        "CORE_SESSION_LAUNCH_FAILED",
        format!("{message}; io_kind={:?}", e.kind()),
      )
    })?;

  Ok(child.id())
}

fn parse_audit_entry(value: Value) -> Option<AuditEntry> {
  let ts = value.get("ts")?.as_str()?.to_string();
  let action = value.get("action")?.as_str()?.to_string();
  let context = value.get("context").cloned().unwrap_or(Value::Null);
  Some(AuditEntry { ts, action, context })
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
  needles.iter().any(|needle| haystack.contains(needle))
}

fn classify_run_aih_result(args: &[String], code: i32, stdout: &str, stderr: &str) -> (bool, &'static str) {
  let combined = format!("{stdout}\n{stderr}").to_lowercase();
  let has_error_text = contains_any(
    &combined,
    &[
      "[error]",
      "error:",
      "failed",
      "not found",
      "invalid",
      "usage: aih",
      "unknown command",
    ],
  );
  let success = code == 0 && !has_error_text;
  if success {
    return (true, "AIH_OK");
  }

  if contains_any(&combined, &["node runtime not found", "core_runtime_not_found"]) {
    return (false, "AIH_RUNTIME_NOT_FOUND");
  }
  if contains_any(&combined, &["usage: aih", "unknown command", "invalid"]) {
    return (false, "AIH_INVALID_ARGS");
  }

  let is_account_list = args.len() == 1 && args[0] == "ls"
    || (args.len() == 2 && args[1] == "ls" && matches!(args[0].as_str(), "codex" | "claude" | "gemini"));
  if is_account_list {
    return (false, "AIH_ACCOUNT_LIST_FAILED");
  }

  let is_set_default = args.len() >= 3 && args[1] == "set-default";
  if is_set_default {
    return (false, "AIH_ACCOUNT_SET_DEFAULT_FAILED");
  }

  let is_add_account = args.len() >= 2
    && matches!(args[1].as_str(), "add" | "login" | "auth")
    && matches!(args[0].as_str(), "codex" | "claude" | "gemini");
  if is_add_account {
    return (false, "AIH_ACCOUNT_ADD_FAILED");
  }

  (false, "AIH_PROCESS_EXIT_NONZERO")
}

#[tauri::command]
fn read_audit_log(limit: Option<usize>) -> FrontendResult<Vec<AuditEntry>> {
  let take_n = limit.unwrap_or(200).clamp(1, 2000);
  let home_dir = env::var("HOME")
    .map_err(|_| map_command_error("audit", "AUDIT_HOME_NOT_SET", "HOME is not set"))?;
  let audit_path = PathBuf::from(home_dir)
    .join(".ai_home")
    .join("audit")
    .join("cli-actions.jsonl");

  if !audit_path.exists() {
    return Ok(vec![]);
  }

  let file = File::open(&audit_path).map_err(|e| {
    map_command_error(
      "audit",
      "AUDIT_LOG_OPEN_FAILED",
      format!("failed to open audit log {}: {e}", audit_path.display()),
    )
  })?;
  let reader = BufReader::new(file);

  let mut entries = Vec::new();
  for line in reader.lines().flatten() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
      if let Some(entry) = parse_audit_entry(value) {
        entries.push(entry);
      }
    }
  }

  if entries.len() > take_n {
    let start = entries.len() - take_n;
    entries = entries.split_off(start);
  }

  Ok(entries)
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      core_namespace_info,
      run_aih,
      run_account_command,
      launch_aih_session,
      read_audit_log,
      commands::accounts::accounts_namespace_info,
      commands::auth::auth_namespace_info,
      commands::auth::auth_get_config,
      commands::auth::auth_set_config,
      commands::auth::auth_trigger_oauth,
      commands::migration::migration_namespace_info,
      commands::migration::migration_export_trigger,
      commands::migration::migration_import_trigger,
      commands::audit::audit_namespace_info,
      commands::audit::audit_query,
      commands::proxy::proxy_namespace_info,
      commands::proxy::proxy_status,
      commands::proxy::proxy_restart,
      commands::proxy::proxy_set_port,
      commands::proxy::proxy_set_api_key
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
