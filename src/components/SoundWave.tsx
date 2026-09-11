import React, { useEffect, useRef, useState } from 'react';
import AudioMotionAnalyzer from 'audiomotion-analyzer';
import {
  onAudioSourceReady,
  resumeAudioContext,
  getSourceNode,
  getAudioContext,
} from '../utils/audioAnalyzer';

export type VisualizerLook = 'bars' | 'leds' | 'wave';
export type VisualizerMode = VisualizerLook | 'spectrum' | 'classic';

const NEXT_LOOK: Record<VisualizerMode, VisualizerMode> = {
  bars: 'leds',
  leds: 'wave',
  wave: 'bars',
  spectrum: 'leds',
  classic: 'leds',
};

interface SoundWaveProps {
  isPlaying: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  trackId?: string;
  barCount?: number;
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  initialMode?: VisualizerMode;
}

const SoundWaveComponent: React.FC<SoundWaveProps> = ({
  isPlaying,
  currentTime: _currentTime = 0,
  duration: _duration = 0,
  volume: _volume = 1,
  trackId = 'meedia',
  barCount: _barCount = 32,
  width = 500,
  height = 105,
  color = '#facc15',
  className = '',
  initialMode = 'bars',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioMotionRef = useRef<AudioMotionAnalyzer | null>(null);
  const [mode, setMode] = useState<VisualizerMode>(initialMode);
  const isPlayingRef = useRef<boolean>(isPlaying);

  // Sync isPlaying and control AudioMotion start/stop
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      resumeAudioContext();
      if (audioMotionRef.current && !audioMotionRef.current.isOn) {
        audioMotionRef.current.start();
      }
    } else {
      if (audioMotionRef.current && audioMotionRef.current.isOn) {
        audioMotionRef.current.stop();
      }
    }
  }, [isPlaying]);

  // Initialize AudioMotionAnalyzer — one persistent instance per mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;

    const setupMotion = (source: MediaElementAudioSourceNode, ctx: AudioContext) => {
      if (destroyed || !container || audioMotionRef.current) return;

      const canvasHeight = Math.round(height * 1.50);

      try {
        const inst = new AudioMotionAnalyzer(container, {
          source,
          audioCtx: ctx,
          connectSpeakers: false, // We route audio through our own gainNode for pre-fader volume
          start: false,           // Don't auto-start; we control playback state
          width,
          height: canvasHeight,
          maxFPS: 60,             // Lock at 60 FPS for consistent, silky-smooth rendering
          mode: 5,                // 1/4th octave bands (~40 bars with log scale)
          ansiBands: true,
          frequencyScale: 'log',
          barSpace: 0.25,         // Clear separation between bars
          showPeaks: false,
          fadePeaks: false,
          roundBars: false,
          ledBars: false,
          outlineBars: false,
          showScaleX: false,
          showScaleY: false,
          showBgColor: false,
          bgAlpha: 0,
          overlay: true,          // Transparent canvas background
          reflexRatio: 0,         // Grounded flush on bottom
          fillAlpha: 1,
          lineWidth: 0,
          mirror: 0,              // Standard left-to-right (bass → treble)
          smoothing: 0.65,        // Extra fluid, buttery response
          minDecibels: -75,       // Cut noise floor for cleaner bars
          maxDecibels: -25,       // Lower ceiling = bars rise higher
          linearAmplitude: true,  // Linear scale for punchier visual response
          linearBoost: 1.6,       // Boost factor for dynamic bar heights
          gravity: 2.5,           // Bars hold longer before falling
          minFreq: 20,
          maxFreq: 16000,
          weightingFilter: '',    // No filter — full uncolored frequency response
        });

        // Register theme gradient
        const isLight = color === '#ca8a04' || color.startsWith('#ca');
        const gradStops = isLight
          ? ['#854d0e', '#ca8a04', '#eab308']
          : ['#ca8a04', '#facc15', '#fef08a'];

        inst.registerGradient('meediaThemeGrad', {
          bgColor: 'transparent',
          colorStops: gradStops,
        });
        inst.gradient = 'meediaThemeGrad';

        // Ensure canvas fills container cleanly and aligns flush to bottom
        if (inst.canvas) {
          inst.canvas.style.display = 'block';
          inst.canvas.style.width = '100%';
          inst.canvas.style.height = `${canvasHeight}px`;
          inst.canvas.style.position = 'absolute';
          inst.canvas.style.bottom = '0';
          inst.canvas.style.left = '0';
          inst.canvas.style.backgroundColor = 'transparent';
        }

        audioMotionRef.current = inst;

        if (isPlayingRef.current) {
          inst.start();
        }
      } catch (err) {
        console.warn('AudioMotionAnalyzer setup error:', err);
      }
    };

    // Connect immediately if source is already available
    const currentSource = getSourceNode();
    const currentCtx = getAudioContext();
    if (currentSource && currentCtx) {
      setupMotion(currentSource, currentCtx);
    }

    // Also listen for source becoming ready (first track play)
    const unsubscribe = onAudioSourceReady((src, ctx) => {
      setupMotion(src, ctx);
    });

    return () => {
      destroyed = true;
      unsubscribe();
      if (audioMotionRef.current) {
        try {
          audioMotionRef.current.destroy();
        } catch {}
        audioMotionRef.current = null;
      }
    };
  }, [width, height]);

  // Instantly drop old visualizer bars and peaks on track switch
  useEffect(() => {
    if (!audioMotionRef.current) return;
    try {
      const inst = audioMotionRef.current;
      const prevSmoothing = inst.smoothing;
      // Drop bars immediately to 0 by removing smoothing for a frame
      inst.setOptions({ smoothing: 0 });
      const timer = setTimeout(() => {
        if (audioMotionRef.current) {
          audioMotionRef.current.setOptions({ smoothing: prevSmoothing });
        }
      }, 50);
      return () => clearTimeout(timer);
    } catch {}
  }, [trackId]);

  // Update gradient when theme/color changes
  useEffect(() => {
    if (!audioMotionRef.current) return;
    try {
      const isLight = color === '#ca8a04' || color.startsWith('#ca');
      const gradStops = isLight
        ? ['#854d0e', '#ca8a04', '#eab308']
        : ['#ca8a04', '#facc15', '#fef08a'];

      audioMotionRef.current.registerGradient('meediaThemeGrad', {
        bgColor: 'transparent',
        colorStops: gradStops,
      });
      audioMotionRef.current.gradient = 'meediaThemeGrad';
    } catch {}
  }, [color]);

  // Switch visualization mode dynamically
  useEffect(() => {
    if (!audioMotionRef.current) return;
    try {
      if (mode === 'bars' || mode === 'spectrum' || mode === 'classic') {
        audioMotionRef.current.setOptions({
          mode: 5,
          mirror: 0,
          ledBars: false,
          outlineBars: false,
          fillAlpha: 1,
          lineWidth: 0,
          roundBars: false,
          showPeaks: false,
          fadePeaks: false,
          overlay: true,
          showBgColor: false,
          bgAlpha: 0,
        });
      } else if (mode === 'leds') {
        audioMotionRef.current.setOptions({
          mode: 5,
          mirror: 0,
          ledBars: true,
          outlineBars: false,
          fillAlpha: 1,
          lineWidth: 0,
          roundBars: false,
          showPeaks: false,
          fadePeaks: false,
          overlay: true,
          showBgColor: false,
          bgAlpha: 0,
        });
      } else if (mode === 'wave') {
        audioMotionRef.current.setOptions({
          mode: 10,
          mirror: 0,
          ledBars: false,
          outlineBars: false,
          fillAlpha: 0.75,
          lineWidth: 2,
          roundBars: false,
          showPeaks: false,
          fadePeaks: false,
          overlay: true,
          showBgColor: false,
          bgAlpha: 0,
        });
      }
    } catch {}
  }, [mode]);

  const handleCycleMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMode((prev) => NEXT_LOOK[prev] || 'bars');
  };

  return (
    <div
      className={`relative select-none cursor-pointer overflow-visible ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
      onClick={handleCycleMode}
    >
      {/* AudioMotionAnalyzer renders its canvas inside this container, expanded 50% higher grounded at bottom */}
      <div
        ref={containerRef}
        className="w-full absolute bottom-0 left-0 bg-transparent pointer-events-none overflow-visible [&_canvas]:block [&_canvas]:w-full [&_canvas]:bg-transparent"
        style={{ height: `${Math.round(height * 1.50)}px` }}
      />
    </div>
  );
};

export const SoundWave = React.memo(SoundWaveComponent);

export const CosmeticWave: React.FC<{ color?: string; isPlaying?: boolean }> = ({
  color = '#1db954',
  isPlaying = true,
}) => {
  return (
    <span className="inline-flex items-end space-x-0.5 h-3 w-3 shrink-0" title="Playing">
      <span
        className="w-0.5"
        style={{
          backgroundColor: color,
          height: isPlaying ? '100%' : '30%',
          animation: isPlaying ? 'meediaPulse 0.8s ease-in-out infinite alternate' : 'none',
        }}
      />
      <span
        className="w-0.5"
        style={{
          backgroundColor: color,
          height: isPlaying ? '60%' : '40%',
          animation: isPlaying ? 'meediaPulse 0.6s ease-in-out infinite alternate 0.2s' : 'none',
        }}
      />
      <span
        className="w-0.5"
        style={{
          backgroundColor: color,
          height: isPlaying ? '90%' : '20%',
          animation: isPlaying ? 'meediaPulse 0.9s ease-in-out infinite alternate 0.4s' : 'none',
        }}
      />
      <span
        className="w-0.5"
        style={{
          backgroundColor: color,
          height: isPlaying ? '40%' : '30%',
          animation: isPlaying ? 'meediaPulse 0.7s ease-in-out infinite alternate 0.1s' : 'none',
        }}
      />
    </span>
  );
};
