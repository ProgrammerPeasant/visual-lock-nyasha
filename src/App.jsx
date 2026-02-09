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

      // Cleanup previous HLS
      if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
      }

      setIsResolving(true);

      const clientId = SC_CLIENT_ID || FALLBACK_CLIENT_ID;
      let finalUrl = audioUrl;

      // SoundCloud Resolve Logic
      if (audioUrl.includes('soundcloud.com')) {
          try {
              // Add timestamp to prevent proxy caching
              const cacheBuster = `&_t=${Date.now()}`;
              // Try different proxy strategy or rotate proxies if needed
              // using allorigins with raw content
              const CORS_PROXY = "https://api.allorigins.win/raw?url=";
              const targetUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(audioUrl)}&client_id=${clientId}`;

              console.log("Resolving SC URL:", targetUrl);
              const response = await fetch(`${CORS_PROXY}${encodeURIComponent(targetUrl + cacheBuster)}`);

              if (!response.ok) {
                  throw new Error(`Proxy/Network Error: ${response.status}`);
              }

              const responseText = await response.text();
              // console.log("SC Raw Response:", responseText.substring(0, 500));

              let trackData = null;
              try {
                if (!responseText || responseText.trim() === "") {
                    throw new Error("Empty response from SoundCloud API");
                }
                trackData = JSON.parse(responseText);
              } catch (e) {
                console.error("JSON Parse Error. Response was:", responseText);
                throw new Error("Failed to parse SoundCloud response");
              }

              console.log("SC Track Data:", trackData);

              // Check for soft errors (200 OK but error body)
              if (trackData.errors) {
                  throw new Error(`SoundCloud API Error: ${trackData.errors[0]?.error_message || 'Unknown error'}`);
              }

              if (trackData.code === 401 || trackData.code === 403) {
                  throw new Error("Invalid Client ID or Access Denied");
              }

              // Handle Playlists/Sets (Grab first track)
              if (trackData.kind === 'playlist' && trackData.tracks && trackData.tracks.length > 0) {
                  console.log("Playlist detected. Playing first track:", trackData.tracks[0].title);
                  trackData = trackData.tracks[0];

                  // Double check if the extracted track is valid
                  if (!trackData.media && !trackData.stream_url) {
                      // Sometimes playlist tracks are minimal objects, need to fetch full track
                       if (trackData.id) {
                           console.log("Fetching full track info for ID:", trackData.id);
                           const trackRes = await fetch(`${CORS_PROXY}${encodeURIComponent(`https://api-v2.soundcloud.com/tracks/${trackData.id}?client_id=${clientId}`)}`);
                           trackData = await trackRes.json();
                       }
                  }
              }

              if (trackData.media && trackData.media.transcodings) {
                  // Try to find HLS stream first (best quality usually)
                  const hlsStream = trackData.media.transcodings.find(
                      t => t.format && t.format.protocol === 'hls' && t.format.mime_type === 'application/x-mpegURL'
                  );
                  // Fallback to progressive (mp3)
                  const progressive = trackData.media.transcodings.find(
                      t => t.format && t.format.protocol === 'progressive'
                  );

                  let endpoint = null;
                  let isHls = false;

                  if (hlsStream) {
                      endpoint = hlsStream.url;
                      isHls = true;
                      console.log("Found HLS Stream");
                  } else if (progressive) {
                      endpoint = progressive.url;
                      console.log("Found Progressive MP3 Stream");
                  }

                  if (endpoint) {
                      const streamUrlWithId = `${endpoint}?client_id=${clientId}`;
                      const streamResp = await fetch(`${CORS_PROXY}${encodeURIComponent(streamUrlWithId)}`);
                      const streamData = await streamResp.json();

                      if (streamData.url) {
                          finalUrl = streamData.url;

                          if (isHls && Hls.isSupported()) {
                              // Initialize HLS
                              const hls = new Hls();
                              hls.loadSource(finalUrl);
                              hls.attachMedia(audioElRef.current);
                              hlsRef.current = hls;

                              // We don't set src directly for HLS, hls.js handles it
                              // But we need to set mode to 'url'
                              setMode('url');
                              setIsPlaying(false);
                              setIsResolving(false);
                              return;
                          }
                      } else {
                          throw new Error("Failed to extract stream URL");
                      }
                  } else {
                      throw new Error("No supported stream format found");
                  }
              } else if (trackData.stream_url) {
                   finalUrl = `${trackData.stream_url}?client_id=${clientId}`;
              } else {
                  throw new Error("Track is not streamable or restricted");
              }
          } catch (error) {
              console.error("SoundCloud resolution failed:", error);
              if (error.message.includes('403') || error.message.includes('401')) {
                   alert("SoundCloud Blocked Access. Try a different track.");
              } else {
                   alert(`Error loading track: ${error.message}`);
              }
              setIsResolving(false);
              return;
          }
      }

      // Fallback for standard MP3 or direct links
      if (audioElRef.current) {
          audioElRef.current.src = finalUrl;
          audioElRef.current.load();
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
