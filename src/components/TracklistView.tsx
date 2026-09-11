import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  BreadcrumbItem,
  FolderItem,
  MediaItem,
} from '../types/media';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Folder,
  Music,
  Film,
  Play,
  Pause,
  Search,
  Check,
  Layers,
  Sparkles,
} from 'lucide-react';
import { CosmeticWave } from './SoundWave';
import { matchSearch } from '../utils/textSearch';

interface TracklistViewProps {
  currentPath?: string;
  breadcrumbs: BreadcrumbItem[];
  onNavigateBreadcrumb: (path: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onRefresh: () => void;
  subdirectories: FolderItem[];
  mediaFiles: MediaItem[];
  currentTrack: MediaItem | null;
  isPlaying: boolean;
  onNavigate: (path: string) => void;
  onHoverFolder?: (path: string) => void;
  onHoverTrack?: (track: MediaItem) => void;
  onLoadCoverArt?: (track: MediaItem) => Promise<string | null>;
  coverArtCache?: Map<string, string | null>;
  onPlayTrack: (track: MediaItem, customPlaylist?: MediaItem[]) => void;
  onTogglePlay: () => void;
  onShufflePlay?: (files: MediaItem[]) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  theme: 'dark' | 'light';
  coverArt?: string | null;
}

interface TrackRowProps {
  track: MediaItem;
  isCurrent: boolean;
  isThisPlaying: boolean;
  isDark: boolean;
  currentTrackCover: string | null;
  cachedCover: string | null;
  onPlay: (track: MediaItem) => void;
  onTogglePlay: () => void;
  onHoverTrack?: (track: MediaItem) => void;
  onLoadCoverArt?: (track: MediaItem) => Promise<string | null>;
}

const TrackRow = React.memo<TrackRowProps>(
  ({
    track,
    isCurrent,
    isThisPlaying,
    isDark,
    currentTrackCover,
    cachedCover,
    onPlay,
    onTogglePlay,
    onHoverTrack,
    onLoadCoverArt,
  }) => {
    const [localCover, setLocalCover] = useState<string | null>(
      track.cover_art || cachedCover || null
    );

    useEffect(() => {
      setLocalCover(track.cover_art || cachedCover || null);
    }, [track.path, track.cover_art, cachedCover]);

    useEffect(() => {
      if (track.cover_art || cachedCover || !onLoadCoverArt) return;
      let active = true;
      onLoadCoverArt(track).then((art) => {
        if (active && art) {
          setLocalCover(art);
        }
      });
      return () => {
        active = false;
      };
    }, [track.path, track.cover_art, cachedCover, onLoadCoverArt]);

    const itemCoverArt =
      track.cover_art || cachedCover || localCover || (isCurrent ? currentTrackCover : null);

    return (
      <div
        data-track-path={track.path}
        onClick={() => {
          if (isCurrent) {
            onTogglePlay();
          } else {
            onPlay(track);
          }
        }}
        onMouseEnter={() => onHoverTrack?.(track)}
        style={{ height: '52px' }}
        className={`group flex items-center justify-between p-2 rounded-none cursor-pointer transition-none ${
          isCurrent
            ? isDark
              ? 'bg-white/[0.08] border border-[#facc15]/30 shadow-sm'
              : 'bg-amber-50/80 border border-[#facc15] shadow-sm'
            : isDark
            ? 'hover:bg-white/[0.04] border border-transparent'
            : 'hover:bg-slate-100 border border-transparent'
        }`}
      >
        {/* Left: Square Thumbnail with Album Cover Art / Film Frame for Video */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div
            className={`w-10 h-10 rounded-none flex items-center justify-center shrink-0 overflow-hidden relative shadow-sm ${
              track.media_type === 'video'
                ? 'bg-black border border-neutral-700'
                : isDark
                ? 'bg-[#222222] border border-white/5'
                : 'bg-slate-200 border border-slate-300/50'
            }`}
          >
            {itemCoverArt ? (
              <img
                src={itemCoverArt}
                alt=""
                className="w-full h-full object-cover rounded-none"
                decoding="async"
              />
            ) : track.media_type === 'video' ? (
              <Film className="w-4 h-4 opacity-40" />
            ) : (
              <Music className={`w-5 h-5 ${isCurrent ? 'text-[#facc15]' : 'opacity-40'}`} />
            )}

            {/* 35mm Film Frame Perforations for Video Tracks */}
            {track.media_type === 'video' && (
              <>
                <div className="absolute top-0 inset-x-0 h-1 bg-black/90 flex items-center justify-around px-0.5 z-10 pointer-events-none">
                  <span className="w-1 h-[2px] bg-white/70 block" />
                  <span className="w-1 h-[2px] bg-white/70 block" />
                  <span className="w-1 h-[2px] bg-white/70 block" />
                  <span className="w-1 h-[2px] bg-white/70 block" />
                </div>
                <div className="absolute bottom-0 inset-x-0 h-1 bg-black/90 flex items-center justify-around px-0.5 z-10 pointer-events-none">
                  <span className="w-1 h-[2px] bg-white/70 block" />
                  <span className="w-1 h-[2px] bg-white/70 block" />
                  <span className="w-1 h-[2px] bg-white/70 block" />
                  <span className="w-1 h-[2px] bg-white/70 block" />
                </div>
                <div className="absolute inset-y-0 left-0 w-0.5 bg-black/90 z-10 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-0.5 bg-black/90 z-10 pointer-events-none" />
              </>
            )}

            {/* Hover play/pause overlay */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-20">
              {isThisPlaying ? (
                <Pause className="w-4 h-4 text-white fill-white" />
              ) : (
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              )}
            </div>
          </div>

          {/* Title & Artist Stack */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5 min-w-0">
              <span
                className={`text-xs font-medium truncate ${
                  isCurrent
                    ? isDark
                      ? 'text-[#facc15]'
                      : 'text-[#ca8a04]'
                    : isDark
                    ? 'text-white'
                    : 'text-slate-900'
                }`}
              >
                {track.title}
              </span>
              {/* Cosmetic wave indicator next to song title when playing */}
              {isThisPlaying && (
                <CosmeticWave color={isDark ? '#facc15' : '#ca8a04'} isPlaying={true} />
              )}
            </div>

            <div className="text-[11px] font-light opacity-60 truncate mt-0.5">
              {track.artist || (track.media_type === 'video' ? 'Video File' : 'Unknown Artist')}
            </div>
          </div>
        </div>

        {/* Right: Duration */}
        <div className="flex items-center justify-end shrink-0 pl-2">
          <span className="text-[10px] font-mono opacity-40">
            {track.duration_formatted || '—'}
          </span>
        </div>
      </div>
    );
  }
);

export const formatFolderSubtitle = (folder: FolderItem, isMyMix: boolean): string => {
  const audioCount = folder.audio_count ?? 0;
  const videoCount = folder.video_count ?? 0;

  if (isMyMix) {
    if (audioCount > 0 && videoCount > 0) {
      const trackStr = `${audioCount} ${audioCount === 1 ? 'track' : 'tracks'}`;
      const videoStr = `${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`;
      return `${trackStr}, ${videoStr} • Auto-curated`;
    }
    return `${folder.media_count} ${folder.media_count === 1 ? 'track' : 'tracks'} • Auto-curated`;
  }

  // Both audio tracks and video files: e.g. "14 tracks, 3 videos"
  if (audioCount > 0 && videoCount > 0) {
    const trackStr = `${audioCount} ${audioCount === 1 ? 'track' : 'tracks'}`;
    const videoStr = `${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`;
    return `${trackStr}, ${videoStr}`;
  }

  // Only audio tracks: e.g. "14 tracks"
  if (audioCount > 0) {
    return `${audioCount} ${audioCount === 1 ? 'track' : 'tracks'}`;
  }

  // Only video files: e.g. "3 videos"
  if (videoCount > 0) {
    return `${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`;
  }

  // Fallback for media_count when counts aren't separated
  if (folder.media_count > 0) {
    return `${folder.media_count} ${folder.media_count === 1 ? 'track' : 'tracks'}`;
  }

  // Non-media items
  if (folder.item_count > 0) {
    return `${folder.item_count} ${folder.item_count === 1 ? 'item' : 'items'}`;
  }

  return 'Empty';
};

const TracklistViewComponent: React.FC<TracklistViewProps> = ({
  currentPath,
  breadcrumbs,
  onNavigateBreadcrumb,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onRefresh,
  subdirectories,
  mediaFiles,
  currentTrack,
  isPlaying,
  onNavigate,
  onHoverFolder,
  onHoverTrack,
  onLoadCoverArt,
  coverArtCache,
  onPlayTrack,
  onTogglePlay,
  onShufflePlay,
  searchQuery,
  onSearchChange,
  theme,
  coverArt,
}) => {
  const isDark = theme === 'dark';

  const [isFoldersCollapsed, setIsFoldersCollapsed] = useState<boolean>(false);
  const [filterAudio, setFilterAudio] = useState<boolean>(true);
  const [filterVideo, setFilterVideo] = useState<boolean>(true);

  // Virtualization state & refs
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(700);
  const [tracksTop, setTracksTop] = useState<number>(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tracksContainerRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const isInsideAllTracks =
    currentPath === '__ALL_TRACKS__' ||
    (breadcrumbs.length > 0 && breadcrumbs[breadcrumbs.length - 1].path === '__ALL_TRACKS__');

  const isInsideMyMix =
    currentPath === '__MY_MIX__' ||
    (breadcrumbs.length > 0 && breadcrumbs[breadcrumbs.length - 1].path === '__MY_MIX__');

  const audioCount = useMemo(
    () => mediaFiles.filter((f) => f.media_type === 'audio').length,
    [mediaFiles]
  );
  const videoCount = useMemo(
    () => mediaFiles.filter((f) => f.media_type === 'video').length,
    [mediaFiles]
  );

  const filteredSubdirectories = useMemo(() => {
    if (!searchQuery.trim()) return subdirectories;
    return subdirectories.filter((folder) => matchSearch(folder.name, searchQuery));
  }, [subdirectories, searchQuery]);

  const filteredFiles = useMemo(() => {
    return mediaFiles.filter((item) => {
      if (isInsideAllTracks) {
        if (item.media_type === 'audio' && !filterAudio) return false;
        if (item.media_type === 'video' && !filterVideo) return false;
      }

      if (!searchQuery.trim()) return true;
      const searchableString = `${item.title} ${item.artist || ''} ${item.album || ''} ${item.name || ''} ${item.extension}`;
      return matchSearch(searchableString, searchQuery);
    });
  }, [mediaFiles, isInsideAllTracks, filterAudio, filterVideo, searchQuery]);

  // Reset scroll on folder navigation
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [currentPath]);

  // Measure container height and tracks offset
  useEffect(() => {
    const updateDimensions = () => {
      if (scrollContainerRef.current) {
        setContainerHeight(scrollContainerRef.current.clientHeight || 700);
      }
      if (tracksContainerRef.current) {
        setTracksTop(tracksContainerRef.current.offsetTop);
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [subdirectories.length, isFoldersCollapsed]);

  // High-performance rAF-throttled scroll handler
  const handleListScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
      if (tracksContainerRef.current) {
        setTracksTop(tracksContainerRef.current.offsetTop);
      }
      rafIdRef.current = null;
    });
  }, []);

  // Clean up any pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Virtual windowing calculations: each row is 52px height + 4px gap = 56px total height
  const ROW_TOTAL_HEIGHT = 56;
  const OVERSCAN = 10;

  const { topSpacer, bottomSpacer, visibleTracks } = useMemo(() => {
    const total = filteredFiles.length;
    if (total <= 30) {
      return {
        topSpacer: 0,
        bottomSpacer: 0,
        visibleTracks: filteredFiles,
      };
    }

    const effectiveScroll = Math.max(0, scrollTop - tracksTop);
    const start = Math.max(0, Math.floor(effectiveScroll / ROW_TOTAL_HEIGHT) - OVERSCAN);
    const visibleCount = Math.ceil(containerHeight / ROW_TOTAL_HEIGHT) + 2 * OVERSCAN;
    const end = Math.min(total, start + visibleCount);

    return {
      topSpacer: start * ROW_TOTAL_HEIGHT,
      bottomSpacer: Math.max(0, (total - end) * ROW_TOTAL_HEIGHT),
      visibleTracks: filteredFiles.slice(start, end),
    };
  }, [filteredFiles, scrollTop, tracksTop, containerHeight]);

  const handleTrackPlay = useCallback(
    (track: MediaItem) => {
      onPlayTrack(track, filteredFiles);
    },
    [onPlayTrack, filteredFiles]
  );

  const handleShufflePlay = useCallback(() => {
    if (filteredFiles.length === 0) return;
    if (onShufflePlay) {
      onShufflePlay(filteredFiles);
    } else {
      const randomIndex = Math.floor(Math.random() * filteredFiles.length);
      onPlayTrack(filteredFiles[randomIndex], filteredFiles);
    }
  }, [filteredFiles, onShufflePlay, onPlayTrack]);

  return (
    <section
      className={`w-[412px] h-full flex flex-col select-none shrink-0 overflow-hidden overflow-x-hidden relative z-10 transition-colors ${
        isDark
          ? 'bg-[#121212] text-white'
          : 'bg-white text-slate-900'
      }`}
    >
      {/* Top Header matching sketch: [<] [>] Breadcrumb of directory [↻] */}
      <div
        className={`h-11 flex items-center justify-between px-3 border-b shrink-0 overflow-hidden ${
          isDark ? 'border-white/[0.06] bg-[#141414]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        {/* Navigation Arrows */}
        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={onGoBack}
            disabled={!canGoBack}
            className={`p-1 rounded-none transition-colors active:scale-95 ${
              canGoBack
                ? isDark
                  ? 'text-white/70 hover:text-white'
                  : 'text-slate-600 hover:text-slate-950'
                : 'opacity-25 cursor-default'
            }`}
            title="Back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onGoForward}
            disabled={!canGoForward}
            className={`p-1 rounded-none transition-colors active:scale-95 ${
              canGoForward
                ? isDark
                  ? 'text-white/70 hover:text-white'
                  : 'text-slate-600 hover:text-slate-950'
                : 'opacity-25 cursor-default'
            }`}
            title="Forward"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Breadcrumb Trail: cleanly fits without horizontal scrolling */}
        <div className="flex-1 mx-2 min-w-0 overflow-hidden">
          <div className="flex items-center space-x-1 text-xs font-medium truncate">
            {breadcrumbs.length > 3 ? (
              <>
                <button
                  onClick={() => onNavigateBreadcrumb(breadcrumbs[0].path)}
                  className={`truncate max-w-[80px] transition-colors ${
                    isDark ? 'text-white/50 hover:text-white' : 'text-slate-400 hover:text-slate-800'
                  }`}
                  title={breadcrumbs[0].path}
                >
                  {breadcrumbs[0].name}
                </button>
                <span className="opacity-30 text-[10px]">/</span>
                <span className="opacity-40 text-[10px]">...</span>
                <span className="opacity-30 text-[10px]">/</span>
                <button
                  onClick={() => onNavigateBreadcrumb(breadcrumbs[breadcrumbs.length - 1].path)}
                  className="truncate max-w-[140px] font-bold text-[#facc15]"
                  title={breadcrumbs[breadcrumbs.length - 1].path}
                >
                  {breadcrumbs[breadcrumbs.length - 1].name}
                </button>
              </>
            ) : (
              breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.path}>
                    {idx > 0 && <span className="opacity-30 text-[10px]">/</span>}
                    <button
                      onClick={() => onNavigateBreadcrumb(crumb.path)}
                      className={`truncate max-w-[120px] transition-colors ${
                        isLast
                          ? 'font-bold text-[#facc15]'
                          : isDark
                          ? 'text-white/60 hover:text-white'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                      title={crumb.path}
                    >
                      {crumb.name}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          className={`p-1 rounded-none transition-colors shrink-0 active:scale-95 ${
            isDark ? 'text-white/60 hover:text-white' : 'text-slate-500 hover:text-slate-900'
          }`}
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Search Input */}
      <div className={`px-3 py-1.5 border-b shrink-0 ${isDark ? 'border-white/[0.04] bg-[#161616]' : 'border-slate-100 bg-slate-50/50'}`}>
        <div className="relative flex items-center">
          <Search className="w-3 h-3 opacity-40 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search in folder..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`w-full text-xs pl-7 pr-3 py-1 rounded-none border focus:outline-none transition-colors ${
              isDark
                ? 'bg-[#202020] border-transparent text-white placeholder-white/40 focus:border-[#facc15]/50'
                : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-[#ca8a04]/50'
            }`}
          />
        </div>
      </div>

      {/* Filter / Header Bar (Inside All Tracks or My Mix) */}
      {(isInsideAllTracks || isInsideMyMix) && (
        <div
          className={`px-3 py-1 border-b shrink-0 flex items-center justify-between text-xs ${
            isDark
              ? 'border-white/[0.04] bg-[#141414] text-white/70'
              : 'border-slate-100 bg-slate-50/70 text-slate-600'
          }`}
        >
          {isInsideMyMix ? (
            <div className="flex items-center space-x-2">
              <span
                className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  isDark ? 'bg-[#facc15] text-black' : 'bg-[#ca8a04] text-white'
                }`}
              >
                MIX
              </span>
              <span className="text-[11px] font-medium tracking-wide flex items-center space-x-1.5">
                <Sparkles className={`w-3.5 h-3.5 ${isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'}`} />
                <span>Recent High-Frequency Mix</span>
                <span className="text-[10px] font-mono opacity-50">({filteredFiles.length})</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              {/* Tracks tick box */}
              <button
                type="button"
                onClick={() => setFilterAudio((prev) => !prev)}
                className={`flex items-center space-x-2 py-0.5 cursor-pointer select-none group ${
                  filterAudio
                    ? isDark ? 'text-white font-medium' : 'text-slate-900 font-medium'
                    : isDark ? 'text-white/35 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Tracks"
              >
                <div
                  className={`w-3.5 h-3.5 rounded-none flex items-center justify-center border ${
                    filterAudio
                      ? isDark
                        ? 'bg-[#facc15] border-[#facc15] text-black shadow-sm'
                        : 'bg-[#eab308] border-[#eab308] text-white shadow-sm'
                      : isDark
                      ? 'border-white/30 bg-transparent group-hover:border-white/60'
                      : 'border-slate-400/60 bg-transparent group-hover:border-slate-600'
                  }`}
                >
                  {filterAudio && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </div>
                <span className="text-[11px] tracking-wide flex items-center space-x-1">
                  <span>Tracks</span>
                  <span className="text-[10px] font-mono opacity-50">({audioCount})</span>
                </span>
              </button>

              {/* MP4 tick box */}
              <button
                type="button"
                onClick={() => setFilterVideo((prev) => !prev)}
                className={`flex items-center space-x-2 py-0.5 cursor-pointer select-none group ${
                  filterVideo
                    ? isDark ? 'text-white font-medium' : 'text-slate-900 font-medium'
                    : isDark ? 'text-white/35 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Videos"
              >
                <div
                  className={`w-3.5 h-3.5 rounded-none flex items-center justify-center border ${
                    filterVideo
                      ? isDark
                        ? 'bg-[#facc15] border-[#facc15] text-black shadow-sm'
                        : 'bg-[#eab308] border-[#eab308] text-white shadow-sm'
                      : isDark
                      ? 'border-white/30 bg-transparent group-hover:border-white/60'
                      : 'border-slate-400/60 bg-transparent group-hover:border-slate-600'
                  }`}
                >
                  {filterVideo && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                </div>
                <span className="text-[11px] tracking-wide flex items-center space-x-1">
                  <span>MP4</span>
                  <span className="text-[10px] font-mono opacity-50">({videoCount})</span>
                </span>
              </button>
            </div>
          )}

          {/* Top Right: Compact JAM! Button with Native Title Tooltip */}
          <button
            type="button"
            onClick={handleShufflePlay}
            disabled={filteredFiles.length === 0}
            className={`px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded-none transition-none cursor-pointer select-none active:scale-95 ${
              filteredFiles.length === 0
                ? isDark
                  ? 'bg-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-[#facc15] text-black hover:bg-[#eab308]'
            }`}
            title="Shuffle play"
          >
            JAM!
          </button>
        </div>
      )}

      {/* Unified Scrollable Directory Content: Folders & Tracks */}
      <div
        ref={scrollContainerRef}
        onScroll={handleListScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 no-scrollbar relative"
      >
        {filteredSubdirectories.length === 0 && filteredFiles.length === 0 ? (
          <div className="py-12 text-center text-xs opacity-40">
            {isInsideAllTracks && !filterAudio && !filterVideo
              ? 'Both Tracks and MP4 are unticked'
              : searchQuery
              ? 'No matching tracks or folders'
              : 'No media files in this folder'}
          </div>
        ) : (
          <>
            {/* Folders Section */}
            {filteredSubdirectories.length > 0 && (
              <div className="mb-2">
                {/* Collapsible Section Header */}
                <div
                  onClick={() => setIsFoldersCollapsed((prev) => !prev)}
                  className={`flex items-center justify-between px-2 py-1.5 cursor-pointer select-none text-[10px] font-bold uppercase tracking-wider rounded-none transition-colors ${
                    isDark
                      ? 'text-white/50 hover:text-white/90'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <Folder className={`w-3.5 h-3.5 ${isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'}`} />
                    <span>Folders ({filteredSubdirectories.length})</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-[9px] lowercase font-mono opacity-60">
                      {isFoldersCollapsed ? 'show' : 'hide'}
                    </span>
                    {isFoldersCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    )}
                  </div>
                </div>

                {/* Subfolder List */}
                {!isFoldersCollapsed && (
                  <div className="space-y-1 mt-1">
                    {filteredSubdirectories.map((folder) => {
                      const isAllTracks = folder.path === '__ALL_TRACKS__';
                      const isMyMix = folder.path === '__MY_MIX__';
                      return (
                        <div
                          key={folder.path}
                          onClick={() => onNavigate(folder.path)}
                          onMouseEnter={() => onHoverFolder?.(folder.path)}
                          className={`group flex items-center justify-between p-2 rounded-none cursor-pointer transition-all ${
                            isDark
                              ? 'hover:bg-white/[0.05] border border-transparent'
                              : 'hover:bg-slate-100 border border-transparent'
                          }`}
                        >
                          {/* Left: Folder Square Icon matching track thumbnail size (w-10 h-10) */}
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div
                              className={`w-10 h-10 rounded-none flex items-center justify-center shrink-0 shadow-sm transition-colors ${
                                isDark
                                  ? 'bg-[#1e1e1e] border border-white/5'
                                  : 'bg-slate-100 border border-slate-300/50'
                              }`}
                            >
                              {isMyMix ? (
                                <Sparkles className={`w-5 h-5 transition-colors ${isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'}`} />
                              ) : isAllTracks ? (
                                <Layers className={`w-5 h-5 transition-colors ${isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'}`} />
                              ) : (
                                <Folder
                                  className={`w-5 h-5 transition-colors ${
                                    isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'
                                  }`}
                                />
                              )}
                            </div>

                            {/* Folder Name & Info Stack */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-1.5 min-w-0">
                                <div
                                  className={`text-xs font-medium truncate transition-colors ${
                                    isDark ? 'text-white' : 'text-slate-900'
                                  }`}
                                >
                                  {folder.name}
                                </div>
                                {isMyMix && (
                                  <span
                                    className={`text-[8px] font-bold px-1 py-0.2 tracking-wider shrink-0 uppercase ${
                                      isDark ? 'bg-[#facc15] text-black' : 'bg-[#ca8a04] text-white'
                                    }`}
                                  >
                                    MIX
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] opacity-50 truncate mt-0.5 font-mono">
                                {formatFolderSubtitle(folder, isMyMix)}
                              </div>
                            </div>
                          </div>

                          {/* Right: Navigation Arrow */}
                          <div className="flex items-center justify-end shrink-0 pl-2">
                            <ChevronRight className="w-4 h-4 opacity-30 group-hover:opacity-90 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tracks Section Header if both folders and tracks exist */}
            {filteredSubdirectories.length > 0 && filteredFiles.length > 0 && !isFoldersCollapsed && (
              <div
                className={`px-2 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider flex items-center space-x-1.5 border-t ${
                  isDark ? 'text-white/40 border-white/[0.04]' : 'text-slate-400 border-slate-200'
                }`}
              >
                <Music className="w-3 h-3 opacity-60" />
                <span>Tracks ({filteredFiles.length})</span>
              </div>
            )}

            {/* Virtualized Tracks List */}
            <div ref={tracksContainerRef} className="space-y-1">
              {topSpacer > 0 && <div style={{ height: `${topSpacer}px` }} aria-hidden="true" />}
              {visibleTracks.map((track) => (
                <TrackRow
                  key={track.path}
                  track={track}
                  isCurrent={currentTrack?.path === track.path}
                  isThisPlaying={currentTrack?.path === track.path && isPlaying}
                  isDark={isDark}
                  currentTrackCover={coverArt || null}
                  cachedCover={coverArtCache?.get(track.path) || null}
                  onPlay={handleTrackPlay}
                  onTogglePlay={onTogglePlay}
                  onHoverTrack={onHoverTrack}
                  onLoadCoverArt={onLoadCoverArt}
                />
              ))}
              {bottomSpacer > 0 && <div style={{ height: `${bottomSpacer}px` }} aria-hidden="true" />}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export const TracklistView = React.memo(TracklistViewComponent);
