use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Serialize)]
pub struct AuditNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
}

#[derive(Deserialize)]
pub struct AuditQueryRequest {
  pub limit: Option<usize>,
  pub cursor: Option<String>,
  pub action: Option<String>,
  pub keyword: Option<String>,
  pub from_ts: Option<String>,
  pub to_ts: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct AuditRecord {
  pub ts: String,
  pub action: String,
  pub context: Value,
}

#[derive(Serialize)]
pub struct AuditQueryResponse {
  pub items: Vec<AuditRecord>,
  pub next_cursor: Option<String>,
  pub has_more: bool,
  pub total: usize,
}

fn read_audit_path() -> crate::FrontendResult<PathBuf> {
  let home = env::var("HOME")
    .map_err(|_| crate::map_command_error("audit", "AUDIT_HOME_NOT_SET", "HOME is not set"))?;
  Ok(PathBuf::from(home).join(".ai_home").join("audit").join("cli-actions.jsonl"))
}

fn parse_cursor(raw: Option<String>) -> crate::FrontendResult<usize> {
  let Some(value) = raw else {
    return Ok(0);
  };
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return Ok(0);
  }
  trimmed.parse::<usize>().map_err(|_| {
    crate::map_command_error(
      "audit",
      "AUDIT_INVALID_CURSOR",
      format!("invalid cursor: {trimmed}"),
    )
  })
}

fn parse_entry(value: Value) -> Option<AuditRecord> {
  let ts = value.get("ts")?.as_str()?.to_string();
  let action = value.get("action")?.as_str()?.to_string();
  let context = value.get("context").cloned().unwrap_or(Value::Null);
  Some(AuditRecord { ts, action, context })
}

fn normalized(text: &str) -> String {
  text.trim().to_ascii_lowercase()
}

#[tauri::command]
pub fn audit_query(request: Option<AuditQueryRequest>) -> crate::FrontendResult<AuditQueryResponse> {
  let req = request.unwrap_or(AuditQueryRequest {
    limit: None,
    cursor: None,
    action: None,
    keyword: None,
    from_ts: None,
    to_ts: None,
  });
  let limit = req.limit.unwrap_or(100).clamp(1, 500);
  let start = parse_cursor(req.cursor)?;
  let action_filter = req
    .action
    .as_deref()
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(String::from);
  let from_ts = req
    .from_ts
    .as_deref()
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(String::from);
  let to_ts = req
    .to_ts
    .as_deref()
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(String::from);
  let keyword_filter = req
    .keyword
    .as_deref()
    .map(str::trim)
    .filter(|v| !v.is_empty())
    .map(normalized);

  let audit_path = read_audit_path()?;
  if !audit_path.exists() {
    return Ok(AuditQueryResponse {
      items: vec![],
      next_cursor: None,
      has_more: false,
      total: 0,
    });
  }

  let file = File::open(&audit_path).map_err(|e| {
    crate::map_command_error(
      "audit",
      "AUDIT_LOG_OPEN_FAILED",
      format!("failed to open audit log {}: {e}", audit_path.display()),
    )
  })?;
  let reader = BufReader::new(file);

  let mut rows: Vec<AuditRecord> = reader
    .lines()
    .map_while(Result::ok)
    .filter_map(|line| {
      let trimmed = line.trim().to_string();
      if trimmed.is_empty() {
        return None;
      }
      serde_json::from_str::<Value>(&trimmed).ok().and_then(parse_entry)
    })
    .filter(|row| match &action_filter {
      Some(action) => &row.action == action,
      None => true,
    })
    .filter(|row| match &from_ts {
      Some(from) => row.ts >= *from,
      None => true,
    })
    .filter(|row| match &to_ts {
      Some(to) => row.ts <= *to,
      None => true,
    })
    .filter(|row| match &keyword_filter {
      Some(keyword) => {
        let action = row.action.to_ascii_lowercase();
        let ts = row.ts.to_ascii_lowercase();
        let context = row.context.to_string().to_ascii_lowercase();
        action.contains(keyword) || ts.contains(keyword) || context.contains(keyword)
      }
      None => true,
    })
    .collect();

  rows.sort_by(|a, b| b.ts.cmp(&a.ts));
  let total = rows.len();

  if start >= total {
    return Ok(AuditQueryResponse {
      items: vec![],
      next_cursor: None,
      has_more: false,
      total,
    });
  }

  let end = (start + limit).min(total);
  let items = rows[start..end].to_vec();
  let has_more = end < total;
  let next_cursor = if has_more {
    Some(end.to_string())
  } else {
    None
  };

  Ok(AuditQueryResponse {
    items,
    next_cursor,
    has_more,
    total,
  })
}

#[tauri::command]
pub fn audit_namespace_info(simulate_error: Option<String>) -> crate::FrontendResult<AuditNamespaceInfo> {
  if let Some(reason) = simulate_error {
    if reason == "storage_unavailable" {
      return Err(crate::map_command_error(
        "audit",
        "AUDIT_STORAGE_UNAVAILABLE",
        "audit storage is unavailable",
      ));
    }
  }

  Ok(AuditNamespaceInfo {
    namespace: "audit",
    commands: vec!["audit_namespace_info", "audit_query"],
  })
}
