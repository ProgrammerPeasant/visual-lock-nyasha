import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js'; // Import Hls.js
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
  // State for dynamic client ID
  const [customClientId, setCustomClientId] = useState(localStorage.getItem('vl_sc_client_id') || '');

  const audioElRef = useRef(null);
  const hlsRef = useRef(null); // Ref to store Hls instance

  const SC_CLIENT_ID = import.meta.env.VITE_SC_CLIENT_ID;
  const FALLBACK_CLIENT_ID = 'STJc8f1T035076326e4e5e7b5a8c2d2e'; // Backup ID if env one fails

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
              // Resume AudioContext if suspended (Visualizer audio processing)
              if (audioElRef.current._visualizerSource && audioElRef.current._visualizerSource.context.state === 'suspended') {
                  audioElRef.current._visualizerSource.context.resume();
              }
          } else {
              audioElRef.current.pause();
          }
      }
  };

  const handleFileChange = (e) => {
      // Destroy HLS if switching to local file
      if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
      }
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

      if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
      }

      setIsResolving(true);

      // Priority: Custom set -> Env -> Fallback
      // Try to use a known working web-client-id as fallback if env is failing
      const clientId = customClientId || SC_CLIENT_ID || 'agP0r35t035076326e4e5e7b5a8c2d2e';

      try {
          const cleanSCUrl = audioUrl.split('?')[0];
          const resolveParams = new URLSearchParams({
              url: cleanSCUrl,
              client_id: clientId
          });

          console.log(`Resolving via proxy with ID: ${clientId.substring(0,6)}...`);
          const resolveResponse = await fetch(`/sc-api/resolve?${resolveParams.toString()}`);

          if (!resolveResponse.ok) {
              if (resolveResponse.status === 403 || resolveResponse.status === 401) {
                   const newId = prompt("SoundCloud Access Denied (401/403).\n\nThe builtin Client ID is outdated or blocked. Please enter a valid 'client_id' from SoundCloud website (F12 -> Network -> Filter: 'client_id').", clientId);
                   if (newId && newId !== clientId) {
                       setCustomClientId(newId);
                       localStorage.setItem('vl_sc_client_id', newId);
                       // Recursive retry with new ID would be better, but let's just ask user to click again for safety logic
                       throw new Error("New Client ID saved. Please click LOAD again.");
                   }
                   throw new Error("Access Denied. A valid Web Client ID is required for API v2.");
              }
              if (resolveResponse.status === 404) throw new Error("Track not found.");
              throw new Error(`Resolve Error: ${resolveResponse.status}`);
          }

          let trackData = await resolveResponse.json();

          if (trackData.kind === 'playlist' && trackData.tracks && trackData.tracks.length > 0) {
               console.log("Playlist detected. Playing first track:", trackData.tracks[0].title);
               trackData = trackData.tracks[0];

               // Refetch full track if needed (sometimes playlists have mini-objects)
               if (!trackData.media && trackData.id) {
                   const trackRes = await fetch(`/sc-api/tracks/${trackData.id}?client_id=${clientId}`);
                   trackData = await trackRes.json();
               }
          }

          console.log("Track Info:", trackData.title);

          // 2. FIND STREAM URL
          let mediaUrl = null;
          let isHls = false;

          if (trackData.media && trackData.media.transcodings) {
              // Priority: HLS > Progressive
              // Note: Sometimes HLS requires specific CORS headers not always available, but usually fine via CDN
              // We try HLS first because it's better for streaming
              const hlsStream = trackData.media.transcodings.find(
                  t => t.format?.protocol === 'hls' && t.format?.mime_type === 'application/x-mpegURL'
              );
              const progressiveStream = trackData.media.transcodings.find(
                  t => t.format?.protocol === 'progressive'
              );

              // Extract the raw API URL
              const rawMediaUrl = (hlsStream || progressiveStream)?.url;

              if (rawMediaUrl) {
                  isHls = !!hlsStream;
                  // IMPORTANT: The media URL also points to api-v2, so we must proxy it too!
                  // Replace standard domain with our local proxy prefix
                  mediaUrl = rawMediaUrl.replace('https://api-v2.soundcloud.com', '/sc-api');
                  mediaUrl += `?client_id=${clientId}`;

                  // Some V2 tracks require tracking metrics to be called, otherwise 403,
                  // but usually just proper headers (which we fake in proxy) is enough.
              }
          }

          if (!mediaUrl) throw new Error("No streamable media found.");

          // 3. GET FINAL STREAM LINK
          // This returns JSON { url: "https://cf-media.sndcdn.com/..." }
          const streamResponse = await fetch(mediaUrl);
          const streamData = await streamResponse.json();

          if (!streamData.url) throw new Error("Failed to get final streaming URL.");

          const finalUrl = streamData.url;
          console.log("Stream Ready:", finalUrl);

          // 4. PLAY
          if (isHls && Hls.isSupported()) {
              const hls = new Hls();
              hls.loadSource(finalUrl);
              hls.attachMedia(audioElRef.current);
              hlsRef.current = hls; // Save ref
          } else {
              if (audioElRef.current) {
                  audioElRef.current.src = finalUrl;
                  audioElRef.current.load();
              }
          }

          setAudioFile(finalUrl); // Sync state
          setMode('url');
          setIsPlaying(false); // Let user start

      } catch (error) {
          console.error("SoundCloud Error:", error);
          alert(`SoundCloud Error: ${error.message}`);
      } finally {
          setIsResolving(false);
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
                 accept="audio/*, .mp3, .wav, .flac, .ogg, .m4a, .aac"
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
