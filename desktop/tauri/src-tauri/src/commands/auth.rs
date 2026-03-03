use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const AUTH_COMMANDS: [&str; 4] = [
  "auth_namespace_info",
  "auth_get_config",
  "auth_set_config",
  "auth_trigger_oauth",
];
const AUTH_ERROR_CODES: [&str; 8] = [
  "AUTH_HOME_NOT_SET",
  "AUTH_INVALID_INPUT",
  "AUTH_UNSUPPORTED_CLI",
  "AUTH_ACCOUNT_NOT_FOUND",
  "AUTH_READ_FAILED",
  "AUTH_WRITE_FAILED",
  "AUTH_EXEC_FAILED",
  "AUTH_COMMAND_FAILED",
];

#[derive(Serialize)]
pub struct AuthNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
  pub error_codes: Vec<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCommandData {
  pub cli_name: String,
  pub account_id: String,
  pub api_key_configured: bool,
  pub api_key_preview: Option<String>,
  pub base_url: Option<String>,
  pub command: Vec<String>,
  pub stdout: String,
  pub stderr: String,
  pub exit_code: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthCommandResponse {
  pub namespace: &'static str,
  pub action: &'static str,
  pub ok: bool,
  pub code: &'static str,
  pub message: String,
  pub data: AuthCommandData,
  pub commands: Vec<&'static str>,
  pub error_codes: Vec<&'static str>,
}

#[derive(Clone)]
struct CliAuthSpec {
  api_keys: &'static [&'static str],
  base_url: Option<&'static str>,
  oauth_action: &'static str,
}

#[derive(Default)]
struct ProcessOutput {
  code: i32,
  stdout: String,
  stderr: String,
}

#[tauri::command]
pub fn auth_namespace_info() -> AuthNamespaceInfo {
  AuthNamespaceInfo {
    namespace: "auth",
    commands: AUTH_COMMANDS.to_vec(),
    error_codes: AUTH_ERROR_CODES.to_vec(),
  }
}

#[tauri::command]
pub fn auth_get_config(cli: String, account_id: String) -> crate::FrontendResult<AuthCommandResponse> {
  let cli_name = sanitize_cli(&cli)?;
  let account = sanitize_account_id(&account_id)?;
  let spec = auth_spec(&cli_name)?;
  ensure_account_exists(&cli_name, &account)?;
  let (configured, preview, base_url) = read_auth_config(&cli_name, &account, &spec)?;

  Ok(build_response(
    "get_config",
    true,
    "AUTH_OK",
    "auth config loaded".to_string(),
    AuthCommandData {
      cli_name,
      account_id: account,
      api_key_configured: configured,
      api_key_preview: preview,
      base_url,
      command: vec![],
      stdout: String::new(),
      stderr: String::new(),
      exit_code: 0,
    },
  ))
}

#[tauri::command]
pub fn auth_set_config(
  cli: String,
  account_id: String,
  api_key: Option<String>,
  base_url: Option<String>,
) -> crate::FrontendResult<AuthCommandResponse> {
  let cli_name = sanitize_cli(&cli)?;
  let account = sanitize_account_id(&account_id)?;
  let spec = auth_spec(&cli_name)?;
  ensure_account_exists(&cli_name, &account)?;

  let api_key_trimmed = api_key.map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
  let base_url_trimmed = base_url.map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
  if api_key_trimmed.is_none() && base_url_trimmed.is_none() {
    return Err(crate::map_command_error(
      "auth",
      "AUTH_INVALID_INPUT",
      "at least one of api_key or base_url is required",
    ));
  }
  if base_url_trimmed.is_some() && spec.base_url.is_none() {
    return Err(crate::map_command_error(
      "auth",
      "AUTH_INVALID_INPUT",
      "base_url is not supported for this cli",
    ));
  }

  write_auth_config(&cli_name, &account, &spec, api_key_trimmed, base_url_trimmed)?;
  let (configured, preview, final_base_url) = read_auth_config(&cli_name, &account, &spec)?;

  Ok(build_response(
    "set_config",
    true,
    "AUTH_OK",
    "auth config updated".to_string(),
    AuthCommandData {
      cli_name,
      account_id: account,
      api_key_configured: configured,
      api_key_preview: preview,
      base_url: final_base_url,
      command: vec![],
      stdout: String::new(),
      stderr: String::new(),
      exit_code: 0,
    },
  ))
}

#[tauri::command]
pub fn auth_trigger_oauth(cli: String, account_id: String) -> crate::FrontendResult<AuthCommandResponse> {
  let cli_name = sanitize_cli(&cli)?;
  let account = sanitize_account_id(&account_id)?;
  let spec = auth_spec(&cli_name)?;
  ensure_account_exists(&cli_name, &account)?;

  let args = vec![cli_name.clone(), account.clone(), spec.oauth_action.to_string()];
  let output = run_aih(&args)?;
  let (configured, preview, base_url) = read_auth_config(&cli_name, &account, &spec)?;
  let ok = output.code == 0;

  Ok(build_response(
    "trigger_oauth",
    ok,
    if ok { "AUTH_OK" } else { "AUTH_COMMAND_FAILED" },
    if ok {
      "oauth trigger command completed".to_string()
    } else {
      "oauth trigger command failed".to_string()
    },
    AuthCommandData {
      cli_name,
      account_id: account,
      api_key_configured: configured,
      api_key_preview: preview,
      base_url,
      command: args,
      stdout: output.stdout,
      stderr: output.stderr,
      exit_code: output.code,
    },
  ))
}

fn build_response(
  action: &'static str,
  ok: bool,
  code: &'static str,
  message: String,
  data: AuthCommandData,
) -> AuthCommandResponse {
  AuthCommandResponse {
    namespace: "auth",
    action,
    ok,
    code,
    message,
    data,
    commands: AUTH_COMMANDS.to_vec(),
    error_codes: AUTH_ERROR_CODES.to_vec(),
  }
}

fn sanitize_cli(raw: &str) -> crate::FrontendResult<String> {
  let cli = raw.trim().to_lowercase();
  if cli.is_empty() {
    return Err(crate::map_command_error("auth", "AUTH_INVALID_INPUT", "cli is required"));
  }
  auth_spec(&cli)?;
  Ok(cli)
}

fn sanitize_account_id(raw: &str) -> crate::FrontendResult<String> {
  let id = raw.trim();
  if id.is_empty() {
    return Err(crate::map_command_error(
      "auth",
      "AUTH_INVALID_INPUT",
      "account_id is required",
    ));
  }
  if !id.chars().all(|c| c.is_ascii_digit()) {
    return Err(crate::map_command_error(
      "auth",
      "AUTH_INVALID_INPUT",
      "account_id must be numeric",
    ));
  }
  Ok(id.to_string())
}

fn auth_spec(cli: &str) -> crate::FrontendResult<CliAuthSpec> {
  match cli {
    "codex" => Ok(CliAuthSpec {
      api_keys: &["OPENAI_API_KEY"],
      base_url: Some("OPENAI_BASE_URL"),
      oauth_action: "login",
    }),
    "claude" => Ok(CliAuthSpec {
      api_keys: &["ANTHROPIC_API_KEY"],
      base_url: Some("ANTHROPIC_BASE_URL"),
      oauth_action: "login",
    }),
    "gemini" => Ok(CliAuthSpec {
      api_keys: &["GEMINI_API_KEY", "GOOGLE_API_KEY"],
      base_url: None,
      oauth_action: "auth",
    }),
    _ => Err(crate::map_command_error(
      "auth",
      "AUTH_UNSUPPORTED_CLI",
      "unsupported cli; use codex | claude | gemini",
    )),
  }
}

fn profiles_root() -> crate::FrontendResult<PathBuf> {
  let home = std::env::var("HOME")
    .map_err(|_| crate::map_command_error("auth", "AUTH_HOME_NOT_SET", "HOME is not set"))?;
  Ok(PathBuf::from(home).join(".ai_home").join("profiles"))
}

fn account_profile_dir(cli: &str, account_id: &str) -> crate::FrontendResult<PathBuf> {
  Ok(profiles_root()?.join(cli).join(account_id))
}

fn env_file_path(cli: &str, account_id: &str) -> crate::FrontendResult<PathBuf> {
  Ok(account_profile_dir(cli, account_id)?.join(".aih_env.json"))
}

fn ensure_account_exists(cli: &str, account_id: &str) -> crate::FrontendResult<()> {
  let p = account_profile_dir(cli, account_id)?;
  if !p.is_dir() {
    return Err(crate::map_command_error(
      "auth",
      "AUTH_ACCOUNT_NOT_FOUND",
      format!("account profile not found: {}", p.display()),
    ));
  }
  Ok(())
}

fn read_auth_config(
  cli: &str,
  account_id: &str,
  spec: &CliAuthSpec,
) -> crate::FrontendResult<(bool, Option<String>, Option<String>)> {
  let env_path = env_file_path(cli, account_id)?;
  let env_obj = read_env_map(&env_path)?;

  let mut api_key_value: Option<String> = None;
  for key in spec.api_keys {
    let raw = env_obj.get(*key).and_then(|v| v.as_str()).map(|v| v.trim().to_string());
    if let Some(v) = raw {
      if !v.is_empty() {
        api_key_value = Some(v);
        break;
      }
    }
  }

  let base_url = spec
    .base_url
    .and_then(|k| env_obj.get(k))
    .and_then(|v| v.as_str())
    .map(|v| v.trim().to_string())
    .filter(|v| !v.is_empty());

  let preview = api_key_value.as_deref().map(mask_secret);
  Ok((api_key_value.is_some(), preview, base_url))
}

fn write_auth_config(
  cli: &str,
  account_id: &str,
  spec: &CliAuthSpec,
  api_key: Option<String>,
  base_url: Option<String>,
) -> crate::FrontendResult<()> {
  let env_path = env_file_path(cli, account_id)?;
  let mut env_obj = read_env_map(&env_path)?;

  if let Some(api_key_value) = api_key {
    // Keep only one active API key for deterministic behavior.
    for key in spec.api_keys {
      env_obj.remove(*key);
    }
    if let Some(primary_key) = spec.api_keys.first() {
      env_obj.insert((*primary_key).to_string(), Value::String(api_key_value));
    }
  }

  if let Some(base_url_value) = base_url {
    if let Some(base_url_key) = spec.base_url {
      env_obj.insert(base_url_key.to_string(), Value::String(base_url_value));
    }
  }

  if let Some(parent) = env_path.parent() {
    fs::create_dir_all(parent).map_err(|e| {
      crate::map_command_error(
        "auth",
        "AUTH_WRITE_FAILED",
        format!("failed to create profile directory {}: {e}", parent.display()),
      )
    })?;
  }

  let body = serde_json::to_string_pretty(&Value::Object(env_obj)).map_err(|e| {
    crate::map_command_error("auth", "AUTH_WRITE_FAILED", format!("failed to encode env json: {e}"))
  })?;
  fs::write(&env_path, format!("{body}\n")).map_err(|e| {
    crate::map_command_error(
      "auth",
      "AUTH_WRITE_FAILED",
      format!("failed to write auth config {}: {e}", env_path.display()),
    )
  })?;

  Ok(())
}

fn read_env_map(path: &Path) -> crate::FrontendResult<Map<String, Value>> {
  if !path.exists() {
    return Ok(Map::new());
  }
  let raw = fs::read_to_string(path).map_err(|e| {
    crate::map_command_error(
      "auth",
      "AUTH_READ_FAILED",
      format!("failed to read auth config {}: {e}", path.display()),
    )
  })?;
  let parsed = serde_json::from_str::<Value>(&raw).map_err(|e| {
    crate::map_command_error(
      "auth",
      "AUTH_READ_FAILED",
      format!("failed to parse auth config {}: {e}", path.display()),
    )
  })?;

  Ok(parsed.as_object().cloned().unwrap_or_default())
}

fn mask_secret(raw: &str) -> String {
  let v = raw.trim();
  if v.is_empty() {
    return String::new();
  }
  if v.len() <= 8 {
    return "***".to_string();
  }
  let prefix = &v[..4];
  let suffix = &v[v.len().saturating_sub(4)..];
  format!("{prefix}...{suffix}")
}

fn run_aih(args: &[String]) -> crate::FrontendResult<ProcessOutput> {
  let resolution = crate::runtime::resolve()?;
  let mut cmd = Command::new(crate::runtime::resolve_node_binary());
  cmd.current_dir(&resolution.root);
  cmd.arg("bin/ai-home.js");
  cmd.args(args);

  let output = cmd.output().map_err(|e| {
    crate::map_command_error(
      "auth",
      "AUTH_EXEC_FAILED",
      format!("failed to execute auth command; io_kind={:?}", e.kind()),
    )
  })?;

  Ok(ProcessOutput {
    code: output.status.code().unwrap_or(-1),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
  })
}
