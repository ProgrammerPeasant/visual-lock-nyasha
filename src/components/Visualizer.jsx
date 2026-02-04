import React, { useEffect, useRef } from 'react';
import * as butterchurnModule from 'butterchurn';
import * as butterchurnPresetsModule from 'butterchurn-presets';
import { AudioProcessor } from '../utils/AudioProcessor';

// Helper to resolve the correct module structure
const resolveModule = (mod) => {
    // Try to find the object that has createVisualizer
    if (mod.default && typeof mod.default.createVisualizer === 'function') return mod.default;
    if (typeof mod.createVisualizer === 'function') return mod;
    if (mod.default && mod.default.default && typeof mod.default.default.createVisualizer === 'function') return mod.default.default;
    return mod;
};

const resolvePresets = (mod) => {
    if (mod.default && typeof mod.default.getPresets === 'function') return mod.default;
    if (typeof mod.getPresets === 'function') return mod;
    return mod;
};

const butterchurn = resolveModule(butterchurnModule);
const butterchurnPresets = resolvePresets(butterchurnPresetsModule);

export const Visualizer = ({ isPlaying, colorShift = 0.0, audioElementRef, onPresetChange }) => {
  const canvasRef = useRef(null);
  const audioRef = useRef(new AudioProcessor());
  const requestRef = useRef(null);
  const visualizerRef = useRef(null);
  const presetsRef = useRef(null);
  const presetKeysRef = useRef([]);

  // Timer for preset cycling
  const cycleRef = useRef(null);

  const initVisualizer = async () => {
    if (!canvasRef.current || !audioRef.current.audioContext) return;

    // Check if butterchurn loaded correctly
    if (!butterchurn || typeof butterchurn.createVisualizer !== 'function') {
        console.error("Butterchurn failed to load. resolvedModule:", butterchurn);
        return;
    }

    // Init presets if not ready
    if (!presetsRef.current) {
         try {
             const presets = butterchurnPresets.getPresets();
             presetsRef.current = presets;
             presetKeysRef.current = Object.keys(presets);
         } catch (e) {
             console.error("Presets failed to load:", e);
             return;
         }
    }

    const { width, height } = canvasRef.current.getBoundingClientRect();
    canvasRef.current.width = width;
    canvasRef.current.height = height;

    // Create visualizer if not exists
    if (!visualizerRef.current) {
        visualizerRef.current = butterchurn.createVisualizer(
            audioRef.current.audioContext,
            canvasRef.current,
            {
                width: width,
                height: height,
                pixelRatio: window.devicePixelRatio || 1,
                textureRatio: 1,
            }
        );
    }

    // Connect Audio
    if (audioRef.current.source) {
        try {
            visualizerRef.current.connectAudio(audioRef.current.source);
        } catch(e) { console.warn("Audio connection warning:", e); }
    }

    // Load initial preset if not loaded
    const keys = presetKeysRef.current;
    if (keys.length > 0) {
        // Try to find the specific cool preset from the guide
        const specificKey = 'Flexi, martin + geiss - dedicated to the sherwin maxawow';
        const startKey = keys.includes(specificKey) ? specificKey : keys[Math.floor(Math.random() * keys.length)];

        visualizerRef.current.loadPreset(presetsRef.current[startKey], 0.0);
        if (onPresetChange) onPresetChange(startKey);
    }
  };

  const handleResize = () => {
      if (visualizerRef.current && canvasRef.current) {
          const width = window.innerWidth;
          const height = window.innerHeight;
          canvasRef.current.width = width;
          canvasRef.current.height = height;
          visualizerRef.current.setRendererSize(width, height);
      }
  };

  const animate = () => {
      if (visualizerRef.current) {
          visualizerRef.current.render();
      }
      requestRef.current = requestAnimationFrame(animate);
  };

  // Preset cycling logic
  useEffect(() => {
     if (!isPlaying) return;

     // Cycle preset every 15 seconds
     const cycle = setInterval(() => {
         if (visualizerRef.current && presetKeysRef.current.length) {
             const keys = presetKeysRef.current;
             const randomKey = keys[Math.floor(Math.random() * keys.length)];
             // 2.7 seconds blend time
             visualizerRef.current.loadPreset(presetsRef.current[randomKey], 2.7);
             if (onPresetChange) onPresetChange(randomKey);
         }
     }, 15000);

     return () => clearInterval(cycle);
  }, [isPlaying]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);

    if (!requestRef.current) {
        requestRef.current = requestAnimationFrame(animate);
    }

    if (isPlaying) {
        // Init Audio
        audioRef.current.init(audioElementRef?.current).then(() => {
            console.log("Audio initialized for Butterchurn");
            // Init or Update visualizer audio connection
            initVisualizer();
        });
    }

    return () => {
        window.removeEventListener('resize', handleResize);
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = null;
        }
    };
  }, [isPlaying, audioElementRef]);

  // Handle manual preset change
  useEffect(() => {
      if (visualizerRef.current && colorShift > 0.05 && presetKeysRef.current.length) {
          const keys = presetKeysRef.current;
          const index = Math.floor(colorShift * (keys.length - 1));
          const key = keys[index];

          visualizerRef.current.loadPreset(presetsRef.current[key], 0.5);
          if (onPresetChange) onPresetChange(key);
      }
  }, [colorShift]);

  return <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }} />;
};
