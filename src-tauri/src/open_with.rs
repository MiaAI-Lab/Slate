// Runtime registration so Slate appears in Windows' "Open with" dialog for any
// file type — not just the extensions declared in `bundle.fileAssociations`.
//
// Writes:
//   HKCU\Software\Classes\Applications\slate.exe
//     FriendlyAppName = "Slate"
//     DefaultIcon     = "<exe>,0"
//     shell\open\command (default) = "<exe>" "%1"
//
// Runs on every launch. Cheap (three string reads after first install) and
// idempotent. Doing it at runtime means MSI-installed copies — which don't run
// our custom NSIS hook — still get registered as soon as the user opens Slate
// once.

#[cfg(target_os = "windows")]
pub fn register() {
    use winreg::enums::*;
    use winreg::RegKey;

    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return,
    };
    let exe_str = match exe.to_str() {
        Some(s) => s.to_string(),
        None => return,
    };

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let base = r"Software\Classes\Applications\slate.exe";

    // Probe existing values so we only write when something is missing or has
    // drifted (e.g. user moved the install). Avoids touching the registry on
    // every launch for the steady state.
    let expected_cmd = format!(r#""{exe_str}" "%1""#);
    if let Ok(app_key) = hkcu.open_subkey(base) {
        if let (Ok(name), Ok(cmd_key)) = (
            app_key.get_value::<String, _>("FriendlyAppName"),
            app_key.open_subkey(r"shell\open\command"),
        ) {
            if let Ok(cmd) = cmd_key.get_value::<String, _>("") {
                if name == "Slate" && cmd == expected_cmd {
                    return;
                }
            }
        }
    }

    let Ok((app_key, _)) = hkcu.create_subkey(base) else { return };
    let _ = app_key.set_value("FriendlyAppName", &"Slate");

    let Ok((icon_key, _)) = hkcu.create_subkey(format!(r"{base}\DefaultIcon")) else { return };
    let _ = icon_key.set_value("", &format!("{exe_str},0"));

    let Ok((cmd_key, _)) = hkcu.create_subkey(format!(r"{base}\shell\open\command")) else { return };
    let _ = cmd_key.set_value("", &expected_cmd);
}

#[cfg(not(target_os = "windows"))]
pub fn register() {}
