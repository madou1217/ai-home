mod commands {
  pub mod accounts;
  pub mod audit;
  pub mod migration;
}

use serde::Serialize;
use serde_json::Value;
use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
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
  stdout: String,
  stderr: String,
}

#[derive(Serialize)]
struct AuditEntry {
  ts: String,
  action: String,
  context: Value,
}

fn has_aih_entry(root: &Path) -> bool {
  root.join("bin").join("ai-home.js").exists()
}

fn io_error_message(prefix: &'static str, err: &std::io::Error) -> String {
  format!("{prefix}; io_kind={:?}", err.kind())
}

#[tauri::command]
fn core_namespace_info() -> CoreNamespaceInfo {
  CoreNamespaceInfo {
    namespace: CORE_NS,
    version: "2026-03-01",
    commands: vec![
      "core_namespace_info",
      "run_aih",
      "launch_aih_session",
      "read_audit_log",
      "accounts_namespace_info",
      "migration_namespace_info",
      "migration_export_trigger",
      "migration_import_trigger",
      "audit_namespace_info",
      "audit_query",
    ],
    error_codes: vec![
      "CORE_CWD_READ_FAILED",
      "CORE_REPO_ROOT_NOT_FOUND",
      "CORE_AIH_EXEC_FAILED",
      "CORE_SESSION_LAUNCH_FAILED",
      "AUDIT_HOME_NOT_SET",
      "AUDIT_LOG_OPEN_FAILED",
    ],
  }
}

fn resolve_repo_root() -> FrontendResult<PathBuf> {
  let cwd = env::current_dir().map_err(|e| {
    map_command_error(
      CORE_NS,
      "CORE_CWD_READ_FAILED",
      io_error_message("failed to read cwd", &e),
    )
  })?;

  for ancestor in cwd.ancestors() {
    if has_aih_entry(ancestor) {
      return Ok(ancestor.to_path_buf());
    }
  }

  if let Ok(exe_path) = env::current_exe() {
    for ancestor in exe_path.ancestors() {
      if has_aih_entry(ancestor) {
        return Ok(ancestor.to_path_buf());
      }
    }
  }

  Err(map_command_error(
    CORE_NS,
    "CORE_REPO_ROOT_NOT_FOUND",
    "failed to locate repository root (bin/ai-home.js missing)",
  ))
}

fn prepare_aih_command(args: &[String]) -> FrontendResult<Command> {
  let repo_root = resolve_repo_root()?;
  let mut cmd = Command::new("node");
  cmd.current_dir(repo_root);
  cmd.arg("bin/ai-home.js");
  cmd.args(args);
  Ok(cmd)
}

#[tauri::command]
fn run_aih(args: Vec<String>) -> FrontendResult<CommandResult> {
  let output = prepare_aih_command(&args)?.output().map_err(|e| {
    map_command_error(
      CORE_NS,
      "CORE_AIH_EXEC_FAILED",
      io_error_message("failed to execute aih command", &e),
    )
  })?;

  Ok(CommandResult {
    code: output.status.code().unwrap_or(-1),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
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
      map_command_error(
        CORE_NS,
        "CORE_SESSION_LAUNCH_FAILED",
        io_error_message("failed to launch session", &e),
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
      launch_aih_session,
      read_audit_log,
      commands::accounts::accounts_namespace_info,
      commands::migration::migration_namespace_info,
      commands::migration::migration_export_trigger,
      commands::migration::migration_import_trigger,
      commands::audit::audit_namespace_info
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
