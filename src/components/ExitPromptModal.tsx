import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ExitPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExitToTray: () => void;
  onExitApp: () => void;
  theme: 'dark' | 'light';
}

export const ExitPromptModal: React.FC<ExitPromptModalProps> = ({
  isOpen,
  onClose,
  onExitToTray,
  onExitApp,
  theme,
}) => {
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onExitToTray();
      }
    };

    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, [isOpen, onClose, onExitToTray]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none animate-in fade-in duration-100">
      <div
        className={`w-[320px] rounded-none shadow-2xl flex flex-col overflow-hidden border ${
          isDark
            ? 'bg-[#181818] border-white/15 text-white'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b ${
            isDark ? 'bg-[#141414] border-white/[0.08]' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            <span
              className={`w-1.5 h-1.5 rounded-none ${
                isDark ? 'bg-[#facc15]' : 'bg-[#ca8a04]'
              }`}
            />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Close MEEDIA
            </span>
          </div>
          <button
            onClick={onClose}
            className={`p-0.5 transition-colors ${
              isDark ? 'text-white/40 hover:text-white' : 'text-slate-400 hover:text-slate-800'
            }`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3.5">
          <p className="text-xs opacity-70">
            Exit or minimize to system tray?
          </p>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              onClick={onClose}
              className={`px-2.5 py-1 text-xs transition-colors ${
                isDark ? 'text-white/50 hover:text-white' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={onExitApp}
              className={`px-3 py-1 text-xs font-bold transition-all active:scale-95 ${
                isDark
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              Exit
            </button>
            <button
              onClick={onExitToTray}
              className={`px-3 py-1 text-xs font-bold transition-all active:scale-95 ${
                isDark
                  ? 'bg-[#facc15] hover:bg-[#eab308] text-black'
                  : 'bg-[#ca8a04] hover:bg-[#a16207] text-white'
              }`}
            >
              Exit to Tray
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
