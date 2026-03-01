use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::VecDeque;
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

#[derive(Clone, Copy)]
enum CursorMode {
  StableLineIndex(usize),
  LegacyOffset(usize),
}

#[derive(Deserialize)]
struct AuditLine {
  ts: String,
  action: String,
  #[serde(default)]
  context: Value,
}

#[derive(Clone)]
struct IndexedAuditRecord {
  line_index: usize,
  record: AuditRecord,
}

struct AuditFilters {
  action: Option<String>,
  keyword: Option<String>,
  from_ts: Option<String>,
  to_ts: Option<String>,
}

fn read_audit_path() -> crate::FrontendResult<PathBuf> {
  let home = env::var("HOME")
    .map_err(|_| crate::map_command_error("audit", "AUDIT_HOME_NOT_SET", "HOME is not set"))?;
  Ok(PathBuf::from(home).join(".ai_home").join("audit").join("cli-actions.jsonl"))
}

fn parse_cursor(raw: Option<String>) -> crate::FrontendResult<CursorMode> {
  let Some(value) = raw else {
    return Ok(CursorMode::StableLineIndex(usize::MAX));
  };
  let trimmed = value.trim();
  if trimmed.is_empty() {
    return Ok(CursorMode::StableLineIndex(usize::MAX));
  }
  if let Some(raw_index) = trimmed.strip_prefix("idx:") {
    let index = raw_index.parse::<usize>().map_err(|_| {
      crate::map_command_error(
        "audit",
        "AUDIT_INVALID_CURSOR",
        format!("invalid cursor: {trimmed}"),
      )
    })?;
    return Ok(CursorMode::StableLineIndex(index));
  }
  let start = trimmed.parse::<usize>().map_err(|_| {
    crate::map_command_error(
      "audit",
      "AUDIT_INVALID_CURSOR",
      format!("invalid cursor: {trimmed}"),
    )
  })?;
  Ok(CursorMode::LegacyOffset(start))
}

fn parse_entry(line: &str) -> Option<AuditRecord> {
  let parsed = serde_json::from_str::<AuditLine>(line).ok()?;
  Some(AuditRecord {
    ts: parsed.ts,
    action: parsed.action,
    context: parsed.context,
  })
}

fn normalized(text: &str) -> String {
  text.trim().to_ascii_lowercase()
}

fn matches_filters(record: &AuditRecord, filters: &AuditFilters) -> bool {
  if let Some(action) = &filters.action {
    if record.action != *action {
      return false;
    }
  }
  if let Some(from) = &filters.from_ts {
    if record.ts < *from {
      return false;
    }
  }
  if let Some(to) = &filters.to_ts {
    if record.ts > *to {
      return false;
    }
  }
  if let Some(keyword) = &filters.keyword {
    let action = record.action.to_ascii_lowercase();
    let ts = record.ts.to_ascii_lowercase();
    let context = record.context.to_string().to_ascii_lowercase();
    if !action.contains(keyword) && !ts.contains(keyword) && !context.contains(keyword) {
      return false;
    }
  }
  true
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
  let cursor_mode = parse_cursor(req.cursor)?;
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
  let filters = AuditFilters {
    action: action_filter,
    keyword: keyword_filter,
    from_ts,
    to_ts,
  };

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

  let mut total = 0usize;
  let mut stable_window: VecDeque<IndexedAuditRecord> = VecDeque::new();
  let mut legacy_rows: Vec<AuditRecord> = vec![];

  for (line_index, line_res) in reader.lines().enumerate() {
    let Ok(line) = line_res else {
      continue;
    };
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    let Some(record) = parse_entry(trimmed) else {
      continue;
    };
    if !matches_filters(&record, &filters) {
      continue;
    }
    total += 1;
    match cursor_mode {
      CursorMode::LegacyOffset(_) => legacy_rows.push(record),
      CursorMode::StableLineIndex(max_index) => {
        if line_index <= max_index {
          stable_window.push_back(IndexedAuditRecord { line_index, record });
          if stable_window.len() > limit + 1 {
            let _ = stable_window.pop_front();
          }
        }
      }
    }
  }

  match cursor_mode {
    CursorMode::LegacyOffset(start) => {
      legacy_rows.sort_by(|a, b| b.ts.cmp(&a.ts));
      if start >= total {
        return Ok(AuditQueryResponse {
          items: vec![],
          next_cursor: None,
          has_more: false,
          total,
        });
      }

      let end = (start + limit).min(total);
      let items = legacy_rows[start..end].to_vec();
      let has_more = end < total;
      let next_cursor = if has_more { Some(end.to_string()) } else { None };

      return Ok(AuditQueryResponse {
        items,
        next_cursor,
        has_more,
        total,
      });
    }
    CursorMode::StableLineIndex(_) => {}
  }

  if stable_window.is_empty() {
    return Ok(AuditQueryResponse {
      items: vec![],
      next_cursor: None,
      has_more: false,
      total,
    });
  }

  let has_more = stable_window.len() > limit;
  if has_more {
    let _ = stable_window.pop_front();
  }

  let next_cursor = if has_more {
    stable_window
      .front()
      .and_then(|oldest| oldest.line_index.checked_sub(1))
      .map(|next_index| format!("idx:{next_index}"))
  } else {
    None
  };

  let items = stable_window
    .iter()
    .rev()
    .map(|row| row.record.clone())
    .collect::<Vec<AuditRecord>>();

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
