//! DWM title-bar text color. Win11 22H2+ honors DWMWA_TEXT_COLOR; older
//! builds reject it (E_INVALIDARG) and the command quietly no-ops there.

#[cfg(target_os = "windows")]
#[tauri::command]
pub fn set_titlebar_text_color(app: tauri::AppHandle, rgb: Option<u32>) -> Result<(), String> {
    use std::ffi::c_void;
    use tauri::Manager;
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TEXT_COLOR};

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let raw = window.hwnd().map_err(|e| e.to_string())?;
    // Re-wrap the raw pointer with our crate's HWND. Pointer layout is fixed
    // across windows crate versions, so a minor version mismatch with the
    // one Tauri pulls in is harmless.
    let hwnd = HWND(raw.0 as *mut c_void);

    // 0xFFFFFFFF == DWMWA_COLOR_DEFAULT — hands the title-bar text color
    // back to the system (used when caller passes None on theme reset).
    let color: u32 = rgb.unwrap_or(0xFFFFFFFF);
    let cref = COLORREF(color);

    let _ = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_TEXT_COLOR,
            &cref as *const _ as *const c_void,
            std::mem::size_of::<COLORREF>() as u32,
        )
    };
    Ok(())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn set_titlebar_text_color(_rgb: Option<u32>) -> Result<(), String> {
    Ok(())
}
