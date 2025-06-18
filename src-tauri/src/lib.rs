// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use log::{info, error, debug};

#[tauri::command]
fn greet(name: &str) -> String {
    debug!("Greet command called with name: {}", name);
    
    if name.is_empty() {
        error!("Empty name provided to greet command");
        return "Hello, Anonymous! You've been greeted from Rust!".to_string();
    }
    
    info!("Successfully greeted user: {}", name);
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::init();
    info!("Starting Kairo application...");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            info!("Application setup completed");
            debug!("App handle: {:?}", app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
