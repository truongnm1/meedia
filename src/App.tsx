import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  DirectoryContent,
  FolderItem,
  MediaItem,
  MediaTags,
  RepeatMode,
  BreadcrumbItem,
} from './types/media';
import { CompactSidebar } from './components/CompactSidebar';
import { TracklistView } from './components/TracklistView';
import { DedicatedPlayer } from './components/DedicatedPlayer';
import { TagDetailsModal } from './components/TagDetailsModal';
import { ExitPromptModal } from './components/ExitPromptModal';
import { EmptyState } from './components/EmptyState';
import { initAudioAnalyzer, resumeAudioContext, setMasterVolume, resetAudioAnalyzer } from './utils/audioAnalyzer';
import { recordTrackPlay, calculateMyMix } from './utils/myMixEngine';

const EMPTY_BREADCRUMBS: BreadcrumbItem[] = [];
const EMPTY_SUBDIRS: FolderItem[] = [];
const EMPTY_MEDIA: MediaItem[] = [];

export function App() {
  // Theme State (Dark / Light with Yellow accents)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('meedia_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem('meedia_theme', theme);
  }, [theme]);

  // Navigation & Directory State
  const [rootPath, setRootPath] = useState<string | null>(() => {
    return localStorage.getItem('meedia_root_folder');
  });
  const [currentPath, setCurrentPath] = useState<string | null>(() => {
    return localStorage.getItem('meedia_root_folder');
  });
  const [directoryData, setDirectoryData] = useState<DirectoryContent | null>(null);
  const [isLoadingDir, setIsLoadingDir] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Navigation History for [<] [>] buttons
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Playback State
  const [currentTrack, setCurrentTrack] = useState<MediaItem | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem('meedia_volume');
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');

  // Metadata Tags Modal State
  const [activeTags, setActiveTags] = useState<MediaTags | null>(null);
  const [isTagModalOpen, setIsTagModalOpen] = useState<boolean>(false);
  const [isLoadingTags, setIsLoadingTags] = useState<boolean>(false);
  const [coverArt, setCoverArt] = useState<string | null>(null);

  // Close / Exit to Tray Prompt State
  const [isClosePromptOpen, setIsClosePromptOpen] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef<MediaItem | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const repeatModeRef = useRef<RepeatMode>('off');
  const isShuffleRef = useRef<boolean>(false);
  const activePlaylistRef = useRef<MediaItem[]>([]);
  const allLibraryTracksRef = useRef<MediaItem[]>([]);
  const currentPathRef = useRef<string | null>(currentPath);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const hasRecordedCurrentPlayRef = useRef<boolean>(false);

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);

  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);

  const currentTimeRef = useRef<number>(0);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const durationRef = useRef<number>(0);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const isTagModalOpenRef = useRef<boolean>(false);
  useEffect(() => {
    isTagModalOpenRef.current = isTagModalOpen;
  }, [isTagModalOpen]);

  const isClosePromptOpenRef = useRef<boolean>(false);
  useEffect(() => {
    isClosePromptOpenRef.current = isClosePromptOpen;
  }, [isClosePromptOpen]);

  useEffect(() => {
    if (audioRef.current) {
      initAudioAnalyzer(audioRef.current);
      setMasterVolume(volume);
      audioRef.current.volume = 1.0;
    }
  }, []);

  const volumeRef = useRef<number>(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Track consecutive file loading errors to prevent infinite skip loops
  const consecutiveErrorCountRef = useRef<number>(0);

  // Dual-layer cache in frontend memory for instant 0ms folder switching
  const directoryCacheRef = useRef<Map<string, DirectoryContent>>(new Map());
  const preloadingSetRef = useRef<Set<string>>(new Set());

  // Same-origin Blob URL cache with LRU eviction ring (capped at 8 tracks)
  // Ensures memory remains lean (<100MB) even after playing 1,000+ songs
  const MAX_BLOB_CACHE = 8;
  const blobUrlCacheRef = useRef<Map<string, string>>(new Map());
  const prefetchingBlobSetRef = useRef<Set<string>>(new Set());

  const storeBlobUrl = (path: string, url: string) => {
    // If at or over capacity, evict oldest entry not currently playing
    if (blobUrlCacheRef.current.size >= MAX_BLOB_CACHE) {
      for (const [key, oldUrl] of blobUrlCacheRef.current.entries()) {
        if (key !== path && key !== currentTrackRef.current?.path) {
          try {
            URL.revokeObjectURL(oldUrl);
          } catch {}
          blobUrlCacheRef.current.delete(key);
          break;
        }
      }
    }
    blobUrlCacheRef.current.set(path, url);
  };

  // Lazy cover art cache: track path -> base64 data URL
  const coverArtCacheRef = useRef<Map<string, string | null>>(new Map());
  const coverArtLoadingRef = useRef<Set<string>>(new Set());

  // Convert audio file to clean same-origin Blob URL with LRU caching
  // NOTE: ISOBMFF containers (M4A) and AAC streams require HTTP 206 Partial Content range requests for atom demuxing.
  // In-memory Blob URLs do not support range seeking in Chromium, which triggers DEMUXER_ERROR_COULD_NOT_OPEN.
  const getOrCreateBlobUrl = async (track: MediaItem): Promise<string> => {
    const ext = track.extension.toLowerCase();
    if (ext === 'm4a' || ext === 'aac') {
      return convertFileSrc(track.path, 'stream');
    }

    if (blobUrlCacheRef.current.has(track.path)) {
      // Refresh insertion order for LRU
      const existing = blobUrlCacheRef.current.get(track.path)!;
      blobUrlCacheRef.current.delete(track.path);
      blobUrlCacheRef.current.set(track.path, existing);
      return existing;
    }

    try {
      // 1. Direct binary read from Rust (high-speed NVMe RAM transfer)
      const binary = await invoke<ArrayBuffer>('read_audio_file', { filePath: track.path });
      if (binary && (binary as any).byteLength > 0) {
        const ext = track.extension.toLowerCase();
        const mime =
          ext === 'mp3' ? 'audio/mpeg' :
          ext === 'flac' ? 'audio/flac' :
          ext === 'wav' ? 'audio/wav' :
          ext === 'ogg' ? 'audio/ogg' :
          ext === 'm4a' || ext === 'aac' ? 'audio/mp4' : 'audio/mpeg';
        const blob = new Blob([binary as any], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        storeBlobUrl(track.path, blobUrl);
        return blobUrl;
      }
    } catch (err) {
      console.warn('read_audio_file notice, trying fetch:', err);
    }

    try {
      // 2. Fetch the stream into a local same-origin Blob
      const streamUrl = convertFileSrc(track.path, 'stream');
      const resp = await fetch(streamUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        storeBlobUrl(track.path, blobUrl);
        return blobUrl;
      }
    } catch (e) {
      console.warn('Blob fetch fallback notice:', e);
    }

    // 3. Fallback to stream URL
    return convertFileSrc(track.path, 'stream');
  };

  // Concurrency-controlled queue for cover art extraction (max 8 parallel reads)
  const coverQueueRef = useRef<Array<() => void>>([]);
  const activeCoverFetchesRef = useRef<number>(0);

  const processCoverQueue = () => {
    while (activeCoverFetchesRef.current < 8 && coverQueueRef.current.length > 0) {
      const task = coverQueueRef.current.shift()!;
      activeCoverFetchesRef.current++;
      task();
    }
  };

  // Lazy-load cover art for a single track (queued, max 2 concurrent to protect disk I/O)
  const loadTrackCoverArt = useCallback((track: MediaItem): Promise<string | null> => {
    if (track.cover_art) return Promise.resolve(track.cover_art);
    const cached = coverArtCacheRef.current.get(track.path);
    if (cached !== undefined) return Promise.resolve(cached);
    if (coverArtLoadingRef.current.has(track.path)) return Promise.resolve(null);

    coverArtLoadingRef.current.add(track.path);

    return new Promise<string | null>((resolve) => {
      coverQueueRef.current.push(async () => {
        try {
          const art = await invoke<string | null>('get_track_cover_art', { filePath: track.path });
          coverArtCacheRef.current.set(track.path, art);
          resolve(art);
        } catch {
          coverArtCacheRef.current.set(track.path, null);
          resolve(null);
        } finally {
          coverArtLoadingRef.current.delete(track.path);
          activeCoverFetchesRef.current--;
          processCoverQueue();
        }
      });
      processCoverQueue();
    });
  }, []);

  const hoverPrefetchTimeoutRef = useRef<number | null>(null);

  // Prefetch track blob into memory ONLY when user genuinely hovers (debounced 400ms)
  // NEVER triggers during scrolling, and never when video is active
  const prefetchTrackBlob = useCallback((track: MediaItem | undefined) => {
    if (hoverPrefetchTimeoutRef.current) {
      window.clearTimeout(hoverPrefetchTimeoutRef.current);
      hoverPrefetchTimeoutRef.current = null;
    }

    if (!track || track.media_type === 'video') return;
    const ext = track.extension.toLowerCase();
    if (ext === 'm4a' || ext === 'aac') return; // Streamed directly via HTTP 206 Partial Content, no blob prefetching needed
    // Don't prefetch audio binaries if video is playing (preserves 100% bandwidth for video)
    if (isPlayingRef.current && currentTrackRef.current?.media_type === 'video') return;

    if (blobUrlCacheRef.current.has(track.path) || prefetchingBlobSetRef.current.has(track.path)) return;

    hoverPrefetchTimeoutRef.current = window.setTimeout(() => {
      if (blobUrlCacheRef.current.has(track.path) || prefetchingBlobSetRef.current.has(track.path)) return;
      prefetchingBlobSetRef.current.add(track.path);
      getOrCreateBlobUrl(track).finally(() => {
        prefetchingBlobSetRef.current.delete(track.path);
      });
    }, 400);
  }, []);

  // Hover prefetch for instantaneous navigation on click
  const handleHoverFolder = useCallback((folderPath: string) => {
    if (!rootPath) return;
    if (directoryCacheRef.current.has(folderPath) || preloadingSetRef.current.has(folderPath)) return;
    preloadingSetRef.current.add(folderPath);
    invoke<DirectoryContent>('read_directory', {
      folderPath,
      rootPath,
      forceRefresh: false,
    })
      .then((data) => {
        directoryCacheRef.current.set(folderPath, data);
        if (data.media_files && data.media_files.length > 0) {
          prefetchTrackBlob(data.media_files[0]);
        }
      })
      .catch(() => {})
      .finally(() => {
        preloadingSetRef.current.delete(folderPath);
      });
  }, [rootPath, prefetchTrackBlob]);

  // Push a folder to history stack without duplicate consecutive entries
  const recordHistory = (folderPath: string) => {
    const curIdx = historyIndexRef.current;
    const curList = historyRef.current;

    // Never add duplicate of the current location
    if (curIdx >= 0 && curList[curIdx] === folderPath) {
      return;
    }

    const next = curList.slice(0, curIdx + 1);
    next.push(folderPath);
    historyRef.current = next;
    const newIdx = next.length - 1;
    historyIndexRef.current = newIdx;

    setHistory([...next]);
    setHistoryIndex(newIdx);
  };

  // Helper to dynamically inject "My Mix" virtual folder into root directory if user is eligible
  const injectMyMixIfEligible = (content: DirectoryContent, root: string): DirectoryContent => {
    if (content.current_path !== root && content.current_path !== content.root_path) {
      return content;
    }
    const myMix = calculateMyMix(allLibraryTracksRef.current);
    const subdirs = content.subdirectories.filter((s) => s.path !== '__MY_MIX__');
    if (myMix) {
      const audioCount = myMix.tracks.filter((t) => t.media_type === 'audio').length;
      const videoCount = myMix.tracks.filter((t) => t.media_type === 'video').length;
      const myMixFolder: FolderItem = {
        name: myMix.folderName,
        path: '__MY_MIX__',
        item_count: myMix.tracks.length,
        media_count: myMix.tracks.length,
        audio_count: audioCount,
        video_count: videoCount,
      };
      const allTracksIdx = subdirs.findIndex((s) => s.path === '__ALL_TRACKS__');
      const insertIdx = allTracksIdx >= 0 ? allTracksIdx + 1 : 0;
      subdirs.splice(insertIdx, 0, myMixFolder);
    }
    return {
      ...content,
      subdirectories: subdirs,
    };
  };

  // Load directory contents with 0ms cache-first rendering
  const loadDirectory = async (
    folderPath: string,
    root: string,
    addToHistory = true,
    forceRefresh = false
  ) => {
    // Special handling for YouTube-style "My Mix" virtual playlist
    if (folderPath === '__MY_MIX__') {
      setIsLoadingDir(true);
      const myMix = calculateMyMix(allLibraryTracksRef.current);
      const rootName = root
        ? root.split(/[/\\]/).filter(Boolean).pop() || root
        : 'Home';
      const mixContent: DirectoryContent = {
        current_path: '__MY_MIX__',
        root_path: root,
        relative_path: myMix ? myMix.folderName : 'My Mix',
        parent_path: root,
        breadcrumbs: [
          { name: rootName, path: root },
          { name: myMix ? myMix.folderName : 'My Mix', path: '__MY_MIX__' },
        ],
        subdirectories: [],
        media_files: myMix ? myMix.tracks : [],
        total_media_count: myMix ? myMix.tracks.length : 0,
      };
      setDirectoryData(mixContent);
      setCurrentPath('__MY_MIX__');
      setIsLoadingDir(false);

      if (addToHistory) {
        recordHistory('__MY_MIX__');
      }
      return;
    }

    // 1. Instant Synchronous Cache Hit (0ms perceived latency)
    if (!forceRefresh && directoryCacheRef.current.has(folderPath)) {
      let cached = directoryCacheRef.current.get(folderPath)!;
      if (folderPath === root) {
        cached = injectMyMixIfEligible(cached, root);
      }
      setDirectoryData(cached);
      setCurrentPath(folderPath);
      setIsLoadingDir(false);

      if (addToHistory) {
        recordHistory(folderPath);
      }
      return;
    }

    // 2. Fresh read from backend (also cached in Rust's DIRECTORY_CACHE)
    setIsLoadingDir(true);
    try {
      let data = await invoke<DirectoryContent>('read_directory', {
        folderPath,
        rootPath: root,
        forceRefresh,
      });

      // Track library files for connected My Mix recommendations
      if (data.media_files && data.media_files.length > 0) {
        if (folderPath === '__ALL_TRACKS__') {
          allLibraryTracksRef.current = data.media_files;
        } else {
          const existingPaths = new Set(allLibraryTracksRef.current.map((t) => t.path));
          const newTracks = data.media_files.filter((t) => !existingPaths.has(t.path));
          if (newTracks.length > 0) {
            allLibraryTracksRef.current = [...allLibraryTracksRef.current, ...newTracks];
          }
        }
      }

      directoryCacheRef.current.set(folderPath, data);

      if (folderPath === root) {
        data = injectMyMixIfEligible(data, root);
      }

      setDirectoryData(data);
      setCurrentPath(folderPath);

      if (addToHistory) {
        recordHistory(folderPath);
      }
    } catch (err) {
      console.error('Failed to read directory:', err);
      if (folderPath === root) {
        setRootPath(null);
        localStorage.removeItem('meedia_root_folder');
      }
    } finally {
      setIsLoadingDir(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (rootPath) {
      loadDirectory(rootPath, rootPath, true);
    }
  }, [rootPath]);

  // Handle Root Folder Selection
  const handleSelectRootFolder = async () => {
    try {
      const selected = await invoke<string | null>('select_root_folder');
      if (selected) {
        blobUrlCacheRef.current.forEach((url) => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        });
        blobUrlCacheRef.current.clear();
        directoryCacheRef.current.clear();
        invoke('clear_cache').catch(() => {});
        historyRef.current = [];
        historyIndexRef.current = -1;
        setHistory([]);
        setHistoryIndex(-1);
        setRootPath(selected);
        setCurrentPath(selected);
        localStorage.setItem('meedia_root_folder', selected);
        await loadDirectory(selected, selected, true, true);
      }
    } catch (err) {
      console.error('Failed to select root folder:', err);
    }
  };

  // History Navigation: Single-click guaranteed instant folder switch
  const handleGoBack = () => {
    if (historyIndexRef.current > 0 && rootPath) {
      let targetIdx = historyIndexRef.current - 1;
      // Skip backwards past any accidental duplicates of the current folder
      while (targetIdx > 0 && historyRef.current[targetIdx] === currentPathRef.current) {
        targetIdx--;
      }
      const targetPath = historyRef.current[targetIdx];
      historyIndexRef.current = targetIdx;
      setHistoryIndex(targetIdx);
      loadDirectory(targetPath, rootPath, false);
    }
  };

  const handleGoForward = () => {
    if (historyIndexRef.current < historyRef.current.length - 1 && rootPath) {
      let targetIdx = historyIndexRef.current + 1;
      // Skip forwards past any accidental duplicates of the current folder
      while (
        targetIdx < historyRef.current.length - 1 &&
        historyRef.current[targetIdx] === currentPathRef.current
      ) {
        targetIdx++;
      }
      const targetPath = historyRef.current[targetIdx];
      historyIndexRef.current = targetIdx;
      setHistoryIndex(targetIdx);
      loadDirectory(targetPath, rootPath, false);
    }
  };

  // Load tags for a track
  const loadTrackTags = async (track: MediaItem) => {
    setIsLoadingTags(true);
    try {
      const tags = await invoke<MediaTags>('get_media_tags', {
        filePath: track.path,
      });
      setActiveTags(tags);
      setCoverArt(tags.cover_art || null);
    } catch (err) {
      console.error('Failed to extract media tags:', err);
      setActiveTags(null);
      setCoverArt(null);
    } finally {
      setIsLoadingTags(false);
    }
  };

  // Only record play for My Mix if continuous playback reaches >= 30s (or >= 50% for short tracks)
  const checkAndRecordTrackPlay = useCallback((curTime: number, trackDuration: number) => {
    if (hasRecordedCurrentPlayRef.current) return;
    const track = currentTrackRef.current;
    if (!track) return;

    const threshold = trackDuration > 0 && trackDuration < 60 ? trackDuration * 0.5 : 30;
    if (curTime >= threshold) {
      hasRecordedCurrentPlayRef.current = true;
      recordTrackPlay(track);

      if (currentPathRef.current === rootPath && rootPath) {
        setDirectoryData((prev) => (prev ? injectMyMixIfEligible(prev, rootPath) : prev));
      }
    }
  }, [rootPath]);

  // Play a track with queue preservation
  const handlePlayTrack = async (track: MediaItem, customPlaylist?: MediaItem[]) => {
    // Reset listening session marker (will only record after >= 30s of actual continuous playback)
    hasRecordedCurrentPlayRef.current = false;
    const listToUse =
      customPlaylist && customPlaylist.length > 0
        ? customPlaylist
        : activePlaylistRef.current.length > 0 &&
          activePlaylistRef.current.some((f) => f.path === track.path)
        ? activePlaylistRef.current
        : directoryData?.media_files || [];

    if (listToUse.length > 0) {
      activePlaylistRef.current = listToUse;
    }

    currentTrackRef.current = track;
    setCurrentTrack(track);
    if (track.cover_art) {
      setCoverArt(track.cover_art);
    }
    isPlayingRef.current = true;
    setIsPlaying(true);
    setCurrentTime(0);

    if (track.media_type === 'video') {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      isPlayingRef.current = true;
      setIsPlaying(true);
    } else {
      const audio = audioRef.current;
      if (audio) {
        // Immediately pause old track to eliminate stale audio/visualizer lingering
        audio.pause();
        audio.currentTime = 0;

        initAudioAnalyzer(audio);
        resumeAudioContext();
        resetAudioAnalyzer(); // Instantly zero out old frequencies

        // 1. If Blob URL is already cached in memory, start immediately (0ms instant!)
        const isContainerAudio = track.extension.toLowerCase() === 'm4a' || track.extension.toLowerCase() === 'aac';
        const cachedBlob = !isContainerAudio ? blobUrlCacheRef.current.get(track.path) : undefined;
        const streamUrl = convertFileSrc(track.path, 'stream');
        const immediateSrc = cachedBlob || streamUrl;

        if (audio.src !== immediateSrc) {
          audio.src = immediateSrc;
        }

        audio.play().catch((err) => {
          if (err.name !== 'AbortError') {
            console.warn('Audio play notice:', err);
          }
        });

        // If not cached yet and not a container format, preload blob in the background without blocking playback
        if (!cachedBlob && !isContainerAudio) {
          getOrCreateBlobUrl(track).then((blobUrl) => {
            if (currentTrackRef.current?.path === track.path && audioRef.current) {
              const a = audioRef.current;
              if (a.src !== blobUrl && !a.paused) {
                const cur = a.currentTime;
                a.src = blobUrl;
                a.currentTime = cur;
                a.play().catch(() => {});
              }
            }
          }).catch(() => {});
        }

        // Auto-prefetch the next track in the playlist for 0ms transitions
        const currentIdx = listToUse.findIndex((item) => item.path === track.path);
        if (currentIdx >= 0 && currentIdx + 1 < listToUse.length) {
          prefetchTrackBlob(listToUse[currentIdx + 1]);
        }
      }
    }

    loadTrackTags(track);
  };

  // Start randomly with shuffle mode on
  const handleShufflePlay = useCallback((customPlaylist?: MediaItem[]) => {
    const list =
      customPlaylist && customPlaylist.length > 0
        ? customPlaylist
        : getActiveList();
    if (list.length === 0) return;
    setIsShuffle(true);
    isShuffleRef.current = true;
    const randomIndex = Math.floor(Math.random() * list.length);
    handlePlayTrack(list[randomIndex], list);
  }, []);

  const handleNavigateBreadcrumb = useCallback((path: string) => {
    if (rootPath) loadDirectory(path, rootPath);
  }, [rootPath]);

  const handleRefresh = useCallback(() => {
    if (currentPath && rootPath) {
      directoryCacheRef.current.delete(currentPath);
      coverArtCacheRef.current.clear();
      invoke('clear_cache').catch(() => {});
      loadDirectory(currentPath, rootPath, false, true);
    }
  }, [currentPath, rootPath]);

  const handleNavigate = useCallback((path: string) => {
    if (rootPath) loadDirectory(path, rootPath);
  }, [rootPath]);

  const handlePlayTrackFromList = useCallback((track: MediaItem, customPlaylist?: MediaItem[]) => {
    handlePlayTrack(track, customPlaylist);
  }, []);

  // Toggle play/pause
  const handleTogglePlay = () => {
    const track = currentTrackRef.current || currentTrack;
    if (!track) return;

    if (track.media_type === 'video') {
      setIsPlaying((prev) => {
        isPlayingRef.current = !prev;
        return !prev;
      });
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    initAudioAnalyzer(audio);
    resumeAudioContext();

    if (!audio.src || audio.src === '' || audio.src === window.location.href) {
      handlePlayTrack(track);
      return;
    }

    if (audio.paused) {
      isPlayingRef.current = true;
      setIsPlaying(true);
      audio.play().catch((err) => {
        console.warn('Audio play notice:', err);
      });
    } else {
      isPlayingRef.current = false;
      setIsPlaying(false);
      audio.pause();
    }
  };

  // Get active queue for next / prev navigation
  const getActiveList = (): MediaItem[] => {
    if (activePlaylistRef.current.length > 0) {
      return activePlaylistRef.current;
    }
    if (directoryData?.media_files && directoryData.media_files.length > 0) {
      return directoryData.media_files;
    }
    return currentTrackRef.current ? [currentTrackRef.current] : [];
  };

  // Next Track
  const handleNext = (isAutoAdvance = false) => {
    const files = getActiveList();
    if (files.length === 0) return;

    if (isShuffleRef.current) {
      const randomIndex = Math.floor(Math.random() * files.length);
      handlePlayTrack(files[randomIndex]);
      return;
    }

    const currentPath = currentTrackRef.current?.path;
    const currentIndex = currentPath
      ? files.findIndex((f) => f.path === currentPath)
      : -1;

    if (currentIndex >= 0 && currentIndex < files.length - 1) {
      handlePlayTrack(files[currentIndex + 1]);
    } else if (isAutoAdvance) {
      // Natural track end: obey repeat mode
      if (repeatModeRef.current === 'all') {
        handlePlayTrack(files[0]);
      } else {
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    } else {
      // Manual Next button click: always wrap around to start!
      handlePlayTrack(files[0]);
    }
  };

  // Previous Track
  const handlePrev = () => {
    const files = getActiveList();
    if (files.length === 0) return;

    const currentPath = currentTrackRef.current?.path;
    const currentIndex = currentPath
      ? files.findIndex((f) => f.path === currentPath)
      : -1;

    if (currentIndex > 0) {
      handlePlayTrack(files[currentIndex - 1]);
    } else {
      // Manual Prev button click: wrap around to last track in playlist!
      handlePlayTrack(files[files.length - 1]);
    }
  };

  // Graceful auto-skip if an audio or video file is missing or deleted externally
  const handleSkipMissingFile = (failedTrackPath: string) => {
    const list = getActiveList();
    if (list.length <= 1) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }
    consecutiveErrorCountRef.current++;
    if (consecutiveErrorCountRef.current >= list.length) {
      console.warn('All tracks in playlist failed to load.');
      consecutiveErrorCountRef.current = 0;
      isPlayingRef.current = false;
      setIsPlaying(false);
      return;
    }
    console.warn(`File unreadable or missing (${failedTrackPath}), auto-skipping to next track...`);
    handleNext(true);
  };

  // Seek
  const handleSeek = (time: number) => {
    const clampedTime = Math.max(0, Math.min(durationRef.current || 0, time));
    setCurrentTime(clampedTime);
    currentTimeRef.current = clampedTime;
    const track = currentTrackRef.current || currentTrack;
    if (track?.media_type === 'audio' && audioRef.current) {
      audioRef.current.currentTime = clampedTime;
    } else if (track?.media_type === 'video') {
      const vid = document.querySelector<HTMLVideoElement>('video');
      if (vid) vid.currentTime = clampedTime;
    }
  };

  // Volume
  const handleVolumeChange = (vol: number) => {
    const clampedVol = Math.max(0, Math.min(1, Math.round(vol * 100) / 100));
    setVolume(clampedVol);
    volumeRef.current = clampedVol;
    localStorage.setItem('meedia_volume', clampedVol.toString());
    setMasterVolume(clampedVol);
    if (audioRef.current) {
      audioRef.current.volume = 1.0;
    }
    const vid = document.querySelector<HTMLVideoElement>('video');
    if (vid) {
      vid.volume = clampedVol;
    }
  };

  // Inspect Tags
  const handleInspectTags = async (track?: MediaItem) => {
    const target = track || currentTrack;
    if (!target) return;
    setIsTagModalOpen(true);
    await loadTrackTags(target);
  };

  // Audio element listeners (stable, ref-based to avoid stale closures)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      consecutiveErrorCountRef.current = 0;
      checkAndRecordTrackPlay(audio.currentTime, audio.duration || durationRef.current);
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      if (isPlayingRef.current && audio.paused) {
        resumeAudioContext();
        audio.play().catch(() => {});
      }
    };
    const onCanPlay = () => {
      if (isPlayingRef.current && audio.paused) {
        resumeAudioContext();
        audio.play().catch(() => {});
      }
    };
    const onEnded = () => {
      if (repeatModeRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        handleNext(true);
      }
    };

    const onPlay = () => {
      isPlayingRef.current = true;
      setIsPlaying(true);
      consecutiveErrorCountRef.current = 0;
    };
    const onPause = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
    };
    const onError = () => {
      if (currentTrackRef.current?.media_type === 'audio' && audio.currentSrc) {
        console.warn('Audio element error notice:', audio.error);
        handleSkipMissingFile(currentTrackRef.current.path);
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Synchronize audio volume on change via pre-fader GainNode
  useEffect(() => {
    setMasterVolume(volume);
    if (audioRef.current) {
      audioRef.current.volume = 1.0;
    }
  }, [volume]);

  // Stable refs for hotkey actions to prevent stale closures
  const handleSeekRef = useRef(handleSeek);
  handleSeekRef.current = handleSeek;
  const handleTogglePlayRef = useRef(handleTogglePlay);
  handleTogglePlayRef.current = handleTogglePlay;
  const handleVolumeChangeRef = useRef(handleVolumeChange);
  handleVolumeChangeRef.current = handleVolumeChange;
  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;
  const handlePrevRef = useRef(handlePrev);
  handlePrevRef.current = handlePrev;

  // Keyboard hotkeys (mounted once on startup, uses refs for real-time values)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault();
        handleTogglePlayRef.current();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.ctrlKey ? 30 : e.shiftKey ? 10 : 5;
        handleSeekRef.current(Math.min(durationRef.current, currentTimeRef.current + step));
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.ctrlKey ? 30 : e.shiftKey ? 10 : 5;
        handleSeekRef.current(Math.max(0, currentTimeRef.current - step));
      } else if (e.code === 'KeyL') {
        e.preventDefault();
        handleSeekRef.current(Math.min(durationRef.current, currentTimeRef.current + 10));
      } else if (e.code === 'KeyJ') {
        e.preventDefault();
        handleSeekRef.current(Math.max(0, currentTimeRef.current - 10));
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const nextVol = Math.min(1, Math.round((volumeRef.current + 0.05) * 100) / 100);
        handleVolumeChangeRef.current(nextVol);
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const nextVol = Math.max(0, Math.round((volumeRef.current - 0.05) * 100) / 100);
        handleVolumeChangeRef.current(nextVol);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        if (volumeRef.current > 0) {
          handleVolumeChangeRef.current(0);
        } else {
          handleVolumeChangeRef.current(0.5);
        }
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        handleNextRef.current(false);
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        handlePrevRef.current();
      } else if (e.code === 'KeyF' || e.code === 'F11') {
        if (currentTrackRef.current?.media_type === 'video') {
          e.preventDefault();
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            const container = document.querySelector<HTMLElement>('[data-video-container="true"]');
            if (container) {
              container.requestFullscreen().catch(() => {});
            }
          }
        }
      } else if (e.code === 'Escape') {
        if (isClosePromptOpenRef.current) {
          setIsClosePromptOpen(false);
          return;
        }
        if (isTagModalOpenRef.current) setIsTagModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Intercept window close requests and prompt user
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('request-close-prompt', () => {
      setIsClosePromptOpen(true);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleExitToTray = async () => {
    setIsClosePromptOpen(false);
    try {
      await invoke('hide_to_tray');
    } catch (err) {
      console.error('Failed to hide to tray:', err);
    }
  };

  const handleExitApp = async () => {
    setIsClosePromptOpen(false);
    try {
      await invoke('exit_app');
    } catch (err) {
      console.error('Failed to exit app:', err);
    }
  };

  // Listen for tray playback menu actions (Play/Pause, Next, Previous)
  useEffect(() => {
    let unlistenPlayPause: (() => void) | undefined;
    let unlistenNext: (() => void) | undefined;
    let unlistenPrev: (() => void) | undefined;

    listen('tray-play-pause', () => {
      handleTogglePlay();
    }).then((fn) => {
      unlistenPlayPause = fn;
    });

    listen('tray-next', () => {
      handleNext(false);
    }).then((fn) => {
      unlistenNext = fn;
    });

    listen('tray-prev', () => {
      handlePrev();
    }).then((fn) => {
      unlistenPrev = fn;
    });

    return () => {
      if (unlistenPlayPause) unlistenPlayPause();
      if (unlistenNext) unlistenNext();
      if (unlistenPrev) unlistenPrev();
    };
  }, []);

  // Synchronize tray menu items (grey out playback options if no track is selected)
  useEffect(() => {
    invoke('update_tray_playback_state', {
      hasTrack: !!currentTrack,
      isPlaying,
    }).catch(() => {});
  }, [currentTrack, isPlaying]);

  // --- Cooperative Idle Background Optimization Engine ---
  // Silently leverages idle periods (e.g. listening to music) to pre-warm:
  // 1. Next track audio binary + cover art (0ms gapless transitions)
  // 2. Uncached track cover arts in the current directory/view (instant scroll rendering)
  // 3. Child subdirectories into directoryCacheRef (instant folder navigation)
  // Immediately yields upon ANY user interaction (mousemove, keydown, click, scroll).
  useEffect(() => {
    let lastActive = Date.now();
    let isWorking = false;
    let cancelled = false;

    const onUserAction = () => {
      lastActive = Date.now();
    };

    window.addEventListener('mousemove', onUserAction, { passive: true });
    window.addEventListener('keydown', onUserAction, { passive: true });
    window.addEventListener('pointerdown', onUserAction, { passive: true });
    window.addEventListener('wheel', onUserAction, { passive: true });
    window.addEventListener('scroll', onUserAction, { passive: true });

    // Step 1: Pre-warm upcoming track audio binary & cover art
    const prewarmNextTrack = async (): Promise<boolean> => {
      if (!currentTrackRef.current) return false;
      const list = getActiveList();
      if (list.length <= 1) return false;

      let nextTrack: MediaItem | undefined;
      if (isShuffleRef.current) {
        const candidates = list.filter((f) => f.path !== currentTrackRef.current?.path);
        if (candidates.length > 0) {
          nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
        }
      } else {
        const idx = list.findIndex((f) => f.path === currentTrackRef.current?.path);
        if (idx >= 0 && idx + 1 < list.length) {
          nextTrack = list[idx + 1];
        } else if (repeatModeRef.current === 'all') {
          nextTrack = list[0];
        }
      }

      if (!nextTrack || nextTrack.media_type === 'video') return false;
      const nextExt = nextTrack.extension.toLowerCase();
      const isContainer = nextExt === 'm4a' || nextExt === 'aac';

      let didWork = false;
      if (!isContainer && !blobUrlCacheRef.current.has(nextTrack.path) && !prefetchingBlobSetRef.current.has(nextTrack.path)) {
        prefetchingBlobSetRef.current.add(nextTrack.path);
        try {
          await getOrCreateBlobUrl(nextTrack);
          didWork = true;
        } finally {
          prefetchingBlobSetRef.current.delete(nextTrack.path);
        }
      }

      if (!nextTrack.cover_art && !coverArtCacheRef.current.has(nextTrack.path)) {
        await loadTrackCoverArt(nextTrack);
        didWork = true;
      }

      return didWork;
    };

    // Step 2: Pre-warm cover arts of current folder (1 track per tick)
    const prewarmOneCoverArt = async (): Promise<boolean> => {
      const files = directoryData?.media_files;
      if (!files || files.length === 0) return false;

      const uncached = files.find(
        (f) =>
          !f.cover_art &&
          !coverArtCacheRef.current.has(f.path) &&
          !coverArtLoadingRef.current.has(f.path)
      );
      if (!uncached) return false;

      await loadTrackCoverArt(uncached);
      return true;
    };

    // Step 3: Pre-warm child subdirectories into memory (1 folder per tick)
    const prewarmOneSubdirectory = async (): Promise<boolean> => {
      if (!rootPath) return false;
      const subdirs = directoryData?.subdirectories;
      if (!subdirs || subdirs.length === 0) return false;

      const uncached = subdirs.find(
        (dir) =>
          !directoryCacheRef.current.has(dir.path) &&
          !preloadingSetRef.current.has(dir.path)
      );
      if (!uncached) return false;

      preloadingSetRef.current.add(uncached.path);
      try {
        const data = await invoke<DirectoryContent>('read_directory', {
          folderPath: uncached.path,
          rootPath,
          forceRefresh: false,
        });
        directoryCacheRef.current.set(uncached.path, data);
        return true;
      } catch {
        return false;
      } finally {
        preloadingSetRef.current.delete(uncached.path);
      }
    };

    // Cooperative idle dispatcher: runs every 800ms, only when user has been idle for >= 2.5s
    const intervalId = window.setInterval(async () => {
      if (cancelled || isWorking) return;
      if (Date.now() - lastActive < 2500) return;

      isWorking = true;
      try {
        // Priority 1: Upcoming track audio binary + art
        const didAudio = await prewarmNextTrack();
        if (cancelled || Date.now() - lastActive < 2500) return;
        if (didAudio) return;

        // Priority 2: Cover art trickle (1 image per interval)
        const didCover = await prewarmOneCoverArt();
        if (cancelled || Date.now() - lastActive < 2500) return;
        if (didCover) return;

        // Priority 3: Subdirectory pre-reading (1 directory per interval)
        await prewarmOneSubdirectory();
      } catch {
      } finally {
        isWorking = false;
      }
    }, 800);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('mousemove', onUserAction);
      window.removeEventListener('keydown', onUserAction);
      window.removeEventListener('pointerdown', onUserAction);
      window.removeEventListener('wheel', onUserAction);
      window.removeEventListener('scroll', onUserAction);
    };
  }, [directoryData, rootPath]);

  return (
    <div className="w-[960px] h-[540px] max-w-[960px] max-h-[540px] flex overflow-hidden select-none">
      {/* Hidden Audio Element for local audio streaming with CORS support for Web Audio API */}
      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />

      {/* Column 1: Non-Expandable Sidebar (Ratio 1 = 96px) */}
      <CompactSidebar
        currentPath={currentPath || ''}
        rootPath={rootPath || ''}
        onSelectRootFolder={handleSelectRootFolder}
        onNavigateHome={() => {
          if (rootPath) loadDirectory(rootPath, rootPath);
        }}
        onNavigateAllTracks={() => {
          if (rootPath) loadDirectory('__ALL_TRACKS__', rootPath);
        }}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      />

      {/* Main Content Area (Columns 2 & 3) */}
      {!rootPath ? (
        <div className="w-[912px] h-full flex">
          <EmptyState
            onSelectFolder={handleSelectRootFolder}
            isLoading={isLoadingDir}
            theme={theme}
          />
        </div>
      ) : (
        <>
          {/* Column 2: Directory & Tracklist (Ratio 4 = 384px) */}
          <TracklistView
            currentPath={currentPath || ''}
            breadcrumbs={directoryData?.breadcrumbs || EMPTY_BREADCRUMBS}
            onNavigateBreadcrumb={handleNavigateBreadcrumb}
            canGoBack={historyIndex > 0}
            canGoForward={historyIndex < history.length - 1}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            onRefresh={handleRefresh}
            subdirectories={directoryData?.subdirectories || EMPTY_SUBDIRS}
            mediaFiles={directoryData?.media_files || EMPTY_MEDIA}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onNavigate={handleNavigate}
            onHoverFolder={handleHoverFolder}
            onHoverTrack={prefetchTrackBlob}
            onLoadCoverArt={loadTrackCoverArt}
            coverArtCache={coverArtCacheRef.current}
            onPlayTrack={handlePlayTrackFromList}
            onTogglePlay={handleTogglePlay}
            onShufflePlay={handleShufflePlay}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            theme={theme}
            coverArt={coverArt}
          />

          {/* Column 3: Dedicated Player with Real Audio Wave (Ratio 5 = 480px) */}
          <DedicatedPlayer
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onNext={() => handleNext(false)}
            onPrev={handlePrev}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            volume={volume}
            onVolumeChange={handleVolumeChange}
            isShuffle={isShuffle}
            onToggleShuffle={() => setIsShuffle(!isShuffle)}
            repeatMode={repeatMode}
            onCycleRepeat={() => {
              setRepeatMode((prev) => {
                if (prev === 'off') return 'all';
                if (prev === 'all') return 'one';
                return 'off';
              });
            }}
            coverArt={coverArt}
            videoSrc={
              currentTrack?.media_type === 'video'
                ? convertFileSrc(currentTrack.path, 'stream')
                : undefined
            }
            onVideoTimeUpdate={(t) => {
              setCurrentTime(t);
              consecutiveErrorCountRef.current = 0;
              checkAndRecordTrackPlay(t, durationRef.current);
            }}
            onVideoLoadedMetadata={(d) => {
              setDuration(d);
              consecutiveErrorCountRef.current = 0;
            }}
            onVideoEnded={() => {
              if (repeatModeRef.current === 'one') {
                setCurrentTime(0);
              } else {
                handleNext(true);
              }
            }}
            onVideoError={() => {
              if (currentTrackRef.current?.media_type === 'video') {
                handleSkipMissingFile(currentTrackRef.current.path);
              }
            }}
            onOpenTagDetails={() => handleInspectTags()}
            theme={theme}
          />
        </>
      )}

      {/* Tag Details Modal */}
      <TagDetailsModal
        tags={activeTags}
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        isLoading={isLoadingTags}
        theme={theme}
      />

      {/* Exit Prompt Modal */}
      <ExitPromptModal
        isOpen={isClosePromptOpen}
        onClose={() => setIsClosePromptOpen(false)}
        onExitToTray={handleExitToTray}
        onExitApp={handleExitApp}
        theme={theme}
      />
    </div>
  );
}

export default App;
