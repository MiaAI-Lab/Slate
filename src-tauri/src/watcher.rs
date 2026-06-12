use dashmap::DashMap;
use notify::{event::EventKind, recommended_watcher, RecursiveMode, Watcher};
use serde_json::json;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::Emitter;

pub struct WatchEntry {
    pub content: String,
    pub debounce_until: Instant,
}

enum WatcherCmd {
    Watch(String),
    Unwatch(String),
}

/// Internal shared state owned by Arc — used by both the main thread and watcher thread.
struct SharedState {
    entries: DashMap<String, WatchEntry>,
    app: Mutex<Option<tauri::AppHandle>>,
}

pub struct FileWatchers {
    inner: Arc<SharedState>,
    cmd_tx: std::sync::mpsc::Sender<WatcherCmd>,
}

impl FileWatchers {
    pub fn new() -> Self {
        let inner = Arc::new(SharedState {
            entries: DashMap::new(),
            app: Mutex::new(None),
        });

        let (cmd_tx, cmd_rx) = std::sync::mpsc::channel();
        let (event_tx, event_rx) = std::sync::mpsc::channel();

        let mut watcher = recommended_watcher(event_tx).expect("failed to create file watcher");

        let watch_inner = inner.clone();

        std::thread::spawn(move || {
            loop {
                while let Ok(cmd) = cmd_rx.try_recv() {
                    match cmd {
                        WatcherCmd::Watch(path) => {
                            if let Err(e) = watcher.watch(path.as_ref(), RecursiveMode::NonRecursive) {
                                eprintln!("watcher watch error: {e}");
                            }
                        }
                        WatcherCmd::Unwatch(path) => {
                            if let Err(e) = watcher.unwatch(path.as_ref()) {
                                eprintln!("watcher unwatch error: {e}");
                            }
                        }
                    }
                }

                match event_rx.recv_timeout(Duration::from_millis(100)) {
                    Ok(Ok(event)) => {
                        handle_event(&event, &watch_inner);
                    }
                    Ok(Err(e)) => {
                        eprintln!("watcher event error: {e}");
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                }
            }
        });

        Self { inner, cmd_tx }
    }

    pub fn set_app(&self, app: tauri::AppHandle) {
        *self.inner.app.lock().unwrap() = Some(app);
    }

    pub fn watch(&self, path: &str, content: &str) {
        let _ = self.cmd_tx.send(WatcherCmd::Watch(path.to_string()));
        self.inner.entries.insert(path.to_string(), WatchEntry {
            content: content.to_string(),
            debounce_until: Instant::now(),
        });
    }

    pub fn unwatch(&self, path: &str) {
        self.inner.entries.remove(path);
        let _ = self.cmd_tx.send(WatcherCmd::Unwatch(path.to_string()));
    }

    pub fn record_save(&self, path: &str, content: &str) {
        if let Some(mut entry) = self.inner.entries.get_mut(path) {
            entry.content = content.to_string();
        }
    }
}

fn handle_event(event: &notify::Event, state: &Arc<SharedState>) {
    let paths: Vec<String> = event
        .paths
        .iter()
        .filter_map(|p| p.to_str().map(|s| s.to_string()))
        .collect();

    if let EventKind::Remove(_) = event.kind {
        for p in &paths {
            state.entries.remove(p);
            emit_event(state, p);
        }
        return;
    }

    if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
        return;
    }

    for p in &paths {
        if let Some(mut entry) = state.entries.get_mut(p) {
            entry.debounce_until = Instant::now() + Duration::from_millis(500);
        }
    }

    for p in paths {
        let state = state.clone();
        std::thread::spawn(move || {
            // Wait until debounce window passes or entry is removed.
            loop {
                match state.entries.get(&p) {
                    Some(entry) => {
                        if entry.debounce_until <= Instant::now() {
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    None => return,
                }
            }

            let content = match std::fs::read_to_string(&p) {
                Ok(c) => c,
                Err(_) => {
                    emit_event(&state, &p);
                    state.entries.remove(&p);
                    return;
                }
            };

            let changed = match state.entries.get(&p) {
                Some(entry) => content != entry.content,
                None => return,
            };

            if !changed {
                return;
            }

            if let Some(mut entry) = state.entries.get_mut(&p) {
                entry.content = content;
            }

            emit_event(&state, &p);
        });
    }
}

fn emit_event(state: &Arc<SharedState>, path: &str) {
    if let Some(guard) = state.app.lock().ok() {
        if let Some(app) = guard.as_ref() {
            let _ = app.emit("file-changed-externally", json!({ "path": path }));
        }
    }
}
