import { useState, useEffect, useRef } from 'react';
import { Visualizer } from './components/Visualizer';
import './App.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [colorShift, setColorShift] = useState(0.0);
  const [volume, setVolume] = useState(0.5); // Default volume 50%
  const [uiVisible, setUiVisible] = useState(true);
  const [showUiBtnVisible, setShowUiBtnVisible] = useState(false);

  // Audio Input State
  const [mode, setMode] = useState('mic'); // 'mic' | 'file' | 'url'
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [presetName, setPresetName] = useState('');
  const audioElRef = useRef(null);

  // Toggle UI with 'H' key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key.toLowerCase() === 'h') {
          setUiVisible(v => {
              // If hiding, show the small button
              if (v) setShowUiBtnVisible(true);
              // If showing, hide the small button (logic handled in render mostly)
              return !v;
          });
      }
      if (e.code === 'Space') {
          e.preventDefault(); // Prevent scrolling
          togglePlay();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlaying, mode]); // Re-bind when playing state changes to handle play/pause logic correctly

  // Apply volume to audio element
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
      const newState = !isPlaying;
      setIsPlaying(newState);

      // Handle HTML Audio Element
      if ((mode === 'file' || mode === 'url') && audioElRef.current) {
          if (newState) {
              const playPromise = audioElRef.current.play();
              if (playPromise !== undefined) {
                  playPromise.then(_ => {
                      // Automatic playback started!
                  })
                  .catch(error => {
                     console.error("Auto-play was prevented", error);
                     setIsPlaying(false);
                  });
              }
          } else {
              audioElRef.current.pause();
          }
      }
  };

  const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (file) {
          // Revoke old object URL to avoid memory leaks
          if (audioFile && mode === 'file') {
              URL.revokeObjectURL(audioFile);
          }
          const url = URL.createObjectURL(file);
          setAudioFile(url);
          setMode('file');
          setIsPlaying(false);
      }
  };

  const handleUrlChange = (e) => {
      setAudioUrl(e.target.value);
  };

  const loadUrl = () => {
      if (audioUrl) {
          setAudioFile(audioUrl);
          setMode('url');
          setIsPlaying(false);
      }
  };

  const handleHideUi = () => {
      setUiVisible(false);
      setShowUiBtnVisible(true);
  };

  const handleShowUi = () => {
      setUiVisible(true);
      setShowUiBtnVisible(false);
  };

  return (
    <div className="app-container">
      {/* Hidden Audio Element for File/URL Mode */}
      <audio
          ref={audioElRef}
          src={audioFile}
          loop
          crossOrigin="anonymous"
          onEnded={() => setIsPlaying(false)}
      />

      <Visualizer
        isPlaying={isPlaying}
        colorShift={colorShift}
        audioElementRef={(mode === 'file' || mode === 'url') ? audioElRef : null}
        onPresetChange={setPresetName}
      />

      {/* Intro Overlay */}
      {!isPlaying && (
        <div className="intro-overlay" onClick={togglePlay}>
          <div className="intro-content">
            <h1>VISUAL LOCK</h1>
            <p>CLICK TO START</p>
          </div>
        </div>
      )}

      {/* Persistent Show UI Button */}
      {showUiBtnVisible && !uiVisible && (
           <button className="show-ui-btn" onClick={handleShowUi}>
               SHOW UI
           </button>
      )}

      {/* Controls UI */}
      {uiVisible && (
        <div className="controls-panel">
          <div className="controls-header">
             <div className="logo">VISUAL // LOCK</div>
             <button className="close-btn" onClick={handleHideUi}>HIDE UI</button>
          </div>

          <div className="preset-info-bar">
              <span className="preset-name">{presetName || "Loading..."}</span>
          </div>

          <div className="control-group">
             <label>SOURCE</label>
             <div className="source-toggle">
               <button className={mode === 'mic' ? 'active' : ''} onClick={() => setMode('mic')}>MIC</button>
               <button className={mode === 'file' ? 'active' : ''} onClick={() => document.getElementById('file-upload').click()}>FILE</button>
               <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>URL</button>
             </div>
             <input
                 id="file-upload"
                 type="file"
                 accept="audio/*"
                 onChange={handleFileChange}
                 style={{display: 'none'}}
             />
             {mode === 'url' && (
                 <div className="url-input-group">
                     <input
                        type="text"
                        placeholder="Paste direct audio URL"
                        value={audioUrl}
                        onChange={handleUrlChange}
                     />
                     <button onClick={loadUrl}>LOAD</button>
                 </div>
             )}
          </div>

          <div className="control-group">
            <label>VOLUME</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="slider volume-slider"
            />
          </div>

          <div className="control-group">
            <label>PRESET SHIFT</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={colorShift}
              onChange={(e) => setColorShift(parseFloat(e.target.value))}
              className="slider"
            />
          </div>

          <div className="status-bar">
             <div className={`status-indicator ${isPlaying ? 'active' : ''}`}>
                 {isPlaying ? 'ACTIVE' : 'STANDBY'}
             </div>
             <div className="fps-counter">60 FPS</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
