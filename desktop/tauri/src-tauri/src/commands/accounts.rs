use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const EXHAUSTED_COOLDOWN_MS: u128 = 3_600_000;
const ACCOUNTS_COMMANDS: [&str; 3] = ["accounts_namespace_info", "list", "set_default"];
const ACCOUNTS_ERROR_CODES: [&str; 8] = [
  "ACCOUNTS_HOME_NOT_SET",
  "ACCOUNTS_INVALID_INPUT",
  "ACCOUNTS_CLI_REQUIRED",
  "ACCOUNTS_ID_REQUIRED",
  "ACCOUNTS_UNSUPPORTED_CLI",
  "ACCOUNTS_INVALID_ID",
  "ACCOUNTS_NOT_FOUND",
  "ACCOUNTS_DEFAULT_WRITE_FAILED",
];

#[derive(Serialize)]
pub struct AccountsNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum AccountsAction {
  NamespaceInfo,
  List,
  SetDefault,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStatusItem {
  pub id: String,
  pub configured: bool,
  pub account_name: String,
  pub is_default: bool,
  pub is_exhausted: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountsCommandData {
  pub cli_name: Option<String>,
  pub default_id: Option<String>,
  pub default_exists: Option<bool>,
  pub updated_default_id: Option<String>,
  pub accounts: Vec<AccountStatusItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountsCommandResponse {
  pub namespace: &'static str,
  pub action: &'static str,
  pub ok: bool,
  pub code: &'static str,
  pub message: String,
  pub data: AccountsCommandData,
  pub commands: Vec<&'static str>,
  pub error_codes: Vec<&'static str>,
}

fn build_response(
  action: &'static str,
  ok: bool,
  code: &'static str,
  message: String,
  data: AccountsCommandData,
) -> AccountsCommandResponse {
  AccountsCommandResponse {
    namespace: "accounts",
    action,
    ok,
    code,
    message,
    data,
    commands: ACCOUNTS_COMMANDS.to_vec(),
    error_codes: ACCOUNTS_ERROR_CODES.to_vec(),
  }
}

fn supported_cli(cli_name: &str) -> bool {
  matches!(cli_name, "codex" | "claude" | "gemini")
}

fn cli_hidden_dir(cli_name: &str) -> &'static str {
  match cli_name {
    "codex" => ".codex",
    "claude" => ".claude",
    "gemini" => ".gemini",
    _ => ".unknown",
  }
}

fn profiles_root() -> crate::FrontendResult<PathBuf> {
  let home = std::env::var("HOME")
    .map_err(|_| crate::map_command_error("accounts", "ACCOUNTS_HOME_NOT_SET", "HOME is not set"))?;
  Ok(PathBuf::from(home).join(".ai_home").join("profiles"))
}

fn read_text_file(path: &Path) -> Option<String> {
  fs::read_to_string(path).ok().map(|s| s.trim().to_string())
}

fn read_json_value(path: &Path) -> Option<Value> {
  fs::read_to_string(path)
    .ok()
    .and_then(|content| serde_json::from_str::<Value>(&content).ok())
}

fn now_millis() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0)
}

fn is_exhausted(tool_dir: &Path, id: &str) -> bool {
  let exhausted_file = tool_dir.join(id).join(".aih_exhausted");
  let stamp = read_text_file(&exhausted_file)
    .and_then(|raw| raw.parse::<u128>().ok())
    .unwrap_or(0);
  stamp > 0 && now_millis().saturating_sub(stamp) < EXHAUSTED_COOLDOWN_MS
}

fn extract_codex_email_from_auth(auth_json: &Value) -> Option<String> {
  let token = auth_json
    .get("tokens")
    .and_then(|v| v.get("id_token"))
    .and_then(|v| v.as_str())?;
  let mut parts = token.split('.');
  let _ = parts.next();
  let payload = parts.next()?;

  // JWT payload is base64url without padding. We decode manually to avoid extra deps.
  let mut padded = payload.replace('-', "+").replace('_', "/");
  let rem = padded.len() % 4;
  if rem > 0 {
    padded.push_str(&"=".repeat(4 - rem));
  }

  let bytes = base64_simple_decode(&padded)?;
  let decoded = String::from_utf8(bytes).ok()?;
  let json: Value = serde_json::from_str(&decoded).ok()?;
  json.get("email").and_then(|v| v.as_str()).map(str::to_string)
}

fn base64_simple_decode(input: &str) -> Option<Vec<u8>> {
  let mut out = Vec::new();
  let mut block = [0u8; 4];
  let mut block_len = 0usize;

  for ch in input.bytes() {
    let val = match ch {
      b'A'..=b'Z' => ch - b'A',
      b'a'..=b'z' => ch - b'a' + 26,
      b'0'..=b'9' => ch - b'0' + 52,
      b'+' => 62,
      b'/' => 63,
      b'=' => 64,
      _ if ch.is_ascii_whitespace() => continue,
      _ => return None,
    };

    block[block_len] = val;
    block_len += 1;

    if block_len == 4 {
      if block[0] == 64 || block[1] == 64 {
        return None;
      }
      let b0 = (block[0] << 2) | (block[1] >> 4);
      out.push(b0);

      if block[2] != 64 {
        let b1 = ((block[1] & 0x0F) << 4) | (block[2] >> 2);
        out.push(b1);
      }

      if block[3] != 64 {
        let b2 = ((block[2] & 0x03) << 6) | block[3];
        out.push(b2);
      }

      block_len = 0;
    }
  }

  if block_len != 0 {
    return None;
  }
  Some(out)
}

fn check_status(cli_name: &str, profile_dir: &Path) -> (bool, String) {
  let env_path = profile_dir.join(".aih_env.json");
  if let Some(env_json) = read_json_value(&env_path) {
    if let Some(obj) = env_json.as_object() {
      for (key, value) in obj {
        if key.contains("API_KEY") {
          if let Some(raw_key) = value.as_str() {
            if raw_key.len() > 10 {
              return (
                true,
                format!(
                  "API Key: {}...{}",
                  &raw_key[..5],
                  &raw_key[raw_key.len().saturating_sub(4)..]
                ),
              );
            }
            return (true, "API Key Configured".to_string());
          }
        }
      }
    }
    return (true, "API Key Configured".to_string());
  }

  let hidden_dir = profile_dir.join(cli_hidden_dir(cli_name));
  if !hidden_dir.exists() {
    return (false, "Unknown".to_string());
  }

  let mut configured = false;
  if let Ok(mut entries) = fs::read_dir(&hidden_dir) {
    configured = entries.next().is_some();
  }

  let mut account_name = "Unknown".to_string();

  if cli_name == "gemini" {
    let acc_path = hidden_dir.join("google_accounts.json");
    if let Some(json) = read_json_value(&acc_path) {
      if let Some(active) = json.get("active").and_then(|v| v.as_str()) {
        account_name = active.to_string();
      }
    }
  } else if cli_name == "codex" {
    let auth_path = hidden_dir.join("auth.json");
    if let Some(auth_json) = read_json_value(&auth_path) {
      if let Some(email) = extract_codex_email_from_auth(&auth_json) {
        account_name = email;
      }
    }
  } else if cli_name == "claude" {
    let credentials_path = hidden_dir.join(".credentials.json");
    let settings_path = hidden_dir.join("settings.json");
    let credentials_json = read_json_value(&credentials_path);
    let settings_json = read_json_value(&settings_path);

    let has_oauth = credentials_json
      .as_ref()
      .and_then(|j| j.get("claudeAiOauth").or_else(|| j.get("claude_ai_oauth")))
      .map(|oauth| oauth.get("accessToken").or_else(|| oauth.get("access_token")).is_some())
      .unwrap_or(false);

    let has_settings_token = settings_json
      .as_ref()
      .and_then(|j| j.get("env"))
      .and_then(|j| j.get("ANTHROPIC_AUTH_TOKEN"))
      .and_then(|v| v.as_str())
      .map(|s| !s.trim().is_empty())
      .unwrap_or(false);

    if has_oauth {
      account_name = "OAuth Configured".to_string();
    } else if has_settings_token {
      account_name = "Token Configured".to_string();
    } else if settings_path.exists() {
      account_name = "Config Present".to_string();
    }
  }

  (configured, account_name)
}

fn collect_account_ids(tool_dir: &Path) -> Vec<String> {
  let mut ids: Vec<String> = match fs::read_dir(tool_dir) {
    Ok(entries) => entries
      .flatten()
      .filter_map(|entry| {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !file_name.chars().all(|c| c.is_ascii_digit()) {
          return None;
        }
        if !entry.path().is_dir() {
          return None;
        }
        Some(file_name)
      })
      .collect(),
    Err(_) => vec![],
  };

  ids.sort_by_key(|id| id.parse::<u64>().unwrap_or(0));
  ids
}

fn sanitize_account_id(value: Option<String>) -> Option<String> {
  let id = value?;
  if id.chars().all(|c| c.is_ascii_digit()) {
    Some(id)
  } else {
    None
  }
}

fn write_default_account_id(tool_dir: &Path, account_id: &str) -> crate::FrontendResult<()> {
  let target = tool_dir.join(".aih_default");
  let tmp = tool_dir.join(".aih_default.tmp");
  fs::write(&tmp, account_id).map_err(|e| {
    crate::map_command_error(
      "accounts",
      "ACCOUNTS_DEFAULT_WRITE_FAILED",
      format!("failed to write default account temp file: {e}"),
    )
  })?;
  fs::rename(&tmp, &target).map_err(|e| {
    crate::map_command_error(
      "accounts",
      "ACCOUNTS_DEFAULT_WRITE_FAILED",
      format!("failed to finalize default account write: {e}"),
    )
  })?;
  Ok(())
}

fn list_accounts(cli_name: &str) -> crate::FrontendResult<AccountsCommandResponse> {
  if !supported_cli(cli_name) {
    return Ok(build_response(
      "list",
      false,
      "ACCOUNTS_UNSUPPORTED_CLI",
      format!("unsupported cli: {cli_name}"),
      AccountsCommandData {
        cli_name: Some(cli_name.to_string()),
        default_id: None,
        default_exists: None,
        updated_default_id: None,
        accounts: vec![],
      },
    ));
  }

  let tool_dir = match profiles_root() {
    Ok(root) => root.join(cli_name),
    Err(err) => {
      return Ok(build_response(
        "list",
        false,
        err.code,
        err.message,
        AccountsCommandData {
          cli_name: Some(cli_name.to_string()),
          default_id: None,
          default_exists: None,
          updated_default_id: None,
          accounts: vec![],
        },
      ));
    }
  };
  let default_id = sanitize_account_id(read_text_file(&tool_dir.join(".aih_default")));

  if !tool_dir.exists() {
    return Ok(build_response(
      "list",
      true,
      "ACCOUNTS_LIST_OK",
      format!("no accounts found for {cli_name}"),
      AccountsCommandData {
        cli_name: Some(cli_name.to_string()),
        default_id,
        default_exists: Some(false),
        updated_default_id: None,
        accounts: vec![],
      },
    ));
  }

  let ids = collect_account_ids(&tool_dir);
  let default_exists = default_id
    .as_ref()
    .map(|id| ids.iter().any(|x| x == id))
    .unwrap_or(false);

  let accounts = ids
    .iter()
    .map(|id| {
      let profile_dir = tool_dir.join(id);
      let (configured, account_name) = check_status(cli_name, &profile_dir);
      AccountStatusItem {
        id: id.to_string(),
        configured,
        account_name,
        is_default: default_id.as_ref().map(|x| x == id).unwrap_or(false),
        is_exhausted: is_exhausted(&tool_dir, id),
      }
    })
    .collect();

  Ok(build_response(
    "list",
    true,
    "ACCOUNTS_LIST_OK",
    format!("listed accounts for {cli_name}"),
    AccountsCommandData {
      cli_name: Some(cli_name.to_string()),
      default_id,
      default_exists: Some(default_exists),
      updated_default_id: None,
      accounts,
    },
  ))
}

fn set_default_account(cli_name: &str, account_id: &str) -> crate::FrontendResult<AccountsCommandResponse> {
  if !supported_cli(cli_name) {
    return Ok(build_response(
      "set_default",
      false,
      "ACCOUNTS_UNSUPPORTED_CLI",
      format!("unsupported cli: {cli_name}"),
      AccountsCommandData {
        cli_name: Some(cli_name.to_string()),
        default_id: None,
        default_exists: None,
        updated_default_id: None,
        accounts: vec![],
      },
    ));
  }

  if !account_id.chars().all(|c| c.is_ascii_digit()) {
    return Ok(build_response(
      "set_default",
      false,
      "ACCOUNTS_INVALID_ID",
      format!("invalid account id: {account_id}"),
      AccountsCommandData {
        cli_name: Some(cli_name.to_string()),
        default_id: None,
        default_exists: None,
        updated_default_id: None,
        accounts: vec![],
      },
    ));
  }

  let tool_dir = match profiles_root() {
    Ok(root) => root.join(cli_name),
    Err(err) => {
      return Ok(build_response(
        "set_default",
        false,
        err.code,
        err.message,
        AccountsCommandData {
          cli_name: Some(cli_name.to_string()),
          default_id: None,
          default_exists: None,
          updated_default_id: None,
          accounts: vec![],
        },
      ));
    }
  };
  let account_dir = tool_dir.join(account_id);
  if !account_dir.is_dir() {
    return Ok(build_response(
      "set_default",
      false,
      "ACCOUNTS_NOT_FOUND",
      format!("account id {account_id} does not exist for {cli_name}"),
      AccountsCommandData {
        cli_name: Some(cli_name.to_string()),
        default_id: None,
        default_exists: Some(false),
        updated_default_id: None,
        accounts: vec![],
      },
    ));
  }

  if let Err(err) = write_default_account_id(&tool_dir, account_id) {
    return Ok(build_response(
      "set_default",
      false,
      err.code,
      err.message,
      AccountsCommandData {
        cli_name: Some(cli_name.to_string()),
        default_id: None,
        default_exists: None,
        updated_default_id: None,
        accounts: vec![],
      },
    ));
  }

  Ok(build_response(
    "set_default",
    true,
    "ACCOUNTS_SET_DEFAULT_OK",
    format!("set default account to {account_id} for {cli_name}"),
    AccountsCommandData {
      cli_name: Some(cli_name.to_string()),
      default_id: Some(account_id.to_string()),
      default_exists: Some(true),
      updated_default_id: Some(account_id.to_string()),
      accounts: vec![],
    },
  ))
}

#[tauri::command]
pub fn accounts_namespace_info(
  simulate_error: Option<String>,
  action: Option<AccountsAction>,
  cli_name: Option<String>,
  account_id: Option<String>,
) -> crate::FrontendResult<AccountsCommandResponse> {
  if let Some(reason) = simulate_error {
    if reason == "invalid_input" {
      return Ok(build_response(
        "namespace_info",
        false,
        "ACCOUNTS_INVALID_INPUT",
        "invalid input for accounts namespace".to_string(),
        AccountsCommandData {
          cli_name: None,
          default_id: None,
          default_exists: None,
          updated_default_id: None,
          accounts: vec![],
        },
      ));
    }
  }

  match action.unwrap_or(AccountsAction::NamespaceInfo) {
    AccountsAction::NamespaceInfo => Ok(build_response(
      "namespace_info",
      true,
      "ACCOUNTS_NAMESPACE_INFO_OK",
      "accounts namespace ready".to_string(),
      AccountsCommandData {
        cli_name: None,
        default_id: None,
        default_exists: None,
        updated_default_id: None,
        accounts: vec![],
      },
    )),
    AccountsAction::List => {
      let Some(cli) = cli_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
      else {
        return Ok(build_response(
          "list",
          false,
          "ACCOUNTS_CLI_REQUIRED",
          "cli_name is required".to_string(),
          AccountsCommandData {
            cli_name: None,
            default_id: None,
            default_exists: None,
            updated_default_id: None,
            accounts: vec![],
          },
        ));
      };
      list_accounts(cli)
    }
    AccountsAction::SetDefault => {
      let Some(cli) = cli_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
      else {
        return Ok(build_response(
          "set_default",
          false,
          "ACCOUNTS_CLI_REQUIRED",
          "cli_name is required".to_string(),
          AccountsCommandData {
            cli_name: None,
            default_id: None,
            default_exists: None,
            updated_default_id: None,
            accounts: vec![],
          },
        ));
      };
      let Some(id) = account_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
      else {
        return Ok(build_response(
          "set_default",
          false,
          "ACCOUNTS_ID_REQUIRED",
          "account_id is required".to_string(),
          AccountsCommandData {
            cli_name: Some(cli.to_string()),
            default_id: None,
            default_exists: None,
            updated_default_id: None,
            accounts: vec![],
          },
        ));
      };
      set_default_account(cli, id)
    }
  }
}
