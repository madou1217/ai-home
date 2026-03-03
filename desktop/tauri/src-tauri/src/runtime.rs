use std::env;
use std::path::{Path, PathBuf};

const CORE_NS: &str = "core";
const CLI_ENTRY_RELATIVE: &str = "bin/ai-home.js";
const NODE_ENV_VAR: &str = "AIH_DESKTOP_NODE";
const ROOT_ENV_VAR: &str = "AIH_DESKTOP_ROOT";
const RUNTIME_CATEGORY_PATH: &str = "runtime_path";
const RUNTIME_CATEGORY_NODE: &str = "node_binary";

#[derive(Debug, Clone)]
pub struct RuntimeDiagnostic {
  pub category: &'static str,
  pub code: &'static str,
  pub hint: &'static str,
  pub searched: Vec<PathBuf>,
}

pub struct RuntimeResolution {
  pub root: PathBuf,
  pub mode: &'static str,
}

fn has_cli_entry(root: &Path) -> bool {
  root.join(CLI_ENTRY_RELATIVE).exists()
}

fn resolve_from_current_dir() -> Option<PathBuf> {
  let cwd = env::current_dir().ok()?;
  cwd.ancestors().find(|ancestor| has_cli_entry(ancestor)).map(PathBuf::from)
}

fn resolve_from_env() -> Option<PathBuf> {
  let value = env::var(ROOT_ENV_VAR).ok()?;
  let candidate = PathBuf::from(value);
  if has_cli_entry(&candidate) {
    Some(candidate)
  } else {
    None
  }
}

fn resolve_from_executable() -> Option<PathBuf> {
  let exe_path = env::current_exe().ok()?;
  let exe_dir = exe_path.parent()?;
  let candidates = candidate_roots_from_executable(exe_dir);

  candidates.into_iter().find(|candidate| has_cli_entry(candidate))
}

fn candidate_roots_from_executable(exe_dir: &Path) -> Vec<PathBuf> {
  let mut candidates = Vec::new();

  for ancestor in exe_dir.ancestors() {
    candidates.push(ancestor.to_path_buf());
    candidates.push(ancestor.join("resources"));
    candidates.push(ancestor.join("Resources"));
  }

  candidates
}

fn collect_search_candidates() -> Vec<PathBuf> {
  let mut searched = Vec::new();

  if let Ok(cwd) = env::current_dir() {
    for ancestor in cwd.ancestors() {
      searched.push(ancestor.to_path_buf());
    }
  }

  if let Ok(root_env) = env::var(ROOT_ENV_VAR) {
    searched.push(PathBuf::from(root_env));
  }

  if let Ok(exe_path) = env::current_exe() {
    if let Some(exe_dir) = exe_path.parent() {
      searched.extend(candidate_roots_from_executable(exe_dir));
    }
  }

  searched
}

fn format_runtime_not_found_message(diag: &RuntimeDiagnostic) -> String {
  let mut searched = diag
    .searched
    .iter()
    .map(|path| path.display().to_string())
    .collect::<Vec<_>>();
  searched.sort();
  searched.dedup();
  let searched_list = if searched.is_empty() {
    "none".to_string()
  } else {
    searched.join(",")
  };

  format!(
    "failed to locate repository root ({}) and packaged runtime; category={}; code={}; hint={}; searched={}",
    CLI_ENTRY_RELATIVE, diag.category, diag.code, diag.hint, searched_list
  )
}

fn runtime_not_found_diagnostic() -> RuntimeDiagnostic {
  RuntimeDiagnostic {
    category: RUNTIME_CATEGORY_PATH,
    code: "CORE_RUNTIME_NOT_FOUND",
    hint: "Set AIH_DESKTOP_ROOT to a directory containing bin/ai-home.js or reinstall the desktop bundle with runtime resources.",
    searched: collect_search_candidates(),
  }
}

pub fn format_node_runtime_hint() -> String {
  format!(
    "category={}; code=CORE_NODE_NOT_FOUND; hint=Install node or set {} to a valid node executable path.",
    RUNTIME_CATEGORY_NODE, NODE_ENV_VAR
  )
}

pub fn resolve() -> crate::FrontendResult<RuntimeResolution> {
  if let Some(root) = resolve_from_env() {
    return Ok(RuntimeResolution { root, mode: "env" });
  }

  if let Some(root) = resolve_from_current_dir() {
    return Ok(RuntimeResolution { root, mode: "cwd" });
  }

  if let Some(root) = resolve_from_executable() {
    return Ok(RuntimeResolution {
      root,
      mode: "packaged",
    });
  }

  let diagnostics = runtime_not_found_diagnostic();
  Err(crate::map_command_error(
    CORE_NS,
    "CORE_RUNTIME_NOT_FOUND",
    format_runtime_not_found_message(&diagnostics),
  ))
}

pub fn resolve_node_binary() -> String {
  env::var(NODE_ENV_VAR).unwrap_or_else(|_| "node".to_string())
}
