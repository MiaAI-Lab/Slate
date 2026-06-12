use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use url::Url;
use uuid::Uuid;

#[tauri::command]
pub async fn export_pdf(app: AppHandle, html: String, title: String) -> Result<(), String> {
    let tmp = std::env::temp_dir().join(format!("slate-export-{}.html", Uuid::new_v4()));
    tokio::fs::write(&tmp, &html)
        .await
        .map_err(|e| e.to_string())?;
    let file_url =
        Url::from_file_path(&tmp).map_err(|_| "Failed to build file URL".to_string())?;

    let tmp_for_cleanup = Arc::new(tmp.clone());
    let closed = Arc::new(AtomicBool::new(false));

    // Init script: trigger window.print() on page load.
    // Unlike the previous afterprint+polling approach, this uses a simple
    // timeout to close the window — avoiding races with Tauri's window
    // destruction lifecycle that caused crashes on close.
    let init_js = "(() => {
        document.addEventListener('DOMContentLoaded', () => {
            document.fonts.ready.then(() => requestAnimationFrame(() => window.print()));
        });
    })();".to_string();

    let window = WebviewWindowBuilder::new(&app, "pdf-export", WebviewUrl::External(file_url))
        .title(&title)
        .visible(true)
        .inner_size(800.0, 1000.0)
        .center()
        .initialization_script(&init_js)
        .build()
        .map_err(|e| e.to_string())?;

    // Handle user closing the window via OS X-button (cancels print, or
    // closes before the print sheet appears). Sets a flag and cleans up
    // the temp file — no window method calls, so safe during destruction.
    {
        let tmp_for_listener = tmp_for_cleanup.clone();
        let closed_for_listener = closed.clone();
        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed | WindowEvent::CloseRequested { .. }) {
                if !closed_for_listener.swap(true, Ordering::SeqCst) {
                    let path = tmp_for_listener.as_path().to_path_buf();
                    tokio::spawn(async move {
                        let _ = tokio::fs::remove_file(path).await;
                    });
                }
            }
        });
    }

    // Safety-net: auto-close the window after 60s if the user never does.
    // This replaces the previous polling loop (which called .title() on a
    // potentially-destroyed window and caused crashes).
    let app2 = app.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(60)).await;
        if !closed.swap(true, Ordering::SeqCst) {
            if let Some(w) = app2.get_webview_window("pdf-export") {
                let _ = w.close();
            }
            let _ = tokio::fs::remove_file(tmp_for_cleanup.as_path()).await;
        }
    });

    Ok(())
}
