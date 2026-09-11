pub mod media_tags;
pub mod scanner;

use base64::prelude::*;
use lofty::file::TaggedFileExt;
use media_tags::{extract_media_tags, MediaTags};
use scanner::{scan_directory, DirectoryContent};

#[tauri::command]
fn select_root_folder() -> Option<String> {
    let folder = rfd::FileDialog::new()
        .set_title("Select Media Library Folder")
        .pick_folder();

    folder.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
async fn read_directory(
    folder_path: String,
    root_path: String,
    force_refresh: Option<bool>,
) -> Result<DirectoryContent, String> {
    tauri::async_runtime::spawn_blocking(move || {
        scan_directory(&folder_path, &root_path, force_refresh.unwrap_or(false))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn clear_cache() {
    scanner::clear_scanner_cache();
}

#[tauri::command]
async fn get_media_tags(file_path: String) -> Result<MediaTags, String> {
    tauri::async_runtime::spawn_blocking(move || extract_media_tags(&file_path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_audio_file(file_path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = std::fs::read(&file_path).map_err(|e| e.to_string())?;
        Ok(tauri::ipc::Response::new(data))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_track_cover_art(file_path: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&file_path);
        if !path.exists() {
            return Ok(None);
        }

        // 1. Prioritize embedded cover art from the audio/video file
        if let Ok(tagged_file) = lofty::probe::Probe::open(path).and_then(|p| p.read()) {
            if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                if let Some(picture) = tag.pictures().first() {
                    let mime = picture.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg");
                    let b64 = BASE64_STANDARD.encode(picture.data());
                    return Ok(Some(format!("data:{};base64,{}", mime, b64)));
                }
            }
        }

        // 2. Fallback to folder-level cover images only if track has no embedded artwork
        if let Some(parent) = path.parent() {
            let common_covers = [
                "cover.jpg", "cover.jpeg", "cover.png",
                "folder.jpg", "folder.jpeg", "folder.png",
                "front.jpg", "front.jpeg", "front.png",
                "album.jpg", "album.jpeg", "album.png",
            ];
            for cname in &common_covers {
                let candidate = parent.join(cname);
                if candidate.is_file() {
                    if let Ok(img_bytes) = std::fs::read(&candidate) {
                        let mime = if cname.ends_with(".png") { "image/png" } else { "image/jpeg" };
                        let b64 = BASE64_STANDARD.encode(&img_bytes);
                        return Ok(Some(format!("data:{};base64,{}", mime, b64)));
                    }
                }
            }
        }

        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_in_explorer(file_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        let clean_path = file_path.replace('/', "\\");
        let mut cmd = Command::new("explorer");
        if path.is_file() {
            cmd.raw_arg(format!(r#"/select,"{}""#, clean_path));
        } else {
            cmd.raw_arg(format!(r#""{}""#, clean_path));
        }
        cmd.spawn().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if path.is_file() {
            Command::new("open")
                .args(["-R", &file_path])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            Command::new("open")
                .arg(&file_path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let target = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn hide_to_tray(window: tauri::WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

struct TrayMenuItems {
    play_pause: MenuItem<tauri::Wry>,
    next: MenuItem<tauri::Wry>,
    prev: MenuItem<tauri::Wry>,
}

#[tauri::command]
fn update_tray_playback_state(
    state: tauri::State<'_, TrayMenuItems>,
    has_track: bool,
    is_playing: Option<bool>,
) -> Result<(), String> {
    state.play_pause.set_enabled(has_track).map_err(|e| e.to_string())?;
    state.next.set_enabled(has_track).map_err(|e| e.to_string())?;
    state.prev.set_enabled(has_track).map_err(|e| e.to_string())?;

    if has_track {
        if let Some(playing) = is_playing {
            let text = if playing { "Pause" } else { "Play" };
            let _ = state.play_pause.set_text(text);
        }
    } else {
        let _ = state.play_pause.set_text("Play / Pause");
    }
    Ok(())
}

use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()
        .setup(|app| {
            // Disabled by default until a track is selected
            let play_pause_item = MenuItem::with_id(app, "play_pause", "Play / Pause", false, None::<&str>)?;
            let next_item = MenuItem::with_id(app, "next", "Next Track", false, None::<&str>)?;
            let prev_item = MenuItem::with_id(app, "prev", "Previous Track", false, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let show_item = MenuItem::with_id(app, "show", "Open MEEDIA", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;

            app.manage(TrayMenuItems {
                play_pause: play_pause_item.clone(),
                next: next_item.clone(),
                prev: prev_item.clone(),
            });

            let tray_menu = Menu::with_items(
                app,
                &[&play_pause_item, &next_item, &prev_item, &sep, &show_item, &quit_item],
            )?;

            if let Some(icon) = app.default_window_icon() {
                let _tray = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .tooltip("MEEDIA")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "play_pause" => {
                            let _ = app.emit("tray-play-pause", ());
                        }
                        "next" => {
                            let _ = app.emit("tray-next", ());
                        }
                        "prev" => {
                            let _ = app.emit("tray-prev", ());
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_background_color(Some(tauri::webview::Color(0, 0, 0, 255)));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("request-close-prompt", ());
            }
        })
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("stream", |_ctx, request, responder| {
            std::thread::spawn(move || {
                if request.method() == "OPTIONS" {
                    let response = tauri::http::Response::builder()
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                        .header("Access-Control-Allow-Headers", "*")
                        .status(204)
                        .body(Vec::<u8>::new())
                        .unwrap();
                    responder.respond(response);
                    return;
                }

            let path_str = request.uri().path();
            let mut bytes = Vec::new();
            let mut chars = path_str.chars().peekable();
            while let Some(c) = chars.next() {
                if c == '%' {
                    let hex: String = chars.by_ref().take(2).collect();
                    if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                        bytes.push(byte);
                    }
                } else {
                    let mut b = [0u8; 4];
                    let s = c.encode_utf8(&mut b);
                    bytes.extend_from_slice(s.as_bytes());
                }
            }
            let decoded = String::from_utf8_lossy(&bytes).to_string();

            let clean_path = if decoded.starts_with('/') && decoded.len() > 3 && decoded.chars().nth(2) == Some(':') {
                decoded[1..].to_string()
            } else {
                decoded
            };

            let file_path = std::path::PathBuf::from(&clean_path);
            if let Ok(mut file) = std::fs::File::open(&file_path) {
                if let Ok(metadata) = file.metadata() {
                    let file_size = metadata.len();
                    let mut start = 0u64;
                    let mut end = file_size.saturating_sub(1);
                    let mut is_range = false;

                    if let Some(range_header) = request.headers().get("range") {
                        if let Ok(range_str) = range_header.to_str() {
                            if let Some(stripped) = range_str.strip_prefix("bytes=") {
                                let parts: Vec<&str> = stripped.split('-').collect();
                                if let Ok(s) = parts[0].parse::<u64>() {
                                    start = s;
                                    is_range = true;
                                }
                                if parts.len() > 1 && !parts[1].is_empty() {
                                    if let Ok(e) = parts[1].parse::<u64>() {
                                        end = std::cmp::min(e, file_size.saturating_sub(1));
                                    }
                                } else {
                                    end = file_size.saturating_sub(1);
                                }
                            }
                        }
                    }

                    let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    let mime_type = match ext.as_str() {
                        "mp3" => "audio/mpeg",
                        "flac" => "audio/flac",
                        "wav" => "audio/wav",
                        "ogg" | "oga" => "audio/ogg",
                        "m4a" => "audio/mp4",
                        "aac" => "audio/aac",
                        "mp4" => "video/mp4",
                        "mkv" => "video/x-matroska",
                        "webm" => "video/webm",
                        _ => "application/octet-stream",
                    };

                    let is_video = matches!(ext.as_str(), "mp4" | "mkv" | "webm" | "mov");
                    let is_container = is_video || matches!(ext.as_str(), "m4a" | "aac");

                    // Video files need 16 MB chunks to prevent decoder buffer starvation during fullscreen transitions
                    // Audio containers (m4a, aac) use 2 MB which provides ~1-2 minutes of audio per chunk
                    let max_chunk: u64 = if is_video {
                        16 * 1024 * 1024 // 16 MB for video: saturates player forward buffer instantly
                    } else {
                        2 * 1024 * 1024  // 2 MB for audio: lean RAM footprint
                    };

                    if is_container || is_range {
                        if (end - start + 1) > max_chunk {
                            end = std::cmp::min(start + max_chunk - 1, file_size.saturating_sub(1));
                        }
                        is_range = true;
                    }

                    let length = if end >= start { (end - start) + 1 } else { 0 };
                    let mut buffer = vec![0u8; length as usize];
                    use std::io::{Read, Seek, SeekFrom};
                    let _ = file.seek(SeekFrom::Start(start));
                    let _ = file.read_exact(&mut buffer);

                    let mut builder = tauri::http::Response::builder()
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
                        .header("Access-Control-Allow-Headers", "*")
                        .header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
                        .header("Accept-Ranges", "bytes")
                        .header("Content-Type", mime_type)
                        .header("Content-Length", length.to_string());

                    if is_range {
                        builder = builder
                            .status(206)
                            .header("Content-Range", format!("bytes {}-{}/{}", start, end, file_size));
                    } else {
                        builder = builder.status(200);
                    }

                    if let Ok(res) = builder.body(buffer) {
                        responder.respond(res);
                        return;
                    }
                }
            }

            let response = tauri::http::Response::builder()
                .header("Access-Control-Allow-Origin", "*")
                .status(404)
                .body(Vec::<u8>::new())
                .unwrap();
            responder.respond(response);
            });
        })
        .invoke_handler(tauri::generate_handler![
            select_root_folder,
            read_directory,
            get_media_tags,
            get_track_cover_art,
            read_audio_file,
            clear_cache,
            hide_to_tray,
            exit_app,
            update_tray_playback_state,
            open_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
