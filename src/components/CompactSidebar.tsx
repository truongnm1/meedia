import React from 'react';
import {
  FolderOpen,
  Home,
  Layers,
  Sun,
  Moon,
} from 'lucide-react';

interface CompactSidebarProps {
  currentPath: string;
  rootPath: string;
  onSelectRootFolder: () => void;
  onNavigateHome: () => void;
  onNavigateAllTracks?: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

const CompactSidebarComponent: React.FC<CompactSidebarProps> = ({
  currentPath,
  rootPath,
  onSelectRootFolder,
  onNavigateHome,
  onNavigateAllTracks,
  theme,
  onToggleTheme,
}) => {
  const isAtRoot = currentPath === rootPath;
  const isAllTracks = currentPath === '__ALL_TRACKS__';
  const isDark = theme === 'dark';

  return (
    <aside
      className={`w-12 h-full flex flex-col justify-between items-center py-3.5 select-none shrink-0 border-r transition-colors ${
        isDark
          ? 'bg-[#0c0c0c] border-white/[0.08] text-white'
          : 'bg-slate-100 border-slate-200 text-slate-800'
      }`}
    >
      {/* Top Navigation Icons */}
      <div className="flex flex-col items-center space-y-3 w-full">
        {/* Root Folder Icon */}
        <button
          onClick={onNavigateHome}
          className={`w-8 h-8 rounded-none flex items-center justify-center transition-all active:scale-95 ${
            isAtRoot
              ? 'bg-[#facc15] text-black shadow-sm'
              : isDark
              ? 'text-white/60 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Home"
        >
          <Home className="w-4 h-4" />
        </button>

        {/* All Tracks Icon */}
        <button
          onClick={onNavigateAllTracks}
          className={`w-8 h-8 rounded-none flex items-center justify-center transition-all active:scale-95 ${
            isAllTracks
              ? 'bg-[#facc15] text-black shadow-sm'
              : isDark
              ? 'text-white/60 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="All Tracks"
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* Change Folder Icon */}
        <button
          onClick={onSelectRootFolder}
          className={`w-8 h-8 rounded-none flex items-center justify-center transition-all active:scale-95 ${
            isDark
              ? 'text-white/60 hover:text-[#facc15]'
              : 'text-slate-600 hover:text-[#eab308]'
          }`}
          title="Open folder"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom: Theme Toggle Icon Only */}
      <div className="flex flex-col items-center space-y-2 w-full">
        <button
          onClick={onToggleTheme}
          className={`w-8 h-8 rounded-none flex items-center justify-center transition-all active:scale-95 ${
            isDark
              ? 'text-[#facc15] hover:opacity-80'
              : 'text-[#eab308] hover:opacity-80'
          }`}
          title={isDark ? 'Light theme' : 'Dark theme'}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
};

export const CompactSidebar = React.memo(CompactSidebarComponent);
