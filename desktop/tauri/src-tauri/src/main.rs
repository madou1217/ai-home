use serde::Serialize;
use serde_json::Value;
use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

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

fn resolve_repo_root() -> Result<PathBuf, String> {
  let cwd = env::current_dir().map_err(|e| format!("failed to read cwd: {e}"))?;
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

  Err("failed to locate repository root (bin/ai-home.js missing)".to_string())
}

fn prepare_aih_command(args: &[String]) -> Result<Command, String> {
  let repo_root = resolve_repo_root()?;
  let mut cmd = Command::new("node");
  cmd.current_dir(repo_root);
  cmd.arg("bin/ai-home.js");
  cmd.args(args);
  Ok(cmd)
}

#[tauri::command]
fn run_aih(args: Vec<String>) -> Result<CommandResult, String> {
  let output = prepare_aih_command(&args)?
    .output()
    .map_err(|e| format!("failed to execute aih command: {e}"))?;

  Ok(CommandResult {
    code: output.status.code().unwrap_or(-1),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
  })
}

#[tauri::command]
fn launch_aih_session(cli: String, account_id: String, prompt: Option<String>) -> Result<u32, String> {
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
    .map_err(|e| format!("failed to launch session: {e}"))?;

  Ok(child.id())
}

fn parse_audit_entry(value: Value) -> Option<AuditEntry> {
  let ts = value.get("ts")?.as_str()?.to_string();
  let action = value.get("action")?.as_str()?.to_string();
  let context = value.get("context").cloned().unwrap_or(Value::Null);
  Some(AuditEntry { ts, action, context })
}

#[tauri::command]
fn read_audit_log(limit: Option<usize>) -> Result<Vec<AuditEntry>, String> {
  let take_n = limit.unwrap_or(200).clamp(1, 2000);
  let home_dir = env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
  let audit_path = PathBuf::from(home_dir)
    .join(".ai_home")
    .join("audit")
    .join("cli-actions.jsonl");

  if !audit_path.exists() {
    return Ok(vec![]);
  }

  let file = File::open(&audit_path)
    .map_err(|e| format!("failed to open audit log {}: {e}", audit_path.display()))?;
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
    .invoke_handler(tauri::generate_handler![run_aih, launch_aih_session, read_audit_log])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
