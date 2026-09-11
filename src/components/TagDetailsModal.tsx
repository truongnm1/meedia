import React, { useRef } from 'react';
import { MediaTags } from '../types/media';
import { X, Disc, Music, HardDrive, FileText, Activity, FolderOpen } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface TagDetailsModalProps {
  tags: MediaTags | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  theme?: 'dark' | 'light';
}

export const TagDetailsModal: React.FC<TagDetailsModalProps> = ({
  tags,
  isOpen,
  onClose,
  isLoading,
  theme = 'dark',
}) => {
  if (!isOpen) return null;

  const isDark = theme !== 'light';

  const handleOpenInExplorer = async () => {
    if (!tags?.file_path) return;
    try {
      await invoke('open_in_explorer', { filePath: tags.file_path });
    } catch (err) {
      console.error('Failed to open in explorer:', err);
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const labelClass = isDark
    ? 'text-white/40 block text-[10px] font-mono uppercase tracking-wider mb-0.5'
    : 'text-slate-400 block text-[10px] font-mono uppercase tracking-wider mb-0.5 font-medium';
  const valueClass = isDark
    ? 'text-white font-medium truncate block text-xs'
    : 'text-slate-900 font-medium truncate block text-xs';
  const monoValueClass = isDark
    ? 'text-white/90 font-mono font-medium block text-xs truncate'
    : 'text-slate-800 font-mono font-medium block text-xs truncate';
  const sectionHeaderClass = `flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider pb-1.5 border-b ${
    isDark ? 'text-white/50 border-white/[0.08]' : 'text-slate-500 border-slate-200'
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 select-none animate-in fade-in duration-150">
      {/* Container (Sleek brutalist panel adapting to dark / light theme) */}
      <div
        className={`w-[520px] max-h-[490px] border rounded-none shadow-2xl flex flex-col overflow-hidden ${
          isDark
            ? 'bg-[#181818] border-white/10 text-white'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`h-8 flex items-center justify-between px-3.5 border-b shrink-0 ${
            isDark
              ? 'bg-[#141414] border-white/[0.06]'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Disc className={`w-3.5 h-3.5 ${isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'}`} />
            <span className={`text-xs font-semibold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Track Details
            </span>
          </div>
          <div className="flex items-center">
            <button
              onClick={onClose}
              className={`p-1 rounded-none transition-colors active:scale-95 ${
                isDark
                  ? 'text-white/40 hover:text-white hover:bg-white/10'
                  : 'text-slate-400 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 overscroll-contain no-scrollbar relative"
          style={{ willChange: 'scroll-position', transform: 'translateZ(0)' }}
        >
          {isLoading ? (
            <div className={`py-12 text-center text-xs ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
              Reading file tags & metadata...
            </div>
          ) : !tags ? (
            <div className={`py-12 text-center text-xs ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
              No metadata available
            </div>
          ) : (
            <>
              {/* Artwork & Hero Info */}
              <div className="flex space-x-4">
                {/* Artwork */}
                <div
                  className={`w-24 h-24 rounded-none flex items-center justify-center shrink-0 overflow-hidden shadow-md border ${
                    isDark
                      ? 'bg-[#242424] border-white/5'
                      : 'bg-slate-100 border-slate-200'
                  }`}
                >
                  {tags.cover_art ? (
                    <img
                      src={tags.cover_art}
                      alt="Cover Art"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music className={`w-10 h-10 ${isDark ? 'text-white/20' : 'text-slate-300'}`} />
                  )}
                </div>

                {/* Main Track Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
                  <div className="inline-flex items-center">
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-none border ${
                        isDark
                          ? 'bg-white/10 text-white/80 border-white/10'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                    >
                      {tags.file_format}
                    </span>
                    {tags.bits_per_sample && tags.bits_per_sample >= 24 && (
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-none ml-1.5 border ${
                          isDark
                            ? 'bg-[#facc15]/20 text-[#facc15] border-[#facc15]/30'
                            : 'bg-amber-100 text-[#b45309] border-amber-300'
                        }`}
                      >
                        Hi-Res {tags.bits_per_sample}-bit
                      </span>
                    )}
                  </div>
                  <h2 className={`text-lg font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {tags.title || tags.file_name}
                  </h2>
                  <p className={`text-sm truncate ${isDark ? 'text-white/80' : 'text-slate-600'}`}>
                    {tags.artist || 'Unknown Artist'}
                  </p>
                  <p className={`text-xs truncate ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                    {tags.album || 'Unknown Album'}
                    {tags.year ? ` • ${tags.year}` : ''}
                  </p>
                </div>
              </div>

              {/* Tag Details */}
              <div className="space-y-2.5">
                <div className={sectionHeaderClass}>
                  <FileText className={`w-3.5 h-3.5 ${isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'}`} />
                  <span>Metadata</span>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-3 pt-0.5">
                  <div>
                    <span className={labelClass}>Title</span>
                    <span className={valueClass} title={tags.title || undefined}>
                      {tags.title || '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Artist</span>
                    <span className={valueClass} title={tags.artist || undefined}>
                      {tags.artist || '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Album</span>
                    <span className={valueClass} title={tags.album || undefined}>
                      {tags.album || '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Genre</span>
                    <span className={valueClass} title={tags.genre || undefined}>
                      {tags.genre || '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Track Number</span>
                    <span className={monoValueClass}>
                      {tags.track_number
                        ? tags.track_total
                          ? `${tags.track_number} of ${tags.track_total}`
                          : tags.track_number
                        : '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Disc Number</span>
                    <span className={monoValueClass}>
                      {tags.disc_number
                        ? tags.disc_total
                          ? `${tags.disc_number} of ${tags.disc_total}`
                          : tags.disc_number
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Technical / Audio Engineering Info */}
              <div className="space-y-2.5">
                <div className={sectionHeaderClass}>
                  <Activity className={`w-3.5 h-3.5 ${isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'}`} />
                  <span>Audio Specs</span>
                </div>

                <div className="grid grid-cols-3 gap-x-6 gap-y-3 pt-0.5">
                  <div>
                    <span className={labelClass}>Duration</span>
                    <span className={monoValueClass}>
                      {tags.duration_formatted || '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Bitrate</span>
                    <span className={monoValueClass}>
                      {tags.bitrate ? `${tags.bitrate} kbps` : '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Sample Rate</span>
                    <span className={monoValueClass}>
                      {tags.sample_rate ? `${(tags.sample_rate / 1000).toFixed(1)} kHz` : '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Bit Depth</span>
                    <span className={monoValueClass}>
                      {tags.bits_per_sample ? `${tags.bits_per_sample}-bit` : '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>Channels</span>
                    <span className={monoValueClass}>
                      {tags.channels === 2
                        ? 'Stereo (2ch)'
                        : tags.channels === 1
                        ? 'Mono (1ch)'
                        : tags.channels
                        ? `${tags.channels} ch`
                        : '—'}
                    </span>
                  </div>

                  <div>
                    <span className={labelClass}>File Size</span>
                    <span className={monoValueClass}>
                      {tags.file_size_formatted}
                    </span>
                  </div>
                </div>
              </div>

              {/* File Path */}
              <div className="space-y-2">
                <div className={sectionHeaderClass}>
                  <HardDrive className={`w-3.5 h-3.5 ${isDark ? 'text-[#facc15]' : 'text-[#ca8a04]'}`} />
                  <span>Location</span>
                </div>
                <div className="flex items-start justify-between gap-3 pt-0.5">
                  <div
                    className={`text-[11px] font-mono break-all select-text leading-relaxed flex-1 ${
                      isDark ? 'text-white/70' : 'text-slate-600'
                    }`}
                  >
                    {tags.file_path}
                  </div>
                  {tags.file_path && (
                    <button
                      onClick={handleOpenInExplorer}
                      className={`shrink-0 p-0.5 transition-colors cursor-pointer active:scale-90 ${
                        isDark
                          ? 'text-white/40 hover:text-white'
                          : 'text-slate-400 hover:text-slate-800'
                      }`}
                      title="Open in Explorer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Additional / Extended Tags */}
              {tags.other_tags && tags.other_tags.length > 0 && (
                <div className="space-y-2">
                  <div className={sectionHeaderClass}>
                    <span>Extended ({tags.other_tags.length})</span>
                  </div>
                  <div className="space-y-1 pt-1">
                    {tags.other_tags.map((item, idx) => (
                      <div
                        key={idx}
                        className={`flex justify-between text-[11px] py-1 border-b last:border-0 ${
                          isDark ? 'border-white/[0.04]' : 'border-slate-200/60'
                        }`}
                      >
                        <span className={`font-mono ${isDark ? 'text-white/40' : 'text-slate-400'}`}>
                          {item.key}
                        </span>
                        <span
                          className={`font-mono truncate max-w-[280px] ${
                            isDark ? 'text-white/80' : 'text-slate-700 font-medium'
                          }`}
                        >
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
