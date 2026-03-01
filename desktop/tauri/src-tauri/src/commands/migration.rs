use serde::Serialize;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

const NAMESPACE: &str = "migration";

#[derive(Serialize)]
pub struct MigrationNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
}

#[derive(Serialize)]
pub struct MigrationProgressEvent {
  pub stage: &'static str,
  pub status: &'static str,
  pub detail: String,
}

#[derive(Serialize)]
pub struct MigrationCommandResult {
  pub namespace: &'static str,
  pub operation: &'static str,
  pub ok: bool,
  pub code: i32,
  pub reason_code: Option<&'static str>,
  pub message: String,
  pub args: Vec<String>,
  pub progress: Vec<MigrationProgressEvent>,
  pub stdout: String,
  pub stderr: String,
}

#[derive(Clone)]
struct ExecOutput {
  code: i32,
  stdout: String,
  stderr: String,
}

#[tauri::command]
pub fn migration_namespace_info(simulate_error: Option<String>) -> crate::FrontendResult<MigrationNamespaceInfo> {
  if let Some(reason) = simulate_error {
    if reason == "unsupported" {
      return Err(crate::map_command_error(
        NAMESPACE,
        "MIGRATION_UNSUPPORTED",
        "migration feature is not supported in current context",
      ));
    }
  }

  Ok(MigrationNamespaceInfo {
    namespace: NAMESPACE,
    commands: vec![
      "migration_namespace_info",
      "migration_export_profiles",
      "migration_import_profiles",
    ],
  })
}

fn has_aih_entry(root: &Path) -> bool {
  root.join("bin").join("ai-home.js").exists()
}

fn resolve_repo_root() -> crate::FrontendResult<PathBuf> {
  let cwd = env::current_dir().map_err(|e| {
    crate::map_command_error(
      NAMESPACE,
      "MIGRATION_CWD_READ_FAILED",
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
    NAMESPACE,
    "MIGRATION_RUNTIME_UNAVAILABLE",
    "failed to locate repository root (bin/ai-home.js missing)",
  ))
}

fn execute_aih(args: &[String]) -> crate::FrontendResult<ExecOutput> {
  let repo_root = resolve_repo_root()?;
  let output = Command::new("node")
    .current_dir(repo_root)
    .arg("bin/ai-home.js")
    .args(args)
    .output()
    .map_err(|e| {
      crate::map_command_error(
        NAMESPACE,
        "MIGRATION_EXEC_FAILED",
        format!("failed to execute migration command: {e}"),
      )
    })?;

  Ok(ExecOutput {
    code: output.status.code().unwrap_or(-1),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
  })
}

fn infer_failure_reason(operation: &'static str, stderr: &str, stdout: &str) -> &'static str {
  let err = stderr.to_ascii_lowercase();
  let out = stdout.to_ascii_lowercase();
  let combined = format!("{err}\n{out}");

  if combined.contains("enoent")
    || combined.contains("no such file")
    || combined.contains("cannot find")
    || combined.contains("not found")
  {
    return "MIGRATION_FILE_NOT_FOUND";
  }

  if combined.contains("permission denied") || combined.contains("eacces") {
    return "MIGRATION_PERMISSION_DENIED";
  }

  if combined.contains("no matching profiles") {
    return "MIGRATION_NO_MATCHING_PROFILES";
  }

  if operation == "import" && combined.contains("does not contain a profiles/ directory") {
    return "MIGRATION_INVALID_ARCHIVE";
  }

  if combined.contains("passphrase") || combined.contains("password") {
    return "MIGRATION_AUTH_REQUIRED";
  }

  "MIGRATION_COMMAND_FAILED"
}

fn build_result(
  operation: &'static str,
  args: Vec<String>,
  output: ExecOutput,
) -> MigrationCommandResult {
  let ok = output.code == 0;
  let reason_code = if ok {
    None
  } else {
    Some(infer_failure_reason(operation, &output.stderr, &output.stdout))
  };
  let mut progress = vec![
    MigrationProgressEvent {
      stage: "validate_input",
      status: "done",
      detail: "input parameters validated".to_string(),
    },
    MigrationProgressEvent {
      stage: "dispatch_command",
      status: "done",
      detail: "cli command dispatched to ai-home".to_string(),
    },
  ];

  progress.push(MigrationProgressEvent {
    stage: "collect_result",
    status: if ok { "done" } else { "failed" },
    detail: if ok {
      "command completed successfully".to_string()
    } else {
      format!(
        "command failed with reason code {}",
        reason_code.unwrap_or("MIGRATION_COMMAND_FAILED")
      )
    },
  });

  MigrationCommandResult {
    namespace: NAMESPACE,
    operation,
    ok,
    code: output.code,
    reason_code,
    message: if ok {
      format!("{operation} completed")
    } else {
      format!("{operation} failed")
    },
    args,
    progress,
    stdout: output.stdout,
    stderr: output.stderr,
  }
}

#[tauri::command]
pub fn migration_export_profiles(
  output_file: String,
  selectors: Option<Vec<String>>,
) -> crate::FrontendResult<MigrationCommandResult> {
  let export_target = output_file.trim();
  if export_target.is_empty() {
    return Err(crate::map_command_error(
      NAMESPACE,
      "MIGRATION_INVALID_INPUT",
      "export output_file is required",
    ));
  }

  let mut args = vec!["export".to_string(), export_target.to_string()];
  if let Some(selectors) = selectors {
    args.extend(
      selectors
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty()),
    );
  }

  let output = execute_aih(&args)?;
  Ok(build_result("export", args, output))
}

#[tauri::command]
pub fn migration_import_profiles(
  input_file: String,
  overwrite_existing: Option<bool>,
) -> crate::FrontendResult<MigrationCommandResult> {
  let import_target = input_file.trim();
  if import_target.is_empty() {
    return Err(crate::map_command_error(
      NAMESPACE,
      "MIGRATION_INVALID_INPUT",
      "import input_file is required",
    ));
  }

  let mut args = vec!["import".to_string()];
  if overwrite_existing.unwrap_or(false) {
    args.push("-o".to_string());
  }
  args.push(import_target.to_string());

  let output = execute_aih(&args)?;
  Ok(build_result("import", args, output))
}
