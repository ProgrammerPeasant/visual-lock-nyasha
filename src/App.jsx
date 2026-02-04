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
  const [isResolving, setIsResolving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const audioElRef = useRef(null);

  const SC_CLIENT_ID = import.meta.env.VITE_SC_CLIENT_ID;

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

  const loadUrl = async () => {
      if (!audioUrl) return;

      setIsResolving(true);

      // Debug: Check if client ID is loaded
      if (!SC_CLIENT_ID) {
          console.error("SC_CLIENT_ID is missing! Make sure RESTART vite server after creating .env");
          alert("Client ID missing or server not restarted.");
          setIsResolving(false);
          return;
      }

      let finalUrl = audioUrl;

      // SoundCloud Resolve Logic
      if (audioUrl.includes('soundcloud.com')) {
          try {
              // Try API v2 Resolve
              const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(audioUrl)}&client_id=${SC_CLIENT_ID}`;
              const response = await fetch(resolveUrl);

              if (!response.ok) {
                  throw new Error(`SoundCloud API v2 Error: ${response.status}`);
              }

              const trackData = await response.json();

              // Handle v2 media object
              if (trackData.media && trackData.media.transcodings) {
                  // Find progressive mp3 stream (preferred)
                  const progressive = trackData.media.transcodings.find(
                      t => t.format && t.format.protocol === 'progressive'
                  );

                  if (progressive) {
                      // v2 requires a second call to get the actual stream URL
                      const streamUrlWithId = `${progressive.url}?client_id=${SC_CLIENT_ID}`;
                      const streamResp = await fetch(streamUrlWithId);
                      const streamData = await streamResp.json();

                      if (streamData.url) {
                          finalUrl = streamData.url;
                          console.log("Resolved SoundCloud v2 Stream:", finalUrl);
                      } else {
                          throw new Error("Failed to extract stream URL from transcoding");
                      }
                  } else {
                      throw new Error("No progressive stream found (HLS not supported in this simple player)");
                  }
              } else if (trackData.stream_url) {
                  // Fallback for v1-like response
                   finalUrl = `${trackData.stream_url}?client_id=${SC_CLIENT_ID}`;
              } else {
                  throw new Error("Track is not streamable or restricted");
              }
          } catch (error) {
              console.error("SoundCloud resolution failed:", error);
              alert(`Error: ${error.message}. ensure your Client ID is valid.`);
              setIsResolving(false);
              return;
          }
      }

      setAudioFile(finalUrl);
      setMode('url');
      setIsPlaying(false);
      setIsResolving(false);
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
                        placeholder="Paste direct audio URL or SoundCloud link"
                        value={audioUrl}
                        onChange={handleUrlChange}
                     />
                     <button onClick={loadUrl} disabled={isResolving}>
                        {isResolving ? '...' : 'LOAD'}
                     </button>
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
