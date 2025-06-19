// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use log::{info, error, debug};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Box {
    id: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    text: String,
}

struct AppState {
    boxes: Mutex<Vec<Box>>,
}

fn do_boxes_intersect(a: &Box, b: &Box) -> bool {
    !(a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height)
}

#[tauri::command]
fn get_all_boxes(state: State<AppState>) -> Vec<Box> {
    state.boxes.lock().unwrap().clone()
}

#[tauri::command]
fn add_box(x: i32, y: i32, width: i32, height: i32, state: State<AppState>) -> Vec<Box> {
    let mut boxes = state.boxes.lock().unwrap();
    let new_box = Box {
        id: Uuid::new_v4().to_string(),
        x,
        y,
        width,
        height,
        text: "".to_string(),
    };
    boxes.push(new_box);
    boxes.clone()
}

#[tauri::command]
fn update_box_text(id: String, text: String, width: i32, height: i32, state: State<AppState>) -> Vec<Box> {
    let mut boxes = state.boxes.lock().unwrap();
    if let Some(box_to_update) = boxes.iter_mut().find(|b| b.id == id) {
        box_to_update.text = text;
        box_to_update.width = width;
        box_to_update.height = height;
    }
    boxes.clone()
}

#[tauri::command]
fn delete_box(id: String, state: State<AppState>) -> Vec<Box> {
    let mut boxes = state.boxes.lock().unwrap();
    boxes.retain(|b| b.id != id);
    boxes.clone()
}

#[tauri::command]
fn move_box(box_id: String, new_x: i32, new_y: i32, state: State<AppState>) -> Vec<Box> {
    let mut boxes_guard = state.boxes.lock().unwrap();
    let original_boxes = boxes_guard.clone();

    let moving_box_index = match boxes_guard.iter().position(|b| b.id == box_id) {
        Some(index) => index,
        None => return original_boxes,
    };

    let (delta_x, delta_y) = {
        let moving_box_ref = &boxes_guard[moving_box_index];
        (new_x - moving_box_ref.x, new_y - moving_box_ref.y)
    };

    if delta_x == 0 && delta_y == 0 {
        return original_boxes;
    }

    let mut to_update: HashMap<String, Box> = HashMap::new();
    let mut queue: VecDeque<String> = VecDeque::new();

    {
        let mut moving_box = boxes_guard[moving_box_index].clone();
        moving_box.x = new_x;
        moving_box.y = new_y;
        to_update.insert(box_id.clone(), moving_box);
        queue.push_back(box_id.clone());
    }

    while let Some(current_id) = queue.pop_front() {
        let moving_box = to_update.get(&current_id).unwrap().clone();

        for other_box in boxes_guard.iter() {
            if to_update.contains_key(&other_box.id) {
                continue;
            }

            if do_boxes_intersect(&moving_box, other_box) {
                let mut new_other_box = other_box.clone();
                new_other_box.x += delta_x;
                new_other_box.y += delta_y;

                if new_other_box.x < 0 || new_other_box.y < 0 {
                    return original_boxes;
                }

                queue.push_back(new_other_box.id.clone());
                to_update.insert(new_other_box.id.clone(), new_other_box);
            }
        }
    }

    let mut final_boxes = original_boxes.clone();
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
                return original_boxes;
            }
        }
    }

    *boxes_guard = final_boxes.clone();
    final_boxes
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::init();
    info!("Starting Kairo application...");
    
    let app_state = AppState {
        boxes: Mutex::new(Vec::new()),
    };
    
    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_all_boxes,
            add_box,
            update_box_text,
            delete_box,
            move_box,
            greet
        ])
        .setup(|app| {
            info!("Application setup completed");
            debug!("App handle: {:?}", app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
