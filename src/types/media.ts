export interface FolderItem {
  name: string;
  path: string;
  item_count: number;
  media_count: number;
  audio_count?: number;
  video_count?: number;
}

export interface MediaItem {
  name: string;
  path: string;
  extension: string;
  media_type: 'audio' | 'video';
  size_bytes: number;
  size_formatted: string;
  duration_secs?: number | null;
  duration_formatted?: string | null;
  title: string;
  artist?: string | null;
  album?: string | null;
  cover_art?: string | null;
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface DirectoryContent {
  current_path: string;
  root_path: string;
  relative_path: string;
  parent_path?: string | null;
  breadcrumbs: BreadcrumbItem[];
  subdirectories: FolderItem[];
  media_files: MediaItem[];
  total_media_count: number;
}

export interface TagEntry {
  key: string;
  value: string;
}

export interface MediaTags {
  file_path: string;
  file_name: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  album_artist?: string | null;
  year?: number | null;
  date?: string | null;
  genre?: string | null;
  track_number?: number | null;
  track_total?: number | null;
  disc_number?: number | null;
  disc_total?: number | null;
  composer?: string | null;
  duration_secs: number;
  duration_formatted: string;
  bitrate?: number | null;
  sample_rate?: number | null;
  bits_per_sample?: number | null;
  channels?: number | null;
  file_format: string;
  file_size_bytes: number;
  file_size_formatted: string;
  cover_art?: string | null;
  other_tags: TagEntry[];
}

export type RepeatMode = 'off' | 'all' | 'one';
