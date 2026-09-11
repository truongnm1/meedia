use crate::media_tags::{format_duration, format_size};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use walkdir::WalkDir;
use rayon::prelude::*;

static DIRECTORY_CACHE: OnceLock<RwLock<HashMap<String, DirectoryContent>>> = OnceLock::new();

fn get_cache() -> &'static RwLock<HashMap<String, DirectoryContent>> {
    DIRECTORY_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

pub fn clear_scanner_cache() {
    if let Ok(mut cache) = get_cache().write() {
        cache.clear();
    }
}

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "alac"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mkv", "mov"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BreadcrumbItem {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderItem {
    pub name: String,
    pub path: String,
    pub item_count: usize,
    pub media_count: usize,
    #[serde(default)]
    pub audio_count: usize,
    #[serde(default)]
    pub video_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaItem {
    pub name: String,
    pub path: String,
    pub extension: String,
    pub media_type: String, // "audio" | "video"
    pub size_bytes: u64,
    pub size_formatted: String,
    pub duration_secs: Option<f64>,
    pub duration_formatted: Option<String>,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub cover_art: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DirectoryContent {
    pub current_path: String,
    pub root_path: String,
    pub relative_path: String,
    pub parent_path: Option<String>,
    pub breadcrumbs: Vec<BreadcrumbItem>,
    pub subdirectories: Vec<FolderItem>,
    pub media_files: Vec<MediaItem>,
    pub total_media_count: usize,
}

fn is_audio(ext: &str) -> bool {
    AUDIO_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

fn is_video(ext: &str) -> bool {
    VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

fn count_media_in_dir(path: &Path) -> (usize, usize, usize, usize) {
    let mut total_items = 0;
    let mut audio_items = 0;
    let mut video_items = 0;

    for entry in WalkDir::new(path)
        .min_depth(1)
        .max_depth(3)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "$RECYCLE.BIN"
        })
        .flatten()
    {
        total_items += 1;
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if is_audio(&ext_lower) {
                    audio_items += 1;
                } else if is_video(&ext_lower) {
                    video_items += 1;
                }
            }
        }
    }

    (total_items, audio_items + video_items, audio_items, video_items)
}

pub fn scan_all_tracks(root_dir: &str, force_refresh: bool) -> Result<DirectoryContent, String> {
    let cache_key = format!("{}:__ALL_TRACKS__", root_dir);
    if !force_refresh {
        if let Ok(cache) = get_cache().read() {
            if let Some(content) = cache.get(&cache_key) {
                return Ok(content.clone());
            }
        }
    }

    let root_path = Path::new(root_dir);
    if !root_path.exists() || !root_path.is_dir() {
        return Err(format!("Root directory does not exist: {}", root_dir));
    }

    let root_name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root_dir.to_string());

    let breadcrumbs = vec![
        BreadcrumbItem {
            name: root_name,
            path: root_path.to_string_lossy().to_string(),
        },
        BreadcrumbItem {
            name: "All Tracks".to_string(),
            path: "__ALL_TRACKS__".to_string(),
        },
    ];

    let file_paths: Vec<PathBuf> = WalkDir::new(root_path)
        .min_depth(1)
        .max_depth(15)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "$RECYCLE.BIN"
        })
        .flatten()
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();

    let mut media_files: Vec<MediaItem> = file_paths
        .into_par_iter()
        .filter_map(|path| {
            let ext = path.extension()?.to_str()?;
            let ext_lower = ext.to_lowercase();
            let is_aud = is_audio(&ext_lower);
            let is_vid = is_video(&ext_lower);

            if !is_aud && !is_vid {
                return None;
            }

            let media_type = if is_vid {
                "video".to_string()
            } else {
                "audio".to_string()
            };

            let metadata = fs::metadata(&path).ok();
            let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
            let size_formatted = format_size(size_bytes);

            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let mut title = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| name.clone());
            let mut artist = None;
            let mut album = None;
            let mut duration_secs = None;
            let mut duration_formatted = None;

            if let Ok(tagged_file) = Probe::open(&path).and_then(|p| p.read()) {
                let props = tagged_file.properties();
                let dur = props.duration().as_secs_f64();
                if dur > 0.0 {
                    duration_secs = Some(dur);
                    duration_formatted = Some(format_duration(dur));
                }

                if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                    if let Some(t) = tag.title() {
                        title = t.to_string();
                    }
                    artist = tag.artist().map(|s| s.to_string());
                    album = tag.album().map(|s| s.to_string());
                }
            }

            Some(MediaItem {
                name,
                path: path.to_string_lossy().to_string(),
                extension: ext_lower.to_uppercase(),
                media_type,
                size_bytes,
                size_formatted,
                duration_secs,
                duration_formatted,
                title,
                artist,
                album,
                cover_art: None,
            })
        })
        .collect();

    media_files.par_sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    let total_media_count = media_files.len();

    let content = DirectoryContent {
        current_path: "__ALL_TRACKS__".to_string(),
        root_path: root_path.to_string_lossy().to_string(),
        relative_path: "All Tracks".to_string(),
        parent_path: Some(root_path.to_string_lossy().to_string()),
        breadcrumbs,
        subdirectories: Vec::new(),
        media_files,
        total_media_count,
    };

    if let Ok(mut cache) = get_cache().write() {
        cache.insert(cache_key, content.clone());
    }

    Ok(content)
}

pub fn scan_directory(current_dir: &str, root_dir: &str, force_refresh: bool) -> Result<DirectoryContent, String> {
    if current_dir == "__ALL_TRACKS__" {
        return scan_all_tracks(root_dir, force_refresh);
    }

    let cache_key = format!("{}:{}", root_dir, current_dir);
    if !force_refresh {
        if let Ok(cache) = get_cache().read() {
            if let Some(content) = cache.get(&cache_key) {
                return Ok(content.clone());
            }
        }
    }

    let current_path = Path::new(current_dir);
    let root_path = Path::new(root_dir);

    if !current_path.exists() || !current_path.is_dir() {
        return Err(format!("Directory does not exist: {}", current_dir));
    }

    // Determine parent path if not at root
    let parent_path = if current_path == root_path {
        None
    } else {
        current_path.parent().map(|p| p.to_string_lossy().to_string())
    };

    // Calculate relative path from root
    let relative_path = current_path
        .strip_prefix(root_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // Generate breadcrumbs
    let mut breadcrumbs = Vec::new();
    let root_name = root_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| root_dir.to_string());

    breadcrumbs.push(BreadcrumbItem {
        name: root_name,
        path: root_path.to_string_lossy().to_string(),
    });

    if !relative_path.is_empty() {
        let mut accum = PathBuf::from(root_path);
        let components = Path::new(&relative_path);
        for comp in components.iter() {
            accum.push(comp);
            breadcrumbs.push(BreadcrumbItem {
                name: comp.to_string_lossy().to_string(),
                path: accum.to_string_lossy().to_string(),
            });
        }
    }

    let mut raw_dirs = Vec::new();
    let mut raw_files = Vec::new();

    let entries = fs::read_dir(current_path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        if name.starts_with('.') {
            continue; // Skip hidden files and directories
        }

        if path.is_dir() {
            raw_dirs.push((name, path));
        } else if path.is_file() {
            raw_files.push((name, path));
        }
    }

    let mut subdirectories: Vec<FolderItem> = raw_dirs
        .into_par_iter()
        .map(|(name, path)| {
            let (total_items, media_items, audio_items, video_items) = count_media_in_dir(&path);
            FolderItem {
                name,
                path: path.to_string_lossy().to_string(),
                item_count: total_items,
                media_count: media_items,
                audio_count: audio_items,
                video_count: video_items,
            }
        })
        .collect();

    let mut media_files: Vec<MediaItem> = raw_files
        .into_par_iter()
        .filter_map(|(name, path)| {
            let ext = path.extension()?.to_str()?;
            let ext_lower = ext.to_lowercase();
            let is_aud = is_audio(&ext_lower);
            let is_vid = is_video(&ext_lower);

            if !is_aud && !is_vid {
                return None;
            }

            let media_type = if is_vid {
                "video".to_string()
            } else {
                "audio".to_string()
            };

            let metadata = fs::metadata(&path).ok();
            let size_bytes = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
            let size_formatted = format_size(size_bytes);

            // Fast probe for metadata (title, artist, album, duration, cover art)
            let mut title = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| name.clone());
            let mut artist = None;
            let mut album = None;
            let mut duration_secs = None;
            let mut duration_formatted = None;

            if let Ok(tagged_file) = Probe::open(&path).and_then(|p| p.read()) {
                let props = tagged_file.properties();
                let dur = props.duration().as_secs_f64();
                if dur > 0.0 {
                    duration_secs = Some(dur);
                    duration_formatted = Some(format_duration(dur));
                }

                if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                    if let Some(t) = tag.title() {
                        title = t.to_string();
                    }
                    artist = tag.artist().map(|s| s.to_string());
                    album = tag.album().map(|s| s.to_string());
                }
            }

            Some(MediaItem {
                name,
                path: path.to_string_lossy().to_string(),
                extension: ext_lower.to_uppercase(),
                media_type,
                size_bytes,
                size_formatted,
                duration_secs,
                duration_formatted,
                title,
                artist,
                album,
                cover_art: None,
            })
        })
        .collect();

    // Sort subdirectories alphabetically
    subdirectories.par_sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    // When at root folder, prepend the "All Tracks" virtual folder
    if current_path == root_path {
        let total_all = subdirectories.iter().map(|s| s.media_count).sum::<usize>() + media_files.len();
        let total_audio = subdirectories.iter().map(|s| s.audio_count).sum::<usize>()
            + media_files.iter().filter(|m| m.media_type == "audio").count();
        let total_video = subdirectories.iter().map(|s| s.video_count).sum::<usize>()
            + media_files.iter().filter(|m| m.media_type == "video").count();
        subdirectories.insert(
            0,
            FolderItem {
                name: "All Tracks".to_string(),
                path: "__ALL_TRACKS__".to_string(),
                item_count: total_all,
                media_count: total_all,
                audio_count: total_audio,
                video_count: total_video,
            },
        );
    }

    // Sort media files alphabetically by title
    media_files.par_sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));

    let total_media_count = media_files.len();

    let content = DirectoryContent {
        current_path: current_path.to_string_lossy().to_string(),
        root_path: root_path.to_string_lossy().to_string(),
        relative_path,
        parent_path,
        breadcrumbs,
        subdirectories,
        media_files,
        total_media_count,
    };

    if let Ok(mut cache) = get_cache().write() {
        cache.insert(cache_key, content.clone());
    }

    Ok(content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_non_existent_dir() {
        let res = scan_directory("C:/this/path/definitely/does/not/exist_12345", "C:/", false);
        assert!(res.is_err());
    }

    #[test]
    fn test_scan_directory_with_items() {
        let temp_dir = std::env::temp_dir().join("meedia_test_dir_123");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let sub_dir = temp_dir.join("SubFolder");
        fs::create_dir_all(&sub_dir).unwrap();

        // Create dummy media files
        let flac_file = temp_dir.join("sample.flac");
        let mut f = File::create(&flac_file).unwrap();
        f.write_all(b"fake flac content").unwrap();

        let m4a_file = temp_dir.join("track.m4a");
        let mut f_m4a = File::create(&m4a_file).unwrap();
        f_m4a.write_all(b"fake m4a content").unwrap();

        let mp4_file = temp_dir.join("video.mp4");
        let mut f2 = File::create(&mp4_file).unwrap();
        f2.write_all(b"fake mp4 content").unwrap();

        // Create a media file inside subfolder to verify recursive All Tracks scan
        let sub_mp3_file = sub_dir.join("nested.mp3");
        let mut f_sub = File::create(&sub_mp3_file).unwrap();
        f_sub.write_all(b"fake nested mp3 content").unwrap();

        // Create a non-media file
        let txt_file = temp_dir.join("notes.txt");
        let mut f3 = File::create(&txt_file).unwrap();
        f3.write_all(b"text file").unwrap();

        let dir_str = temp_dir.to_str().unwrap();
        let res = scan_directory(dir_str, dir_str, false).unwrap();

        // Should contain "All Tracks" virtual folder at index 0 and "SubFolder" at index 1
        assert_eq!(res.subdirectories.len(), 2);
        assert_eq!(res.subdirectories[0].name, "All Tracks");
        assert_eq!(res.subdirectories[0].path, "__ALL_TRACKS__");
        assert_eq!(res.subdirectories[0].media_count, 4); // 3 in root + 1 in subfolder
        assert_eq!(res.subdirectories[0].audio_count, 3);
        assert_eq!(res.subdirectories[0].video_count, 1);
        assert_eq!(res.subdirectories[1].name, "SubFolder");
        assert_eq!(res.subdirectories[1].audio_count, 1);
        assert_eq!(res.subdirectories[1].video_count, 0);
        assert_eq!(res.media_files.len(), 3); // 3 files directly in root
        
        let exts: Vec<String> = res.media_files.iter().map(|m| m.extension.clone()).collect();
        assert!(exts.contains(&"FLAC".to_string()));
        assert!(exts.contains(&"M4A".to_string()));
        assert!(exts.contains(&"MP4".to_string()));

        let mp4_item = res.media_files.iter().find(|m| m.extension == "MP4").unwrap();
        assert_eq!(mp4_item.media_type, "video");

        let flac_item = res.media_files.iter().find(|m| m.extension == "FLAC").unwrap();
        assert_eq!(flac_item.media_type, "audio");

        let m4a_item = res.media_files.iter().find(|m| m.extension == "M4A").unwrap();
        assert_eq!(m4a_item.media_type, "audio");

        // Test scanning __ALL_TRACKS__
        let all_res = scan_directory("__ALL_TRACKS__", dir_str, false).unwrap();
        assert_eq!(all_res.current_path, "__ALL_TRACKS__");
        assert_eq!(all_res.relative_path, "All Tracks");
        assert_eq!(all_res.media_files.len(), 4); // All 4 media files from root and subfolder

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
