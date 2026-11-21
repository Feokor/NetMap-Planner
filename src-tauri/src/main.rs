#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Deserialize)]
struct FileFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenResult {
    canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn storage_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("каталог данных: {error}"))?
        .join("storage");
    std::fs::create_dir_all(&dir).map_err(|error| format!("создание {dir:?}: {error}"))?;
    Ok(dir)
}

fn storage_file(app: &tauri::AppHandle, key: &str) -> Result<PathBuf, String> {
    let safe: String = key
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' { ch } else { '_' })
        .collect();
    Ok(storage_dir(app)?.join(format!("{safe}.json")))
}

#[tauri::command]
fn storage_get(app: tauri::AppHandle, key: String) -> Result<Option<serde_json::Value>, String> {
    let path = storage_file(&app, &key)?;
    let raw = match std::fs::read_to_string(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("чтение {path:?}: {error}")),
    };
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|error| format!("JSON в {path:?}: {error}"))
}

#[tauri::command]
fn storage_set(app: tauri::AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    let path = storage_file(&app, &key)?;
    let raw = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
    std::fs::write(&path, raw).map_err(|error| format!("запись {path:?}: {error}"))
}

#[tauri::command]
fn storage_remove(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let path = storage_file(&app, &key)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("удаление {path:?}: {error}")),
    }
}

/**
 * Первый запуск Tauri: переносим проекты из каталога Electron-версии
 * (%APPDATA%\vibe-netmap\storage), чтобы пользователь не потерял карты.
 */
fn migrate_electron_storage(app: &tauri::AppHandle) {
    #[cfg(windows)]
    {
        let Ok(app_data) = app.path().app_data_dir() else { return };
        let target = app_data.join("storage");
        let already = std::fs::read_dir(&target)
            .map(|entries| entries.filter_map(Result::ok).next().is_some())
            .unwrap_or(false);
        if already {
            return;
        }
        let Some(roaming) = std::env::var_os("APPDATA") else { return };
        let source = PathBuf::from(roaming).join("vibe-netmap").join("storage");
        let Ok(entries) = std::fs::read_dir(&source) else { return };
        let _ = std::fs::create_dir_all(&target);
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let is_json = path.extension().and_then(|value| value.to_str()) == Some("json");
            if !is_json || !path.is_file() {
                continue;
            }
            if let Some(name) = path.file_name() {
                let _ = std::fs::copy(&path, target.join(name));
            }
        }
    }
}

fn apply_filters(
    dialog: rfd::AsyncFileDialog,
    filters: Option<Vec<FileFilter>>,
) -> rfd::AsyncFileDialog {
    let mut dialog = dialog;
    if let Some(filters) = filters {
        for filter in filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            dialog = dialog.add_filter(&filter.name, &extensions);
        }
    }
    dialog
}

#[tauri::command]
async fn file_save(
    default_name: String,
    text: Option<String>,
    base64: Option<String>,
    filters: Option<Vec<FileFilter>>,
) -> SaveResult {
    let dialog = apply_filters(
        rfd::AsyncFileDialog::new().set_file_name(&default_name),
        filters,
    );
    let Some(handle) = dialog.save_file().await else {
        return SaveResult { canceled: true, file_path: None, error: None };
    };
    let path = handle.path().to_path_buf();
    let bytes = match (text, base64) {
        (Some(text), _) => text.into_bytes(),
        (None, Some(encoded)) => match BASE64.decode(encoded) {
            Ok(bytes) => bytes,
            Err(error) => {
                return SaveResult {
                    canceled: false,
                    file_path: Some(path.display().to_string()),
                    error: Some(format!("base64: {error}")),
                }
            }
        },
        (None, None) => Vec::new(),
    };
    match std::fs::write(&path, bytes) {
        Ok(()) => SaveResult {
            canceled: false,
            file_path: Some(path.display().to_string()),
            error: None,
        },
        Err(error) => SaveResult {
            canceled: false,
            file_path: Some(path.display().to_string()),
            error: Some(error.to_string()),
        },
    }
}

#[tauri::command]
async fn file_open(filters: Option<Vec<FileFilter>>) -> OpenResult {
    let dialog = apply_filters(rfd::AsyncFileDialog::new(), filters);
    let Some(handle) = dialog.pick_file().await else {
        return OpenResult { canceled: true, file_path: None, text: None, error: None };
    };
    let path = handle.path().to_path_buf();
    match std::fs::read_to_string(&path) {
        Ok(text) => OpenResult {
            canceled: false,
            file_path: Some(path.display().to_string()),
            text: Some(text),
            error: None,
        },
        Err(error) => OpenResult {
            canceled: false,
            file_path: Some(path.display().to_string()),
            text: None,
            error: Some(error.to_string()),
        },
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            migrate_electron_storage(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage_get,
            storage_set,
            storage_remove,
            file_save,
            file_open
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска NetMap Planner");
}
