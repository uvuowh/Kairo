// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use log::{info, error, debug};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
use tauri::{Emitter, State};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BoundingBox {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
struct Box {
    id: String,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    text: String,
    selected: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
struct Connection {
    from: String,
    to: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct CanvasState {
    boxes: Vec<Box>,
    connections: Vec<Connection>,
}

struct AppState {
    canvas_state: Mutex<CanvasState>,
}

fn do_boxes_intersect(a: &Box, b: &Box) -> bool {
    !(a.x >= b.x + b.width || b.x >= a.x + a.width || a.y >= b.y + b.height || b.y >= a.y + a.height)
}

#[tauri::command]
fn get_full_state(state: State<AppState>) -> CanvasState {
    state.canvas_state.lock().unwrap().clone()
}

#[tauri::command]
fn add_box(x: i32, y: i32, width: i32, height: i32, state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    let new_box = Box {
        id: Uuid::new_v4().to_string(),
        x,
        y,
        width,
        height,
        text: "".to_string(),
        selected: false,
    };
    canvas_state.boxes.push(new_box);
    canvas_state.clone()
}

#[tauri::command]
fn toggle_box_selection(id: String, state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    if let Some(box_to_update) = canvas_state.boxes.iter_mut().find(|b| b.id == id) {
        box_to_update.selected = !box_to_update.selected;
    }
    canvas_state.clone()
}

#[tauri::command]
fn clear_selection(state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    for b in canvas_state.boxes.iter_mut() {
        b.selected = false;
    }
    canvas_state.clone()
}

#[tauri::command]
fn update_box_text(id: String, text: String, width: i32, height: i32, state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    if let Some(box_to_update) = canvas_state.boxes.iter_mut().find(|b| b.id == id) {
        box_to_update.text = text;
        box_to_update.width = width;
        box_to_update.height = height;
    }
    canvas_state.clone()
}

#[tauri::command]
fn delete_box(id: String, state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    canvas_state.boxes.retain(|b| b.id != id);
    canvas_state.connections.retain(|c| c.from != id && c.to != id);
    canvas_state.clone()
}

#[tauri::command]
fn move_box(box_id: String, new_x: i32, new_y: i32, state: State<AppState>) -> CanvasState {
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

                if new_other_box.x < 0 || new_other_box.y < 0 {
                    return original_state;
                }

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
fn move_selected_boxes(delta_x: i32, delta_y: i32, state: State<AppState>) -> CanvasState {
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
            
            if moved_box.x < 0 || moved_box.y < 0 {
                return original_state; 
            }

            to_update.insert(id.clone(), moved_box);
            queue.push_back(id.clone());
        }
    }

    // Cascading logic
    while let Some(current_id) = queue.pop_front() {
        let moving_box = match to_update.get(&current_id) {
            Some(b) => b.clone(),
            None => continue,
        };

        for other_box in canvas_state.boxes.iter() {
            if to_update.contains_key(&other_box.id) {
                continue;
            }

            if do_boxes_intersect(&moving_box, other_box) {
                let mut new_other_box = other_box.clone();
                new_other_box.x += delta_x;
                new_other_box.y += delta_y;

                if new_other_box.x < 0 || new_other_box.y < 0 {
                    return original_state;
                }

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
fn select_boxes(ids: Vec<String>, state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();
    let ids_set: HashSet<String> = ids.into_iter().collect();

    for b in canvas_state.boxes.iter_mut() {
        b.selected = ids_set.contains(&b.id);
    }
    
    canvas_state.clone()
}

#[tauri::command]
fn add_multiple_connections(from_ids: Vec<String>, to_id: String, state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();

    let existing_connections: HashSet<(String, String)> = canvas_state.connections.iter().map(|c| {
        let mut pair = [c.from.as_str(), c.to.as_str()];
        pair.sort();
        (pair[0].to_string(), pair[1].to_string())
    }).collect();

    for from_id in from_ids {
        if from_id == to_id {
            continue;
        }

        let mut new_pair = [from_id.as_str(), to_id.as_str()];
        new_pair.sort();
        let new_conn_tuple = (new_pair[0].to_string(), new_pair[1].to_string());

        if !existing_connections.contains(&new_conn_tuple) {
            canvas_state.connections.push(Connection {
                from: from_id,
                to: to_id.clone(),
            });
        }
    }
    
    canvas_state.clone()
}

#[tauri::command]
fn add_connection(from: String, to: String, state: State<AppState>) -> CanvasState {
    let mut canvas_state = state.canvas_state.lock().unwrap();

    if from == to {
        return canvas_state.clone(); 
    }

    let existing_connections: HashSet<_> = canvas_state.connections.iter().map(|c| {
        let mut pair = [c.from.as_str(), c.to.as_str()];
        pair.sort();
        (pair[0].to_string(), pair[1].to_string())
    }).collect();

    let mut new_pair = [from.as_str(), to.as_str()];
    new_pair.sort();
    let new_conn_tuple = (new_pair[0].to_string(), new_pair[1].to_string());

    if !existing_connections.contains(&new_conn_tuple) {
        canvas_state.connections.push(Connection { from, to });
    }
    
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    env_logger::init();
    info!("Starting Kairo application...");
    
    let app_state = AppState {
        canvas_state: Mutex::new(CanvasState::default()),
    };
    
    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            info!("{}, {argv:?}, {cwd}", app.package_info().name);
            app.emit("single-instance", argv).unwrap();
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_full_state,
            add_box,
            toggle_box_selection,
            clear_selection,
            update_box_text,
            delete_box,
            move_box,
            move_selected_boxes,
            select_boxes,
            add_multiple_connections,
            add_connection,
            load_new_state,
            get_bounding_box,
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
