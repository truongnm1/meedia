import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  MediaItem,
  RepeatMode,
} from '../types/media';
import {
  RotateCcw,
  RotateCw,
  Shuffle,
  Repeat,
  Repeat1,
  Music,
  Play,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { SoundWave } from './SoundWave';
import { getAudioFrequencyData } from '../utils/audioAnalyzer';

interface DedicatedPlayerProps {
  currentTrack: MediaItem | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: RepeatMode;
  onCycleRepeat: () => void;
  coverArt?: string | null;
  videoSrc?: string;
  onOpenTagDetails: () => void;
  theme: 'dark' | 'light';
  onVideoTimeUpdate?: (time: number) => void;
  onVideoLoadedMetadata?: (duration: number) => void;
  onVideoEnded?: () => void;
  onVideoError?: () => void;
}

interface MarqueeTextProps {
  text: string;
  className?: string;
  speed?: number; // pixels per second
}

const MarqueeTextComponent: React.FC<MarqueeTextProps> = ({
  text,
  className = '',
  speed = 28,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [textWidth, setTextWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const checkOverflow = () => {
      const w = measure.offsetWidth;
      setTextWidth(w);
      setIsOverflowing(w > container.clientWidth + 2);
    };

    checkOverflow();

    const ro = new ResizeObserver(checkOverflow);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text]);

  const gap = 48; // 48px gap for clean separation between repetitions
  const duration = textWidth > 0 ? (textWidth + gap) / speed : 12;

  return (
    <div ref={containerRef} className="w-full overflow-hidden relative" title={text}>
      {/* Hidden offscreen measurement probe to always get 100% accurate text width */}
      <span
        ref={measureRef}
        className={`absolute left-0 top-0 opacity-0 pointer-events-none whitespace-nowrap -z-50 invisible ${className}`}
        aria-hidden="true"
      >
        {text}
      </span>

      {!isOverflowing ? (
        <div className="w-full flex justify-center text-center">
          <span className={`truncate block max-w-full ${className}`}>
            {text}
          </span>
        </div>
      ) : (
        <div
          className="w-full overflow-hidden"
          style={{
            maskImage:
              'linear-gradient(to right, transparent 0%, black 14px, black calc(100% - 14px), transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, black 14px, black calc(100% - 14px), transparent 100%)',
          }}
        >
          <div
            key={text}
            className="flex w-max whitespace-nowrap will-change-transform marquee-track"
            style={{
              animation: `meediaMarquee ${duration}s linear infinite`,
            }}
          >
            <span className={`pr-12 shrink-0 ${className}`}>{text}</span>
            <span className={`pr-12 shrink-0 ${className}`}>{text}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const MarqueeText = React.memo(MarqueeTextComponent);

const formatSeconds = (secs: number) => {
  if (isNaN(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const DedicatedPlayer: React.FC<DedicatedPlayerProps> = ({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
  isShuffle,
  onToggleShuffle,
  repeatMode,
  onCycleRepeat,
  coverArt,
  videoSrc,
  onOpenTagDetails,
  theme,
  onVideoTimeUpdate,
  onVideoLoadedMetadata,
  onVideoEnded,
  onVideoError,
}) => {
  const isDark = theme === 'dark';
  const isVideo = currentTrack?.media_type === 'video' && Boolean(videoSrc);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHoveringFsSeeker, setIsHoveringFsSeeker] = useState(false);
  const [isFsControlsVisible, setIsFsControlsVisible] = useState(true);
  const fsIdleTimeoutRef = useRef<number | null>(null);

  // Props refs to guarantee fresh values in keyboard handler without re-attaching listeners
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const prevVolumeRef = useRef<number>(volume > 0 ? volume : 0.5);
  if (volume > 0) {
    prevVolumeRef.current = volume;
  }
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const onTogglePlayRef = useRef(onTogglePlay);
  onTogglePlayRef.current = onTogglePlay;
  const onVolumeChangeRef = useRef(onVolumeChange);
  onVolumeChangeRef.current = onVolumeChange;
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const onPrevRef = useRef(onPrev);
  onPrevRef.current = onPrev;

  const resetFsIdleTimer = useCallback(() => {
    setIsFsControlsVisible(true);
    if (fsIdleTimeoutRef.current !== null) {
      window.clearTimeout(fsIdleTimeoutRef.current);
    }
    if (isPlayingRef.current) {
      fsIdleTimeoutRef.current = window.setTimeout(() => {
        setIsFsControlsVisible(false);
      }, 2500);
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      setIsFsControlsVisible(true);
      if (fsIdleTimeoutRef.current !== null) {
        window.clearTimeout(fsIdleTimeoutRef.current);
      }
    } else if (isFullscreen) {
      resetFsIdleTimer();
    }
    return () => {
      if (fsIdleTimeoutRef.current !== null) {
        window.clearTimeout(fsIdleTimeoutRef.current);
      }
    };
  }, [isPlaying, isFullscreen, resetFsIdleTimer]);

  const lastVideoTimeUpdateRef = useRef<number>(0);

  // Sync video play/pause with player state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [isPlaying, isVideo, videoSrc]);

  // Sync volume with video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    video.volume = volume;
  }, [volume, isVideo]);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
          videoContainerRef.current?.focus();
        })
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  }, []);

  const volumeBarRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  // Hotkey Seeking Tooltip state (displays time badge directly on the seeker)
  const [isHotkeySeeking, setIsHotkeySeeking] = useState(false);
  const seekTooltipTimeoutRef = useRef<number | null>(null);
  const scrubClearTimeoutRef = useRef<number | null>(null);

  const triggerSeekTooltip = useCallback(() => {
    setIsHotkeySeeking(true);
    if (seekTooltipTimeoutRef.current !== null) {
      window.clearTimeout(seekTooltipTimeoutRef.current);
    }
    seekTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsHotkeySeeking(false);
    }, 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (seekTooltipTimeoutRef.current !== null) {
        window.clearTimeout(seekTooltipTimeoutRef.current);
      }
      if (scrubClearTimeoutRef.current !== null) {
        window.clearTimeout(scrubClearTimeoutRef.current);
      }
    };
  }, []);

  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const fsProgressBarRef = useRef<HTMLDivElement | null>(null);
  const activeProgressBarRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);

  const updateSeekFromX = (clientX: number) => {
    const bar = activeProgressBarRef.current || progressBarRef.current;
    if (!bar || duration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const rawX = clientX - rect.left;

    // Strictly clamp seeking inside the progress bar (0 <= targetTime <= duration)
    const fraction = Math.max(0, Math.min(1, rawX / rect.width));
    const targetTime = fraction * duration;
    setScrubTime(targetTime);
    if (isVideo && videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
    onSeek(targetTime);
  };

  const seekRelative = useCallback((deltaSeconds: number) => {
    const video = videoRef.current;
    const dur = durationRef.current || 0;
    const current = video ? video.currentTime : (scrubTime !== null ? scrubTime : currentTimeRef.current);
    const target = Math.max(0, Math.min(dur, current + deltaSeconds));
    if (video) {
      video.currentTime = target;
    }
    setScrubTime(target);
    if (scrubClearTimeoutRef.current !== null) {
      window.clearTimeout(scrubClearTimeoutRef.current);
    }
    scrubClearTimeoutRef.current = window.setTimeout(() => {
      setScrubTime(null);
    }, 300);

    onSeekRef.current?.(target);
    resetFsIdleTimer();
    triggerSeekTooltip();
  }, [resetFsIdleTimer, triggerSeekTooltip, scrubTime]);

  const seekToFraction = useCallback((fraction: number) => {
    const dur = durationRef.current || 0;
    if (dur <= 0) return;
    const target = Math.max(0, Math.min(dur, fraction * dur));
    if (videoRef.current) {
      videoRef.current.currentTime = target;
    }
    setScrubTime(target);
    if (scrubClearTimeoutRef.current !== null) {
      window.clearTimeout(scrubClearTimeoutRef.current);
    }
    scrubClearTimeoutRef.current = window.setTimeout(() => {
      setScrubTime(null);
    }, 300);

    onSeekRef.current?.(target);
    resetFsIdleTimer();
    triggerSeekTooltip();
  }, [resetFsIdleTimer, triggerSeekTooltip]);

  const changeVolume = useCallback((delta: number) => {
    const nextVol = Math.max(0, Math.min(1, Math.round((volumeRef.current + delta) * 100) / 100));
    if (videoRef.current) {
      videoRef.current.volume = nextVol;
    }
    onVolumeChangeRef.current?.(nextVol);
    resetFsIdleTimer();
  }, [resetFsIdleTimer]);

  const toggleMute = useCallback(() => {
    if (volumeRef.current > 0) {
      prevVolumeRef.current = volumeRef.current;
      if (videoRef.current) videoRef.current.volume = 0;
      onVolumeChangeRef.current?.(0);
      resetFsIdleTimer();
    } else {
      const restoreVol = prevVolumeRef.current > 0 ? prevVolumeRef.current : 0.5;
      if (videoRef.current) videoRef.current.volume = restoreVol;
      onVolumeChangeRef.current?.(restoreVol);
      resetFsIdleTimer();
    }
  }, [resetFsIdleTimer]);

  const togglePlay = useCallback(() => {
    onTogglePlayRef.current?.();
    resetFsIdleTimer();
  }, [resetFsIdleTimer]);

  // Intercept hotkeys in fullscreen mode (Left/Right Arrow, J/L, Up/Down, Space, M, F/F11, 0-9)
  useEffect(() => {
    const handleFsKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (!isFullscreen && !document.fullscreenElement) {
        return;
      }

      let handled = true;

      switch (e.code) {
        case 'ArrowRight': {
          const step = e.ctrlKey ? 30 : e.shiftKey ? 10 : 5;
          seekRelative(step);
          break;
        }
        case 'ArrowLeft': {
          const step = e.ctrlKey ? 30 : e.shiftKey ? 10 : 5;
          seekRelative(-step);
          break;
        }
        case 'KeyL':
          seekRelative(10);
          break;
        case 'KeyJ':
          seekRelative(-10);
          break;
        case 'ArrowUp':
          changeVolume(0.05);
          break;
        case 'ArrowDown':
          changeVolume(-0.05);
          break;
        case 'Space':
        case 'KeyK':
          togglePlay();
          break;
        case 'KeyM':
          toggleMute();
          break;
        case 'KeyF':
        case 'F11':
          handleToggleFullscreen();
          break;
        case 'Home':
          seekToFraction(0);
          break;
        case 'End':
          seekToFraction(1);
          break;
        case 'Digit0': case 'Numpad0': seekToFraction(0); break;
        case 'Digit1': case 'Numpad1': seekToFraction(0.1); break;
        case 'Digit2': case 'Numpad2': seekToFraction(0.2); break;
        case 'Digit3': case 'Numpad3': seekToFraction(0.3); break;
        case 'Digit4': case 'Numpad4': seekToFraction(0.4); break;
        case 'Digit5': case 'Numpad5': seekToFraction(0.5); break;
        case 'Digit6': case 'Numpad6': seekToFraction(0.6); break;
        case 'Digit7': case 'Numpad7': seekToFraction(0.7); break;
        case 'Digit8': case 'Numpad8': seekToFraction(0.8); break;
        case 'Digit9': case 'Numpad9': seekToFraction(0.9); break;
        case 'KeyN':
          onNextRef.current?.();
          resetFsIdleTimer();
          break;
        case 'KeyP':
          onPrevRef.current?.();
          resetFsIdleTimer();
          break;
        default:
          handled = false;
          break;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleFsKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleFsKeyDown, { capture: true });
  }, [isFullscreen, seekRelative, seekToFraction, changeVolume, toggleMute, togglePlay, handleToggleFullscreen, resetFsIdleTimer]);

  const handleSeekPointerDown = (e: React.PointerEvent) => {
    if (!currentTrack || duration <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    activeProgressBarRef.current = e.currentTarget as HTMLDivElement;
    setIsDraggingSeek(true);
    updateSeekFromX(e.clientX);
  };

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (isDraggingSeek) {
        updateSeekFromX(e.clientX);
      }
    };
    const onPointerUp = () => {
      if (isDraggingSeek) {
        setIsDraggingSeek(false);
        setScrubTime(null);
        activeProgressBarRef.current = null;
      }
    };
    if (isDraggingSeek) {
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [isDraggingSeek, duration, isVideo]);

  const updateVolumeFromY = (clientY: number) => {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    // 3px inset padding tolerance so clicks inside the top/bottom borders naturally reach 100% and 0%
    const padding = 3;
    const availableHeight = rect.height - padding * 2;
    const rawFraction = (rect.bottom - padding - clientY) / availableHeight;
    const clamped = Math.max(0, Math.min(1, rawFraction));
    const finalVol = clamped >= 0.98 ? 1.0 : clamped <= 0.02 ? 0.0 : clamped;
    onVolumeChange(finalVol);
  };

  const handleVolumeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingVolume(true);
    updateVolumeFromY(e.clientY);
  };

  const handleVolumeWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const step = 0.05;
    const delta = e.deltaY < 0 ? step : -step;
    const nextVol = Math.max(0, Math.min(1, Math.round((volume + delta) * 100) / 100));
    const finalVol = nextVol >= 0.98 ? 1.0 : nextVol <= 0.02 ? 0.0 : nextVol;
    onVolumeChange(finalVol);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingVolume) {
        updateVolumeFromY(e.clientY);
      }
    };
    const onMouseUp = () => {
      if (isDraggingVolume) {
        setIsDraggingVolume(false);
      }
    };
    if (isDraggingVolume) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingVolume]);

  const effectiveTime = scrubTime !== null ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? (effectiveTime / duration) * 100 : 0;
  const showFsControls = !isFullscreen || !isPlaying || isDraggingSeek || isFsControlsVisible;

  const handleSkipBackward = () => {
    const target = Math.max(0, currentTime - 10);
    if (isVideo && videoRef.current) {
      videoRef.current.currentTime = target;
    }
    onSeek(target);
  };

  const handleSkipForward = () => {
    const target = Math.min(duration, currentTime + 10);
    if (isVideo && videoRef.current) {
      videoRef.current.currentTime = target;
    }
    onSeek(target);
  };

  // Audio-reactive speaker cone punch (listening to SNARE and CLAP only)
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!coverArt || isVideo) return;

    let animId: number;
    let lastTime = performance.now();

    const BASE_SCALE = 1.15;
    let currentScale = BASE_SCALE;
    let punchImpulse = 0;
    let runningSnare = 0;

    const updateMotion = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      let snareEnergy = 0;

      if (isPlaying) {
        const freqData = getAudioFrequencyData();
        if (freqData && freqData.length > 0) {
          // SNARE & CLAP BAND: Snare body snap, clap crack, and rimshot transient (~1.2kHz to ~4.8kHz, bins 55..220)
          let snareSum = 0;
          const snareStart = Math.min(55, freqData.length);
          const snareEnd = Math.min(220, freqData.length);
          if (snareEnd > snareStart) {
            for (let i = snareStart; i < snareEnd; i++) {
              snareSum += freqData[i];
            }
            snareEnergy = snareSum / ((snareEnd - snareStart) * 255);
          }
        }
      }

      if (isPlaying) {
        // Detect transient onset spikes in SNARE / CLAP (ignoring smooth sustained sounds)
        const snareDelta = snareEnergy - runningSnare;
        runningSnare = runningSnare * 0.70 + snareEnergy * 0.30;

        // Snare / Clap punch: sharp, authoritative excursion on drum hits
        if (snareDelta > 0.028 && snareEnergy > 0.18) {
          const hitPunch = Math.min(0.20, snareDelta * 2.2 + (snareEnergy - 0.18) * 0.14);
          punchImpulse = Math.min(0.24, punchImpulse + hitPunch);
        }

        // Elastic recoil decay (simulates speaker suspension returning cleanly to rest)
        punchImpulse *= 0.78;

        // The speaker ONLY moves when punchImpulse > 0; otherwise it rests peacefully at BASE_SCALE
        const targetScale = BASE_SCALE + punchImpulse;

        // Fast spring interpolation towards target
        const lerpSpeed = Math.min(1, dt * 20);
        currentScale += (targetScale - currentScale) * lerpSpeed;
      } else {
        // When paused / stopped: immediately relax back to BASE_SCALE
        currentScale += (BASE_SCALE - currentScale) * 0.15;
        punchImpulse = 0;
        runningSnare = 0;
      }

      // Direct GPU transform update (centered zoom in/out only)
      if (bgImageRef.current) {
        bgImageRef.current.style.transform = `scale(${currentScale.toFixed(4)})`;
      }

      animId = requestAnimationFrame(updateMotion);
    };

    animId = requestAnimationFrame(updateMotion);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [coverArt, isVideo, isPlaying, currentTrack?.path]);

  return (
    <main
      className={`w-[500px] h-full flex flex-col justify-between select-none shrink-0 overflow-visible relative z-30 transition-colors ${
        isVideo
          ? isDark
            ? 'bg-black text-white'
            : 'bg-white text-slate-900'
          : isDark
          ? 'bg-[#161616] text-white'
          : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Blurry Album Art Background for Audio Player Panel (Excludes Control Deck) */}
      <div className="absolute inset-x-0 top-0 bottom-[108px] overflow-hidden pointer-events-none z-0">
        {coverArt && !isVideo ? (
          <>
            <img
              ref={bgImageRef}
              src={coverArt}
              alt=""
              className="w-full h-full object-cover blur-[20px] opacity-50 dark:opacity-40 transition-opacity duration-700 select-none pointer-events-none"
              style={{
                willChange: 'transform',
                transform: 'scale(1.15)',
              }}
            />
            <div
              className={`absolute inset-0 ${
                isDark ? 'bg-black/45' : 'bg-white/45'
              }`}
            />
          </>
        ) : null}
      </div>

      {/* 1. Main Media Area: Full Player Panel Video for MP4 OR Artwork + Title for Audio */}
      {isVideo ? (
        /* Full Player Panel Video View: Slowly and smoothly transforms to video resolution */
        <div
          ref={videoContainerRef}
          data-video-container="true"
          tabIndex={0}
          className={`w-full flex-1 flex items-center justify-center relative overflow-hidden select-none outline-none focus:outline-none ${
            isFullscreen && !showFsControls ? 'hide-cursor cursor-none' : ''
          }`}
          onMouseMove={resetFsIdleTimer}
          onMouseEnter={resetFsIdleTimer}
          onMouseLeave={() => {
            if (isPlaying && isFullscreen) {
              setIsFsControlsVisible(false);
            }
          }}
        >
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay={isPlaying}
            preload="auto"
            playsInline
            className={`w-full h-full object-contain ${
              isFullscreen && !showFsControls ? 'cursor-none' : 'cursor-pointer'
            }`}
            onClick={onTogglePlay}
            onDoubleClick={handleToggleFullscreen}
            onTimeUpdate={(e) => {
              const now = performance.now();
              if (now - lastVideoTimeUpdateRef.current >= 200) {
                lastVideoTimeUpdateRef.current = now;
                onVideoTimeUpdate?.(e.currentTarget.currentTime);
              }
            }}
            onLoadedMetadata={(e) => {
              onVideoLoadedMetadata?.(e.currentTarget.duration);
              if (e.currentTarget.videoWidth && e.currentTarget.videoHeight) {
                setVideoResolution({
                  width: e.currentTarget.videoWidth,
                  height: e.currentTarget.videoHeight,
                });
              }
            }}
            onEnded={() => onVideoEnded?.()}
            onError={(e) => {
              if (videoSrc && e.currentTarget.error) {
                onVideoError?.();
              }
            }}
          />

          {/* Video Header Overlay (Title, Resolution, Fullscreen) on Hover / Active */}
          <div
            className={`absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between z-20 transition-opacity duration-300 pointer-events-none ${
              showFsControls ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="flex items-center space-x-2 min-w-0 pr-2">
              <span className="text-xs font-medium text-white truncate drop-shadow-md">
                {currentTrack?.title}
              </span>
              {videoResolution && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-black/65 text-white/90 rounded-none shrink-0 border border-white/10">
                  {videoResolution.height >= 2160
                    ? '4K'
                    : videoResolution.height >= 1440
                    ? '2K'
                    : videoResolution.height >= 1080
                    ? '1080p'
                    : videoResolution.height >= 720
                    ? '720p'
                    : `${videoResolution.width}×${videoResolution.height}`}
                </span>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggleFullscreen();
              }}
              className="p-1.5 rounded-none text-white/80 hover:text-white transition-all pointer-events-auto active:scale-95"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Center Play Indicator on Pause */}
          {!isPlaying && (
            <div
              onClick={onTogglePlay}
              className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer z-10 transition-opacity"
            >
              <div className="w-14 h-14 rounded-none bg-black/70 border border-white/20 flex items-center justify-center text-white shadow-2xl hover:scale-110 active:scale-95 transition-all">
                <Play className="w-6 h-6 fill-white ml-1" />
              </div>
            </div>
          )}

          {/* Fullscreen Bottom Progress Bar: Same thin brutalist style, auto-hides when idle */}
          {isFullscreen && (
            <div
              ref={fsProgressBarRef}
              onPointerDown={handleSeekPointerDown}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setIsHoveringFsSeeker(true)}
              onMouseLeave={() => setIsHoveringFsSeeker(false)}
              className={`absolute bottom-0 inset-x-0 h-[3px] hover:h-[5px] bg-white/20 transition-all duration-300 cursor-pointer group/fspb z-30 ${
                showFsControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              {/* Generous invisible hit-area across entire width */}
              <div className="absolute -top-3.5 bottom-0 inset-x-0 cursor-pointer z-10" />

              {/* Played portion */}
              <div
                className={`h-full ${
                  isDraggingSeek ? '' : 'transition-all duration-75'
                } bg-[#facc15]`}
                style={{ width: `${progressPercent}%` }}
              />

              {/* Tracker Button + Hover Time Indicator */}
              {currentTrack && (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center z-40 ${
                    isDraggingSeek ? '' : 'transition-all duration-75'
                  }`}
                  style={{
                    left: `clamp(9px, ${progressPercent}%, calc(100% - 9px))`,
                  }}
                >
                  {/* Floating timestamp: strictly limited to seeker hover, dragging, or hotkey seeking */}
                  <div
                    className={`absolute bottom-3 ${
                      progressPercent < 5
                        ? 'left-0'
                        : progressPercent > 95
                        ? 'right-0'
                        : 'left-1/2 -translate-x-1/2'
                    } ${
                      isDraggingSeek || isHoveringFsSeeker || isHotkeySeeking
                        ? 'opacity-100'
                        : 'opacity-0'
                    } transition-opacity duration-150 pointer-events-none select-none z-50`}
                  >
                    <span className="px-1.5 py-0.5 text-[10px] font-mono bg-black text-[#facc15] border border-white/25 shadow-lg whitespace-nowrap block">
                      {formatSeconds(effectiveTime)} / {formatSeconds(duration)}
                    </span>
                  </div>

                  {/* Horizontal wide rectangle tracker button */}
                  <div
                    className={`w-[18px] h-[6px] rounded-none bg-[#facc15] transition-opacity`}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Audio View: Picture, Song Name in Bold, Artist Name (Layered in front of visualizer at z-20) */
        <div className="flex-1 flex flex-col items-center justify-center pt-5 pb-2 px-6 overflow-visible relative z-20 pointer-events-none transition-all duration-500">
          {/* Media Artwork Square */}
          <div
            className={`w-[180px] h-[180px] rounded-none flex items-center justify-center overflow-hidden relative shrink-0 shadow-lg pointer-events-auto ${
              isDark ? 'bg-[#202020]' : 'bg-white'
            }`}
          >
            {coverArt ? (
              <img
                src={coverArt}
                alt="Album Cover"
                className="w-full h-full object-cover rounded-none"
              />
            ) : (
              <div className="flex flex-col items-center justify-center space-y-2 opacity-30">
                <Music className="w-14 h-14" />
                <span className="text-[10px] font-mono uppercase tracking-widest">
                  {currentTrack ? currentTrack.extension : 'MEEDIA'}
                </span>
              </div>
            )}
          </div>

          {/* Song Name in Bold & Artist Name with Smooth Marquee for Long Titles */}
          <div className="text-center w-full px-4 min-w-0 mt-3 flex flex-col items-center pointer-events-auto">
            <div className="w-full">
              <MarqueeText
                text={currentTrack?.title || 'No Track Selected'}
                className={`text-base font-semibold tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              />
            </div>
            <div className="w-full mt-0.5">
              <MarqueeText
                text={currentTrack?.artist || (currentTrack ? 'Unknown Artist' : 'Select a track to start playback')}
                className="text-xs font-light tracking-wide opacity-75"
                speed={24}
              />
            </div>
          </div>
        </div>
      )}

      {/* 2. Visualizer: Full-width (500px), audio tracks only (omitted for MP4) */}
      {!isVideo && (
        <div className="w-full shrink-0 relative z-10 transition-all duration-500 overflow-visible">
          <SoundWave
            isPlaying={isPlaying}
            trackId={currentTrack?.path}
            width={500}
            height={105}
            color={isDark ? '#facc15' : '#ca8a04'}
            className="w-full block"
          />
        </div>
      )}

      {/* 3. Progress Bar: Thinner (h-[3px]), full width, tracker button with hover timestamp, zero space to control deck */}
      <div
        ref={progressBarRef}
        onPointerDown={handleSeekPointerDown}
        className={`w-full h-[3px] relative cursor-pointer group shrink-0 z-30 ${
          isDark ? 'bg-white/15' : 'bg-slate-300'
        }`}
      >
        {/* Generous invisible hit-area for easy clicking/dragging across entire width */}
        <div className="absolute -top-3 -bottom-3 inset-x-0 cursor-pointer z-10" />

        {/* Played portion */}
        <div
          className={`h-full ${
            isDraggingSeek ? '' : 'transition-all duration-75'
          } ${isDark ? 'bg-[#facc15]' : 'bg-[#eab308]'}`}
          style={{ width: `${progressPercent}%` }}
        />

        {/* Tracker Button + Hover Time Indicator */}
        {currentTrack && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center z-40 ${
              isDraggingSeek ? '' : 'transition-all duration-75'
            }`}
            style={{
              left: `clamp(9px, ${progressPercent}%, calc(100% - 9px))`,
            }}
          >
            {/* Floating timestamp: strictly limited inside player panel */}
            <div
              className={`absolute bottom-2.5 ${
                progressPercent < 5
                  ? 'left-0'
                  : progressPercent > 95
                  ? 'right-0'
                  : 'left-1/2 -translate-x-1/2'
              } ${
                isDraggingSeek || scrubTime !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              } transition-opacity pointer-events-none select-none z-50`}
            >
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono border shadow-lg whitespace-nowrap block ${
                  isDark
                    ? 'bg-black text-[#facc15] border-white/25'
                    : 'bg-white text-[#ca8a04] border-slate-300 shadow-md'
                }`}
              >
                {formatSeconds(effectiveTime)}
              </span>
            </div>

            {/* Horizontal wide rectangle tracker button: strictly limited inside player panel */}
            <div
              className={`w-[18px] h-[6px] rounded-none group-hover:scale-105 transition-transform ${
                isDark ? 'bg-[#facc15]' : 'bg-[#eab308]'
              }`}
            />
          </div>
        )}
      </div>

      {/* 4. Single Combined Control Deck matching wireframe drawing */}
      <div
        className={`w-full h-[108px] flex items-center justify-between shrink-0 relative z-20 transition-colors ${
          isDark
            ? 'bg-black text-white'
            : 'bg-white text-slate-900 border-t border-slate-200 shadow-sm'
        }`}
      >
        {/* Left: Vertical Strip with border-r for Shuffle, Repeat, Info */}
        <div
          className={`w-11 h-full flex flex-col justify-between items-center py-2.5 shrink-0 border-r ${
            isDark ? 'border-white/20' : 'border-slate-200'
          }`}
        >
          {/* Top: Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={`p-1.5 transition-colors ${
              isShuffle
                ? isDark
                  ? 'text-[#facc15]'
                  : 'text-[#ca8a04]'
                : isDark
                ? 'text-white/60 hover:text-white'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            title={isShuffle ? 'Shuffle: on' : 'Shuffle: off'}
            aria-label={isShuffle ? 'Shuffle: on' : 'Shuffle: off'}
          >
            <Shuffle className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Middle: Repeat */}
          <button
            onClick={onCycleRepeat}
            className={`p-1.5 transition-colors ${
              repeatMode !== 'off'
                ? isDark
                  ? 'text-[#facc15]'
                  : 'text-[#ca8a04]'
                : isDark
                ? 'text-white/60 hover:text-white'
                : 'text-slate-500 hover:text-slate-900'
            }`}
            title={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-5 h-5 stroke-[2]" />
            ) : (
              <Repeat className="w-5 h-5 stroke-[2]" />
            )}
          </button>

          {/* Bottom: Info button - clean handwritten 'i' matching sketch */}
          <button
            onClick={onOpenTagDetails}
            disabled={!currentTrack}
            className={`p-1.5 flex flex-col items-center justify-center transition-colors ${
              isDark
                ? 'text-white/60 hover:text-white'
                : 'text-slate-500 hover:text-slate-900'
            } disabled:opacity-20`}
            title="Track details"
          >
            <div className="flex flex-col items-center justify-center w-5 h-5">
              <span className="w-1 h-1 bg-current mb-0.5" />
              <span className="w-1 h-3 bg-current" />
            </div>
          </button>
        </div>

        {/* Center: [↺10] [|<] [► / ||] [>|] [↻10] */}
        <div className="flex-1 h-full flex items-center justify-evenly px-3">
          {/* Skip -10s with '10' inside arrow loop (smaller) */}
          <button
            onClick={handleSkipBackward}
            disabled={!currentTrack}
            className={`w-8 h-8 shrink-0 relative flex items-center justify-center transition-colors ${
              isDark
                ? 'text-white/80 hover:text-white'
                : 'text-slate-600 hover:text-slate-950'
            } disabled:opacity-30`}
            title="Rewind 10s"
          >
            <RotateCcw className="w-5 h-5 stroke-[1.75]" />
            <span className="absolute text-[7px] font-mono font-bold tracking-tight">10</span>
          </button>

          {/* Prev Track [|<] outline style */}
          <button
            onClick={onPrev}
            disabled={!currentTrack}
            className={`w-11 h-11 shrink-0 flex items-center justify-center transition-colors ${
              isDark
                ? 'text-white/90 hover:text-white'
                : 'text-slate-800 hover:text-slate-950'
            } disabled:opacity-30`}
            title="Previous"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 stroke-current fill-none"
              strokeWidth="2"
              strokeLinecap="square"
              strokeLinejoin="miter"
            >
              <line x1="6" y1="4" x2="6" y2="20" />
              <polygon points="18,4 7,12 18,20" />
            </svg>
          </button>

          {/* HUGE Bold Play/Pause Button matching wireframe drawing */}
          <button
            onClick={onTogglePlay}
            disabled={!currentTrack}
            className={`w-20 h-20 shrink-0 flex items-center justify-center transition-colors ${
              isDark
                ? 'text-white hover:text-[#facc15]'
                : 'text-slate-900 hover:text-[#eab308]'
            } disabled:opacity-30 active:scale-95`}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <div className="flex space-x-2.5 items-center justify-center">
                <div className="w-3.5 h-12 bg-current" />
                <div className="w-3.5 h-12 bg-current" />
              </div>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="w-12 h-12 ml-1 fill-current stroke-current"
                strokeWidth="1"
                strokeLinejoin="miter"
              >
                <polygon points="4,2 22,12 4,22" />
              </svg>
            )}
          </button>

          {/* Next Track [>|] outline style */}
          <button
            onClick={onNext}
            disabled={!currentTrack}
            className={`w-11 h-11 shrink-0 flex items-center justify-center transition-colors ${
              isDark
                ? 'text-white/90 hover:text-white'
                : 'text-slate-800 hover:text-slate-950'
            } disabled:opacity-30`}
            title="Next"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 stroke-current fill-none"
              strokeWidth="2"
              strokeLinecap="square"
              strokeLinejoin="miter"
            >
              <polygon points="6,4 17,12 6,20" />
              <line x1="18" y1="4" x2="18" y2="20" />
            </svg>
          </button>

          {/* Skip +10s with '10' inside arrow loop (smaller) */}
          <button
            onClick={handleSkipForward}
            disabled={!currentTrack}
            className={`w-8 h-8 shrink-0 relative flex items-center justify-center transition-colors ${
              isDark
                ? 'text-white/80 hover:text-white'
                : 'text-slate-600 hover:text-slate-950'
            } disabled:opacity-30`}
            title="Forward 10s"
          >
            <RotateCw className="w-5 h-5 stroke-[1.75]" />
            <span className="absolute text-[7px] font-mono font-bold tracking-tight">10</span>
          </button>
        </div>

        {/* Right: Vertical Volume Bar (no speaker icon, adjustable by drag or mouse wheel) */}
        <div
          onMouseDown={handleVolumeMouseDown}
          onWheel={handleVolumeWheel}
          className="w-14 h-full flex items-center justify-center shrink-0 pr-2 cursor-ns-resize"
          title={`Volume: ${Math.round(volume * 100)}%`}
        >
          <div
            ref={volumeBarRef}
            className={`w-3.5 h-[76px] relative select-none border overflow-hidden transition-colors ${
              isDark
                ? 'border-white/60 bg-[#161616]'
                : 'border-slate-400 bg-slate-100 shadow-inner'
            }`}
          >
            {/* Fill from bottom: Sophisticated RGB Spectrum (fixed in both themes) */}
            <div
              className="absolute bottom-0 inset-x-0 pointer-events-none transition-all duration-75 overflow-hidden"
              style={{
                height: volume >= 0.98 ? '100%' : `${Math.max(0, Math.round(volume * 100))}%`,
              }}
            >
              {/* Full-height uncompressed fixed spectrum anchored to the bottom */}
              <div
                className="absolute bottom-0 inset-x-0 w-full h-[74px] min-h-full pointer-events-none"
                style={{
                  background:
                    'linear-gradient(to top, #4f46e5 0%, #06b6d4 30%, #10b981 60%, #eab308 85%, #f43f5e 100%)',
                  backgroundRepeat: 'no-repeat',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
