mod commands;
mod dialog_helper;
mod open_with;
mod watcher;
use commands::{export, files, search, session, titlebar};
use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

// File paths passed on the command line (via "Open with" / argv) that the
// frontend hasn't picked up yet. The frontend invokes `take_pending_open_paths`
// during boot to drain this and open the paths as tabs.
pub struct PendingOpenPaths(pub Mutex<Vec<String>>);

fn collect_file_args<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .skip(1) // argv[0] is the exe path
        .map(|s| s.as_ref().to_string())
        .filter(|a| !a.starts_with("--") && Path::new(a).is_file())
        .collect()
}

#[tauri::command]
fn take_pending_open_paths(state: tauri::State<'_, PendingOpenPaths>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap();
    std::mem::take(&mut *guard)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    open_with::register();

    let initial_paths = collect_file_args(std::env::args());

    let mut builder = tauri::Builder::default();

    // The single-instance plugin forwards a second launch's argv to the first
    // instance. On Windows, this is what makes double-clicking a second file
    // open it as a new tab in the running Slate window instead of spawning a
    // duplicate process. macOS/Linux don't need it for this app's current use
    // case, so it's gated to Windows.
    #[cfg(target_os = "windows")]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = collect_file_args(argv);
            if paths.is_empty() {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_focus();
                }
                return;
            }
            if let Some(state) = app.try_state::<PendingOpenPaths>() {
                state.0.lock().unwrap().extend(paths.clone());
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.emit("open-file", paths);
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }));
    }

    builder
        .manage(PendingOpenPaths(Mutex::new(initial_paths)))
        .manage(watcher::FileWatchers::new())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let fw = app.state::<watcher::FileWatchers>();
            fw.set_app(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::read_file,
            files::write_file,
            files::file_mtime,
            files::watch_file,
            files::unwatch_file,
            files::record_save,
            search::search_files,
            export::export_pdf,
            session::write_draft,
            session::list_drafts,
            session::clear_draft,
            titlebar::set_titlebar_text_color,
            take_pending_open_paths,
            dialog_helper::prepare_open_dialog,
            dialog_helper::dialog_done,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
