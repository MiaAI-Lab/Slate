use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static DIALOG_ACTIVE: AtomicBool = AtomicBool::new(false);
static mut HOOK_HANDLE: Option<isize> = None;

#[cfg(target_os = "windows")]
type HOOKPROC = unsafe extern "system" fn(i32, usize, isize) -> isize;

#[cfg(target_os = "windows")]
extern "system" {
    fn SetWindowsHookExW(
        idHook: i32,
        lpfn: Option<HOOKPROC>,
        hmod: isize,
        dwThreadId: u32,
    ) -> isize;
    fn CallNextHookEx(hhk: isize, nCode: i32, wParam: usize, lParam: isize) -> isize;
    fn UnhookWindowsHookEx(hhk: isize) -> i32;
    fn GetForegroundWindow() -> isize;
    fn PostMessageW(hWnd: isize, Msg: u32, wParam: usize, lParam: isize) -> i32;
}

const WH_KEYBOARD_LL: i32 = 13;
const WM_KEYDOWN: u32 = 0x100;
const WM_SYSKEYDOWN: u32 = 0x104;
const WM_CLOSE: u32 = 0x0010;
const VK_ESCAPE: u32 = 0x1B;

#[tauri::command]
pub fn prepare_open_dialog() {
    DIALOG_ACTIVE.store(true, Ordering::SeqCst);

    unsafe {
        if HOOK_HANDLE.is_some() {
            return;
        }
        let hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(low_level_keyboard_proc),
            0,
            0,
        );
        if hook != 0 {
            HOOK_HANDLE = Some(hook);
        }
    }
}

#[tauri::command]
pub fn dialog_done() {
    DIALOG_ACTIVE.store(false, Ordering::SeqCst);
}

#[cfg(target_os = "windows")]
unsafe extern "system" fn low_level_keyboard_proc(
    ncode: i32,
    wparam: usize,
    lparam: isize,
) -> isize {
    if ncode >= 0 && DIALOG_ACTIVE.load(Ordering::SeqCst) {
        if wparam == WM_KEYDOWN as usize || wparam == WM_SYSKEYDOWN as usize {
            // KBDLLHOOKSTRUCT layout: vkCode(u32), scanCode(u32), flags(u32), time(u32), dwExtraInfo(usize)
            let vk_code = *(lparam as *const u32);
            if vk_code == VK_ESCAPE {
                let hwnd = GetForegroundWindow();
                if hwnd != 0 {
                    PostMessageW(hwnd, WM_CLOSE, 0, 0);
                }
            }
        }
    }
    CallNextHookEx(0, ncode, wparam, lparam)
}
