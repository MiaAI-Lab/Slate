use serde::Serialize;
use std::borrow::Cow;
use walkdir::{DirEntry, WalkDir};

const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_MATCHES_TOTAL: usize = 500;
const MAX_MATCHES_PER_FILE: usize = 50;

// Directories we never want to descend into during a folder search. Walking
// `.git/objects` or `node_modules` makes a search on a project root take
// minutes and surfaces matches from machine-generated content. Filtering at
// descent time (not after) is what saves the work — `WalkDir`'s `filter_entry`
// prunes the subtree.
const SKIP_DIR_NAMES: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "__pycache__",
    ".venv",
    "venv",
];

fn should_descend(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return true;
    }
    // Always allow the root we were invoked on.
    if entry.depth() == 0 {
        return true;
    }
    let name = match entry.file_name().to_str() {
        Some(n) => n,
        None => return true,
    };
    if name.starts_with('.') {
        return false;
    }
    !SKIP_DIR_NAMES.iter().any(|s| s.eq_ignore_ascii_case(name))
}

#[derive(Serialize)]
pub struct LineMatch {
    pub line: usize,
    pub text: String,
}

#[derive(Serialize)]
pub struct FileMatch {
    pub path: String,
    pub matches: Vec<LineMatch>,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub files: Vec<FileMatch>,
    pub truncated: bool,
}

#[tauri::command]
pub async fn search_files(
    folder: String,
    query: String,
    case_sensitive: bool,
) -> Result<SearchResult, String> {
    if query.is_empty() {
        return Ok(SearchResult { files: vec![], truncated: false });
    }
    let needle = if case_sensitive { query.clone() } else { query.to_lowercase() };
    let mut files: Vec<FileMatch> = vec![];
    let mut total = 0usize;
    let mut truncated = false;

    'outer: for entry in WalkDir::new(&folder)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_descend)
        .filter_map(|e| e.ok())
    {
        if total >= MAX_MATCHES_TOTAL {
            truncated = true;
            break;
        }
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !matches!(ext, "md" | "markdown" | "mdx" | "txt") {
            continue;
        }
        let meta = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > MAX_FILE_BYTES {
            continue;
        }
        let content = match std::fs::read_to_string(path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mut here: Vec<LineMatch> = vec![];
        for (i, line) in content.lines().enumerate() {
            let hay = if case_sensitive { Cow::Borrowed(line) } else { Cow::Owned(line.to_lowercase()) };
            if hay.contains(&needle) {
                here.push(LineMatch {
                    line: i + 1,
                    text: line.chars().take(240).collect(),
                });
                total += 1;
                if here.len() >= MAX_MATCHES_PER_FILE {
                    break;
                }
                if total >= MAX_MATCHES_TOTAL {
                    truncated = true;
                    if !here.is_empty() {
                        files.push(FileMatch {
                            path: path.to_string_lossy().into_owned(),
                            matches: here,
                        });
                    }
                    break 'outer;
                }
            }
        }
        if !here.is_empty() {
            files.push(FileMatch {
                path: path.to_string_lossy().into_owned(),
                matches: here,
            });
        }
    }
    Ok(SearchResult { files, truncated })
}
