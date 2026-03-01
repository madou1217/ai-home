use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

const NS: &str = "migration";

#[derive(Serialize)]
pub struct MigrationNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationExportRequest {
  pub target_file: Option<String>,
  pub selectors: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationImportRequest {
  pub source_file: String,
  pub overwrite: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationProgressEvent {
  pub channel: String,
  pub current: Option<u32>,
  pub total: Option<u32>,
  pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationCommandResult {
  pub operation: &'static str,
  pub success: bool,
  pub exit_code: i32,
  pub reason_code: Option<&'static str>,
  pub summary: Option<String>,
  pub command: Vec<String>,
  pub progress: Vec<MigrationProgressEvent>,
  pub stdout: String,
  pub stderr: String,
}

#[derive(Debug)]
struct ProcessOutput {
  code: i32,
  stdout: String,
  stderr: String,
}

#[tauri::command]
pub fn migration_namespace_info(simulate_error: Option<String>) -> crate::FrontendResult<MigrationNamespaceInfo> {
  if let Some(reason) = simulate_error {
    if reason == "unsupported" {
      return Err(crate::map_command_error(
        NS,
        "MIGRATION_UNSUPPORTED",
        "migration feature is not supported in current context",
      ));
    }
  }

  Ok(MigrationNamespaceInfo {
    namespace: NS,
    commands: vec![
      "migration_namespace_info",
      "migration_export_trigger",
      "migration_import_trigger",
    ],
  })
}

#[tauri::command]
pub fn migration_export_trigger(request: MigrationExportRequest) -> crate::FrontendResult<MigrationCommandResult> {
  let mut args = vec!["export".to_string()];

  if let Some(target_file) = request.target_file {
    let trimmed = target_file.trim();
    if trimmed.is_empty() {
      return Err(crate::map_command_error(
        NS,
        "MIGRATION_INVALID_INPUT",
        "targetFile cannot be empty when provided",
      ));
    }
    args.push(trimmed.to_string());
  }

  if let Some(selectors) = request.selectors {
    for selector in selectors {
      let trimmed = selector.trim();
      if !trimmed.is_empty() {
        args.push(trimmed.to_string());
      }
    }
  }

  run_migration_command("export", &args)
}

#[tauri::command]
pub fn migration_import_trigger(request: MigrationImportRequest) -> crate::FrontendResult<MigrationCommandResult> {
  let source_file = request.source_file.trim();
  if source_file.is_empty() {
    return Err(crate::map_command_error(
      NS,
      "MIGRATION_INVALID_INPUT",
      "sourceFile is required",
    ));
  }

  let mut args = vec!["import".to_string()];
  if request.overwrite.unwrap_or(false) {
    args.push("-o".to_string());
  }
  args.push(source_file.to_string());

  run_migration_command("import", &args)
}

fn run_migration_command(operation: &'static str, args: &[String]) -> crate::FrontendResult<MigrationCommandResult> {
  let output = run_aih(args)?;
  let progress = collect_progress(&output.stdout, &output.stderr);
  let success = detect_success(operation, output.code, &output.stdout, &output.stderr);
  let reason_code = if success {
    None
  } else {
    Some(classify_failure(operation, output.code, &output.stdout, &output.stderr))
  };

  Ok(MigrationCommandResult {
    operation,
    success,
    exit_code: output.code,
    reason_code,
    summary: extract_summary(operation, &output.stdout, &output.stderr),
    command: command_preview(args),
    progress,
    stdout: output.stdout,
    stderr: output.stderr,
  })
}

fn has_aih_entry(root: &Path) -> bool {
  root.join("bin").join("ai-home.js").exists()
}

fn resolve_repo_root() -> crate::FrontendResult<PathBuf> {
  let cwd = env::current_dir().map_err(|e| {
    crate::map_command_error(
      NS,
      "MIGRATION_REPO_ROOT_RESOLVE_FAILED",
      format!("failed to read cwd: {e}"),
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

  Err(crate::map_command_error(
    NS,
    "MIGRATION_REPO_ROOT_NOT_FOUND",
    "failed to locate repository root (bin/ai-home.js missing)",
  ))
}

fn run_aih(args: &[String]) -> crate::FrontendResult<ProcessOutput> {
  let repo_root = resolve_repo_root()?;

  let output = Command::new("node")
    .current_dir(repo_root)
    .arg("bin/ai-home.js")
    .args(args)
    .output()
    .map_err(|e| {
      crate::map_command_error(
        NS,
        "MIGRATION_EXEC_FAILED",
        format!("failed to execute migration command: {e}"),
      )
    })?;

  Ok(ProcessOutput {
    code: output.status.code().unwrap_or(-1),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
  })
}

fn command_preview(args: &[String]) -> Vec<String> {
  let mut command = vec!["node".to_string(), "bin/ai-home.js".to_string()];
  command.extend(args.iter().cloned());
  command
}

fn detect_success(operation: &str, code: i32, stdout: &str, stderr: &str) -> bool {
  let stdout_clean = strip_ansi(stdout);
  let stderr_clean = strip_ansi(stderr);
  let combined = format!("{stdout_clean}\n{stderr_clean}").to_lowercase();
  if combined.contains("operation cancelled")
    || combined.contains("[error]")
    || combined.contains("failed to export")
    || combined.contains("failed to import")
    || combined.contains("file not found")
  {
    return false;
  }

  match operation {
    "export" => combined.contains("assets securely exported to"),
    "import" => combined.contains("restore completed"),
    _ => code == 0,
  }
}

fn classify_failure(operation: &str, code: i32, stdout: &str, stderr: &str) -> &'static str {
  let stdout_clean = strip_ansi(stdout);
  let stderr_clean = strip_ansi(stderr);
  let combined = format!("{stdout_clean}\n{stderr_clean}").to_lowercase();

  if combined.contains("operation cancelled") {
    return "MIGRATION_INTERACTIVE_REQUIRED";
  }
  if combined.contains("file not found") {
    return "MIGRATION_SOURCE_NOT_FOUND";
  }
  if combined.contains("usage: aih import") || combined.contains("usage: aih export") {
    return "MIGRATION_INVALID_INPUT";
  }
  if combined.contains("password") && combined.contains("empty") {
    return "MIGRATION_SECRET_INVALID";
  }
  if combined.contains("decrypt") {
    return "MIGRATION_DECRYPT_FAILED";
  }
  if combined.contains("encrypt") {
    return "MIGRATION_ENCRYPT_FAILED";
  }
  if combined.contains("no matching profiles") {
    return "MIGRATION_SELECTOR_EMPTY";
  }
  if code != 0 {
    return "MIGRATION_PROCESS_EXIT_NONZERO";
  }

  match operation {
    "export" => "MIGRATION_EXPORT_FAILED",
    "import" => "MIGRATION_IMPORT_FAILED",
    _ => "MIGRATION_FAILED",
  }
}

fn extract_summary(operation: &str, stdout: &str, stderr: &str) -> Option<String> {
  let success_hint = match operation {
    "export" => "assets securely exported to",
    "import" => "restore completed",
    _ => "",
  };

  let mut fallback: Option<String> = None;
  let stdout_clean = strip_ansi(stdout);
  let stderr_clean = strip_ansi(stderr);
  for line in stdout_clean.lines().chain(stderr_clean.lines()) {
    let trimmed = line.trim();
    let lower = trimmed.to_lowercase();
    if !success_hint.is_empty() && lower.contains(success_hint) {
      return Some(trimmed.to_string());
    }
    if fallback.is_none() && (lower.contains("failed") || lower.contains("error") || lower.contains("cancelled")) {
      fallback = Some(trimmed.to_string());
    }
  }

  fallback
}

fn collect_progress(stdout: &str, stderr: &str) -> Vec<MigrationProgressEvent> {
  let mut events = Vec::new();
  let stdout_clean = strip_ansi(stdout);
  let stderr_clean = strip_ansi(stderr);
  for line in stdout_clean.lines().chain(stderr_clean.lines()) {
    if let Some(event) = parse_progress_line(line) {
      events.push(event);
    }
  }
  events
}

fn parse_progress_line(line: &str) -> Option<MigrationProgressEvent> {
  let trimmed = line.trim();
  if trimmed.is_empty() || !trimmed.starts_with('[') {
    return None;
  }

  let close_idx = trimmed.find(']')?;
  let channel = trimmed[1..close_idx].trim().to_string();
  if channel.is_empty() {
    return None;
  }

  let mut rest = trimmed[(close_idx + 1)..].trim();
  let mut current = None;
  let mut total = None;

  if rest.starts_with('[') {
    if let Some(rbracket) = rest.find(']') {
      let stage = &rest[1..rbracket];
      let mut parts = stage.split('/');
      if let (Some(a), Some(b)) = (parts.next(), parts.next()) {
        if let (Ok(cur), Ok(all)) = (a.trim().parse::<u32>(), b.trim().parse::<u32>()) {
          current = Some(cur);
          total = Some(all);
        }
      }
      rest = rest[(rbracket + 1)..].trim();
    }
  }

  Some(MigrationProgressEvent {
    channel,
    current,
    total,
    message: rest.to_string(),
  })
}

fn strip_ansi(text: &str) -> String {
  let mut cleaned = String::with_capacity(text.len());
  let bytes = text.as_bytes();
  let mut i = 0;

  while i < bytes.len() {
    if bytes[i] == 0x1b {
      i += 1;
      if i < bytes.len() && bytes[i] == b'[' {
        i += 1;
        while i < bytes.len() {
          let ch = bytes[i] as char;
          if ch.is_ascii_alphabetic() {
            i += 1;
            break;
          }
          i += 1;
        }
      }
      continue;
    }

    cleaned.push(bytes[i] as char);
    i += 1;
  }

  cleaned
}
