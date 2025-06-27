// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use log::{info, error, debug};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use tauri::{Emitter, State, Wry, Builder, Manager};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum ConnectionType {
    None,
    Forward,
    Bidirectional,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BoundingBox {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Box {
    pub id: String,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub text: String,
    pub selected: bool,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Connection {
    pub from: String,
    pub to: String,
    pub r#type: ConnectionType,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CanvasState {
    pub boxes: Vec<Box>,
    pub connections: Vec<Connection>,
}

pub struct AppState {
    canvas_state: Mutex<CanvasState>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ConfigFile {
    workspace_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    name: String,
    path: String,
    is_directory: bool,
    children: Option<Vec<FileNode>>,
}

fn get_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle.path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    Ok(config_dir.join("config.json"))
}

fn read_config(app_handle: &tauri::AppHandle) -> Result<ConfigFile, String> {
    let config_path = get_config_path(app_handle)?;
    if !config_path.exists() {
        return Ok(ConfigFile { workspace_path: None });
    }
    let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_config(app_handle: &tauri::AppHandle, config: &ConfigFile) -> Result<(), String> {
    let config_path = get_config_path(app_handle)?;
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_workspace_path(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    read_config(&app_handle).map(|config| config.workspace_path)
}

#[tauri::command]
fn set_workspace_path(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let mut config = read_config(&app_handle).unwrap_or(ConfigFile { workspace_path: None });
    config.workspace_path = Some(path);
    write_config(&app_handle, &config)
}

#[tauri::command]
fn list_directory_contents(path: String) -> Result<Vec<FileNode>, String> {
    info!("Reading directory contents for: {}", path);
    let mut entries = Vec::new();

    if !std::path::Path::new(&path).exists() {
        return Ok(entries);
    }

    for entry in fs::read_dir(&path).map_err(|e| format!("Failed to read directory {}: {}", path, e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        
        if path.is_dir() {
            // Recursively call for subdirectories
            let children = list_directory_contents(path.to_string_lossy().to_string())?;
            entries.push(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_directory: true,
                children: Some(children),
            });
        } else if let Some(extension) = path.extension() {
            if extension == "kairo" {
                entries.push(FileNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_directory: false,
                    children: None,
                });
            }
        }
    }

    entries.sort_by(|a, b| {
        if a.is_directory == b.is_directory {
            a.name.cmp(&b.name)
        } else if a.is_directory {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(entries)
}

fn do_boxes_intersect(a: &Box, b: &Box) -> bool {
    !(a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height)
}

#[tauri::command]
fn get_full_state(state: State<AppState>) -> CanvasState {
    state.canvas_state.lock().unwrap().clone()
}

#[tauri::command]
fn add_box(state: State<AppState>, id: String, x: i32, y: i32, width: i32, height: i32, text: String, selected: bool, color: Option<String>) {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    let new_box = Box { id, x, y, width, height, text, selected, color };
    canvas_state.boxes.push(new_box);
}

#[tauri::command]
fn update_box_text(state: State<AppState>, id: String, text: String, width: i32, height: i32) {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    if let Some(box_to_update) = canvas_state.boxes.iter_mut().find(|b| b.id == id) {
        box_to_update.text = text;
        box_to_update.width = width;
        box_to_update.height = height;
    }
}

#[tauri::command]
fn delete_box(state: State<AppState>, id: String) {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    canvas_state.boxes.retain(|b| b.id != id);
    canvas_state.connections.retain(|c| c.from != id && c.to != id);
}

#[tauri::command]
fn add_connection(state: State<AppState>, from: String, to: String) {
    if from == to {
        return; // Prevent self-connection
    }
    let mut canvas_state = state.canvas_state.lock().unwrap();

    // Prevent duplicate connections
    let connection_exists = canvas_state.connections.iter().any(|c| 
        (c.from == from && c.to == to) || (c.from == to && c.to == from)
    );

    if !connection_exists {
        canvas_state.connections.push(Connection { from, to, r#type: ConnectionType::Forward });
    }
}

#[tauri::command]
fn toggle_box_selection(state: State<AppState>, id: String) {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    if let Some(box_to_toggle) = canvas_state.boxes.iter_mut().find(|b| b.id == id) {
        box_to_toggle.selected = !box_to_toggle.selected;
    }
}

#[tauri::command]
fn clear_selection(state: State<AppState>) {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    for b in &mut canvas_state.boxes {
        b.selected = false;
    }
}

#[tauri::command]
fn select_boxes(state: State<AppState>, ids: Vec<String>) {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    let ids_set: HashSet<String> = ids.into_iter().collect();
    for b in &mut canvas_state.boxes {
        b.selected = ids_set.contains(&b.id);
    }
}

#[tauri::command]
fn toggle_connections(state: State<AppState>, from_ids: Vec<String>, to_id: String) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();

    for from_id in from_ids {
        if from_id == to_id {
            continue;
        }

        let connection_index = canvas_state.connections.iter().position(|c|
            (&c.from == &from_id && &c.to == &to_id) || (&c.from == &to_id && &c.to == &from_id)
        );

        if let Some(index) = connection_index {
            // Connection exists, toggle its state.
            let mut conn = canvas_state.connections.remove(index);

            if conn.r#type == ConnectionType::Bidirectional {
                // Downgrade to a single connection in the opposite direction of the action.
                conn.from = to_id.clone();
                conn.to = from_id;
                conn.r#type = ConnectionType::Forward;
                canvas_state.connections.push(conn);
            } else if conn.r#type == ConnectionType::Forward {
                if conn.from == from_id {
                    // Action A->B on existing A->B connection: remove.
                } else { // conn.from == to_id
                    // Action A->B on existing B->A connection: upgrade.
                    conn.r#type = ConnectionType::Bidirectional;
                    canvas_state.connections.push(conn);
                }
            } else { // conn.r#type == ConnectionType::None
                // It was a connection with no direction, now it gets one.
                conn.from = from_id;
                conn.to = to_id.clone();
                conn.r#type = ConnectionType::Forward;
                canvas_state.connections.push(conn);
            }
        } else {
            // No connection exists, create a new one.
            canvas_state.connections.push(Connection {
                from: from_id,
                to: to_id.clone(),
                r#type: ConnectionType::Forward,
            });
        }
    }

    canvas_state.clone()
}

#[tauri::command]
fn cycle_connection_type(state: State<AppState>, from: String, to: String) -> Option<Connection> {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    if let Some(connection) = canvas_state.connections.iter_mut().find(|c| 
        (c.from == from && c.to == to) || (c.from == to && c.to == from)
    ) {
        connection.r#type = match connection.r#type {
            ConnectionType::None => ConnectionType::Forward,
            ConnectionType::Forward => ConnectionType::Bidirectional,
            ConnectionType::Bidirectional => ConnectionType::None,
        };
        Some(connection.clone())
    } else {
        None
    }
}

#[tauri::command]
fn move_box(state: State<AppState>, box_id: String, new_x: i32, new_y: i32) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    let original_state = canvas_state.clone();

    let moving_box_index = match canvas_state.boxes.iter().position(|b| b.id == box_id) {
        Some(index) => index,
        None => return original_state,
    };

    let (delta_x, delta_y) = {
        let moving_box_ref = &canvas_state.boxes[moving_box_index];
        (new_x - moving_box_ref.x, new_y - moving_box_ref.y)
    };

    if delta_x == 0 && delta_y == 0 {
        return original_state;
    }

    let mut to_update: HashMap<String, Box> = HashMap::new();
    let mut queue: VecDeque<String> = VecDeque::new();

    {
        let mut moving_box = canvas_state.boxes[moving_box_index].clone();
        moving_box.x = new_x;
        moving_box.y = new_y;
        to_update.insert(box_id.clone(), moving_box);
        queue.push_back(box_id.clone());
    }

    while let Some(current_id) = queue.pop_front() {
        let moving_box = to_update.get(&current_id).unwrap().clone();

        for other_box in canvas_state.boxes.iter() {
            if to_update.contains_key(&other_box.id) {
                continue;
            }

            if do_boxes_intersect(&moving_box, other_box) {
                let mut new_other_box = other_box.clone();
                new_other_box.x += delta_x;
                new_other_box.y += delta_y;

                queue.push_back(new_other_box.id.clone());
                to_update.insert(new_other_box.id.clone(), new_other_box);
            }
        }
    }
    
    let mut final_boxes = original_state.boxes.clone();
    for b in final_boxes.iter_mut() {
        if let Some(updated_box) = to_update.get(&b.id) {
            *b = updated_box.clone();
        }
    }

    for updated_box in to_update.values() {
        for other_box in final_boxes.iter() {
            if to_update.contains_key(&other_box.id) {
                continue;
            }
            if do_boxes_intersect(updated_box, other_box) {
                return original_state;
            }
        }
    }

    canvas_state.boxes = final_boxes;
    canvas_state.clone()
}

#[tauri::command]
fn move_selected_boxes(state: State<AppState>, delta_x: i32, delta_y: i32) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    if delta_x == 0 && delta_y == 0 {
        return canvas_state.clone();
    }
    
    let original_state = canvas_state.clone();

    let selected_ids: HashSet<String> = canvas_state.boxes.iter()
        .filter(|b| b.selected)
        .map(|b| b.id.clone())
        .collect();

    if selected_ids.is_empty() {
        return canvas_state.clone();
    }

    let mut to_update: HashMap<String, Box> = HashMap::new();
    let mut queue: VecDeque<String> = VecDeque::new();

    for id in &selected_ids {
        if let Some(box_to_move) = canvas_state.boxes.iter().find(|b| &b.id == id) {
            let mut moved_box = box_to_move.clone();
            moved_box.x += delta_x;
            moved_box.y += delta_y;

            to_update.insert(id.clone(), moved_box);
            queue.push_back(id.clone());
        }
    }

    // Cascading logic
    while let Some(current_id) = queue.pop_front() {
        if let Some(moving_box) = to_update.get(&current_id).cloned() {
        for other_box in canvas_state.boxes.iter() {
            if to_update.contains_key(&other_box.id) {
                continue;
            }

            if do_boxes_intersect(&moving_box, other_box) {
                let mut new_other_box = other_box.clone();
                new_other_box.x += delta_x;
                new_other_box.y += delta_y;

                    queue.push_back(new_other_box.id.clone());
                    to_update.insert(new_other_box.id.clone(), new_other_box);
                }
            }
        }
    }
    
    let mut final_boxes = original_state.boxes.clone();
    for b in final_boxes.iter_mut() {
        if let Some(updated_box) = to_update.get(&b.id) {
            *b = updated_box.clone();
        }
    }

    // Final collision check
    for updated_box in to_update.values() {
        for other_box in final_boxes.iter() {
            if to_update.contains_key(&other_box.id) {
                continue;
            }
            if do_boxes_intersect(updated_box, other_box) {
                return original_state;
            }
        }
    }

    canvas_state.boxes = final_boxes;
    canvas_state.clone()
}

#[tauri::command]
fn load_new_state(new_state: CanvasState, state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    *canvas_state = new_state;
    canvas_state.clone()
}

#[tauri::command]
fn get_bounding_box(state: State<AppState>) -> Option<BoundingBox> {
    let canvas_state = state.canvas_state.lock().unwrap();
    if canvas_state.boxes.is_empty() {
        return None;
    }

    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;

    for b in canvas_state.boxes.iter() {
        min_x = min_x.min(b.x);
        min_y = min_y.min(b.y);
        max_x = max_x.max(b.x + b.width);
        max_y = max_y.max(b.y + b.height);
    }

    Some(BoundingBox {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    })
}

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

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    info!("Attempting to delete file: {}", path);
    match fs::remove_file(path) {
        Ok(_) => {
            info!("Successfully deleted file");
            Ok(())
        }
        Err(e) => {
            error!("Failed to delete file: {}", e);
            Err(e.to_string())
        }
    }
}

#[derive(Default)]
pub struct AppBuilder {
    canvas_state: CanvasState,
}

impl AppBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_canvas_state(mut self, state: CanvasState) -> Self {
        self.canvas_state = state;
        self
    }

    pub fn build(self) -> Builder<Wry> {
    let app_state = AppState {
            canvas_state: Mutex::new(self.canvas_state),
    };
    
        Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
                println!("{}, {argv:?}, {cwd}", app.package_info().name);
            app.emit("single-instance", argv).unwrap();
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
            .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_full_state,
            add_box,
            delete_box,
            update_box_text,
            add_connection,
            move_box,
            toggle_box_selection,
            clear_selection,
            select_boxes,
            move_selected_boxes,
            toggle_connections,
            cycle_connection_type,
            get_bounding_box,
            load_new_state,
            greet,
            delete_file,
            get_workspace_path,
            set_workspace_path,
            list_directory_contents
        ])
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    AppBuilder::new()
        .build()
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // This closure can be used to handle events.
        });
}
