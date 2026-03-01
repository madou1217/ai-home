use serde::Serialize;

#[derive(Serialize)]
pub struct AccountsNamespaceInfo {
  pub namespace: &'static str,
  pub commands: Vec<&'static str>,
}

#[tauri::command]
pub fn accounts_namespace_info(simulate_error: Option<String>) -> crate::FrontendResult<AccountsNamespaceInfo> {
  if let Some(reason) = simulate_error {
    if reason == "invalid_input" {
      return Err(crate::map_command_error(
        "accounts",
        "ACCOUNTS_INVALID_INPUT",
        "invalid input for accounts namespace",
      ));
    }
  }

  Ok(AccountsNamespaceInfo {
    namespace: "accounts",
    commands: vec!["accounts_namespace_info"],
  })
}
