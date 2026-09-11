import React from 'react';
import { FolderOpen, Disc, Music, Film } from 'lucide-react';

interface EmptyStateProps {
  onSelectFolder: () => void;
  isLoading: boolean;
  theme?: 'dark' | 'light';
}

const EmptyStateComponent: React.FC<EmptyStateProps> = ({ onSelectFolder, isLoading, theme = 'dark' }) => {
  const isDark = theme === 'dark';

  return (
    <div
      className={`flex-1 flex flex-col items-center justify-center p-8 select-none text-center transition-colors ${
        isDark ? 'bg-[#121212] text-white' : 'bg-slate-50 text-slate-800'
      }`}
    >
      <div
        className={`w-16 h-16 rounded-none flex items-center justify-center mb-5 text-[#facc15] shadow-sm ${
          isDark ? 'bg-white/[0.05]' : 'bg-amber-100/60'
        }`}
      >
        <Disc className="w-8 h-8" />
      </div>

      <h2 className="text-xl font-bold tracking-tight mb-2">
        Select a Media Folder
      </h2>
      <p className="text-xs opacity-60 max-w-sm mb-6 leading-relaxed">
        Choose a folder on your computer to browse and play your local FLAC, MP3, and MP4 library.
      </p>

      <button
        onClick={onSelectFolder}
        disabled={isLoading}
        className="flex items-center space-x-2 px-6 py-2.5 rounded-none bg-[#facc15] hover:bg-[#eab308] text-black font-semibold text-xs tracking-wide transition-all transform hover:scale-105 active:scale-95 shadow-md disabled:opacity-50"
      >
        <FolderOpen className="w-4 h-4 text-black fill-current" />
        <span>{isLoading ? 'Opening Picker...' : 'Choose Folder'}</span>
      </button>

      <div className="mt-12 flex items-center space-x-6 text-[11px] opacity-40">
        <div className="flex items-center space-x-1.5">
          <Music className="w-3.5 h-3.5" />
          <span>FLAC • MP3 • WAV</span>
        </div>
        <div className="w-1 h-1 rounded-none bg-current opacity-30" />
        <div className="flex items-center space-x-1.5">
          <Film className="w-3.5 h-3.5" />
          <span>MP4 Video Player</span>
        </div>
      </div>
    </div>
  );
};

export const EmptyState = React.memo(EmptyStateComponent);
