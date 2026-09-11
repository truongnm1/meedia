use base64::prelude::*;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MediaTags {
    pub file_path: String,
    pub file_name: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub year: Option<u32>,
    pub date: Option<String>,
    pub genre: Option<String>,
    pub track_number: Option<u32>,
    pub track_total: Option<u32>,
    pub disc_number: Option<u32>,
    pub disc_total: Option<u32>,
    pub composer: Option<String>,
    pub duration_secs: f64,
    pub duration_formatted: String,
    pub bitrate: Option<u32>,
    pub sample_rate: Option<u32>,
    pub bits_per_sample: Option<u8>,
    pub channels: Option<u8>,
    pub file_format: String,
    pub file_size_bytes: u64,
    pub file_size_formatted: String,
    pub cover_art: Option<String>,
    pub other_tags: Vec<TagEntry>,
}

pub fn format_duration(total_secs: f64) -> String {
    let secs = total_secs.round() as u64;
    let hours = secs / 3600;
    let minutes = (secs % 3600) / 60;
    let seconds = secs % 60;

    if hours > 0 {
        format!("{}:{:02}:{:02}", hours, minutes, seconds)
    } else {
        format!("{}:{:02}", minutes, seconds)
    }
}

pub fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.0} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

pub fn extract_media_tags(path_str: &str) -> Result<MediaTags, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(format!("File does not exist: {}", path_str));
    }

    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let file_size_bytes = metadata.len();
    let file_size_formatted = format_size(file_size_bytes);

    let extension = path
        .extension()
        .map(|ext| ext.to_string_lossy().to_string().to_uppercase())
        .unwrap_or_else(|| "UNKNOWN".to_string());

    let mut result = MediaTags {
        file_path: path_str.to_string(),
        file_name: file_name.clone(),
        file_format: extension.clone(),
        file_size_bytes,
        file_size_formatted,
        ..Default::default()
    };

    // Use lofty probe to read tags
    let tagged_file = Probe::open(path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string());

    if let Ok(tagged_file) = tagged_file {
        let properties = tagged_file.properties();
        let duration = properties.duration();
        result.duration_secs = duration.as_secs_f64();
        result.duration_formatted = format_duration(result.duration_secs);

        result.bitrate = properties.audio_bitrate().or_else(|| properties.overall_bitrate());
        result.sample_rate = properties.sample_rate();
        result.bits_per_sample = properties.bit_depth();
        result.channels = properties.channels();

        if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
            result.title = tag.title().map(|s| s.to_string());
            result.artist = tag.artist().map(|s| s.to_string());
            result.album = tag.album().map(|s| s.to_string());
            result.genre = tag.genre().map(|s| s.to_string());
            result.year = tag.year();
            result.track_number = tag.track();
            result.track_total = tag.track_total();
            result.disc_number = tag.disk();
            result.disc_total = tag.disk_total();

            // Extract album art if available
            if let Some(picture) = tag.pictures().first() {
                let mime = picture.mime_type().map(|m| m.as_str()).unwrap_or("image/jpeg");
                let b64 = BASE64_STANDARD.encode(picture.data());
                result.cover_art = Some(format!("data:{};base64,{}", mime, b64));
            }

            // Extract other tag items
            let mut other_tags = Vec::new();
            for item in tag.items() {
                let key = format!("{:?}", item.key());
                if let lofty::tag::ItemValue::Text(val) = item.value() {
                    if !["Title", "Artist", "Album", "Genre", "Year", "TrackNumber", "TrackTotal", "DiscNumber", "DiscTotal"].contains(&key.as_str()) {
                        other_tags.push(TagEntry {
                            key: key.clone(),
                            value: val.clone(),
                        });
                    }
                }
            }
            result.other_tags = other_tags;
        }
    }

    if result.title.is_none() {
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or(file_name);
        result.title = Some(stem);
    }

    Ok(result)
}
