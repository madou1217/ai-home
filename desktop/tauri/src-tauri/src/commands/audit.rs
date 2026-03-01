use serde::Serialize;

#[derive(Serialize)]
pub struct AuditNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
}

#[tauri::command]
pub fn audit_namespace_info(simulate_error: Option<String>) -> Result<AuditNamespaceInfo, crate::FrontendError> {
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
    commands: vec!["audit_namespace_info"],
  })
}
