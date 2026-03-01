use serde::Serialize;

#[derive(Serialize)]
pub struct MigrationNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
}

#[tauri::command]
pub fn migration_namespace_info(simulate_error: Option<String>) -> crate::FrontendResult<MigrationNamespaceInfo> {
  if let Some(reason) = simulate_error {
    if reason == "unsupported" {
      return Err(crate::map_command_error(
        "migration",
        "MIGRATION_UNSUPPORTED",
        "migration feature is not supported in current context",
      ));
    }
  }

  Ok(MigrationNamespaceInfo {
    namespace: "migration",
    commands: vec!["migration_namespace_info"],
  })
}
