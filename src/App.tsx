import { useEffect, useMemo, useRef, useState } from "react";
import type { CollectionSnapshot, ReleaseDetails } from "../lib/types";
import "./App.css";

// ── YouTube IFrame API (minimal types, no extra package) ──────────
interface YTPlayerOptions {
  width?: string | number;
  height?: string | number;
  videoId?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
  };
}

interface YTPlayerInstance {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

declare global {
  interface Window {
    YT: {
      Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayerInstance;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function extractVideoId(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.hostname === "youtu.be") return url.pathname.slice(1);
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v");
    return null;
  } catch {
    return null;
  }
}

function normStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchTrackToVideoId(
  trackTitle: string,
  videos: { title: string; uri: string }[]
): string | null {
  const normTrack = normStr(trackTitle);
  if (normTrack.length < 3) return null;
  for (const v of videos) {
    const id = extractVideoId(v.uri);
    if (!id) continue;
    // Strip "Artist - " prefix common in Discogs video titles
    const vTitle = v.title.includes(" - ")
      ? v.title.split(" - ").slice(1).join(" - ")
      : v.title;
    const normVid = normStr(vTitle);
    if (normVid.includes(normTrack) || normTrack.includes(normVid)) return id;
  }
  return null;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function App() {
  const [data, setData] = useState<CollectionSnapshot | null>(null);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [release, setRelease] = useState<ReleaseDetails | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  // Playback state
  const [activeTrackIdx, setActiveTrackIdx] = useState<number | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);

  // Refs (stable across renders)
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const ytApiInitialized = useRef(false);

  // Load collection
  useEffect(() => {
    fetch("/api/public/collection")
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  // Initialize YouTube IFrame API once on mount
  useEffect(() => {
    if (ytApiInitialized.current) return;
    ytApiInitialized.current = true;

    const initPlayer = () => {
      // Only create a new player if we don't already have a ready one
      if (ytPlayerRef.current) return;
      const p = new window.YT.Player("yt-hidden-player", {
        width: "1",
        height: "1",
        playerVars: { autoplay: 0, controls: 0, playsinline: 1 },
        events: {
          // Assign the ref only after the player is fully ready — before this
          // point, control methods like pauseVideo are not yet callable.
          onReady: () => { ytPlayerRef.current = p; },
          onStateChange: (e: { data: number }) => {
            if (!window.YT?.PlayerState) return;
            const { PLAYING, PAUSED, ENDED } = window.YT.PlayerState;
            if (e.data === PLAYING) {
              setIsPlaying(true);
            } else if (e.data === PAUSED) {
              setIsPlaying(false);
              if (progressTimerRef.current !== null) {
                clearInterval(progressTimerRef.current);
                progressTimerRef.current = null;
              }
            } else if (e.data === ENDED) {
              setIsPlaying(false);
              setActiveTrackIdx(null);
              setActiveVideoId(null);
              setProgress(0);
              setCurrentTime(0);
              if (progressTimerRef.current !== null) {
                clearInterval(progressTimerRef.current);
                progressTimerRef.current = null;
              }
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (!document.querySelector('script[src*="iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      if (progressTimerRef.current !== null) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      // Null the ref rather than calling destroy() — destroy() removes the
      // iframe from the DOM which breaks React's reconciler on StrictMode remount.
      ytPlayerRef.current = null;
    };
  }, []);

  // ── Playback controls ─────────────────────────────────────────

  function startProgressTimer() {
    if (progressTimerRef.current !== null) return;
    progressTimerRef.current = window.setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player) return;
      try {
        const cur = player.getCurrentTime();
        const dur = player.getDuration();
        if (dur > 0) {
          setCurrentTime(cur);
          setPlayerDuration(dur);
          setProgress(cur / dur);
        }
      } catch {
        // player not fully initialized yet
      }
    }, 500);
  }

  function stopPlayback() {
    try { ytPlayerRef.current?.pauseVideo(); } catch { /* player not ready */ }
    setIsPlaying(false);
    setActiveTrackIdx(null);
    setActiveVideoId(null);
    setProgress(0);
    setCurrentTime(0);
    setPlayerDuration(0);
    if (progressTimerRef.current !== null) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function playTrack(videoId: string, trackIdx: number) {
    const player = ytPlayerRef.current;
    if (!player) return;
    setActiveTrackIdx(trackIdx);
    setActiveVideoId(videoId);
    setProgress(0);
    setCurrentTime(0);
    player.loadVideoById(videoId); // auto-plays; state change sets isPlaying
    startProgressTimer();
  }

  function prevTrack() {
    if (!release || activeTrackIdx === null) return;
    for (let i = activeTrackIdx - 1; i >= 0; i--) {
      const videoId = matchTrackToVideoId(release.tracklist[i].title, release.videos);
      if (videoId) { playTrack(videoId, i); return; }
    }
  }

  function nextTrack() {
    if (!release || activeTrackIdx === null) return;
    for (let i = activeTrackIdx + 1; i < release.tracklist.length; i++) {
      const videoId = matchTrackToVideoId(release.tracklist[i].title, release.videos);
      if (videoId) { playTrack(videoId, i); return; }
    }
  }

  function togglePlayPause() {
    const player = ytPlayerRef.current;
    if (!player || !activeVideoId) return;
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
      startProgressTimer();
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const player = ytPlayerRef.current;
    if (!player) return;
    const dur = player.getDuration();
    player.seekTo(ratio * dur, true);
    setProgress(ratio);
    setCurrentTime(ratio * dur);
  }

  // ── Collection filtering ──────────────────────────────────────

  const items = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    if (!query) return data.items;
    return data.items.filter(i => {
      const artist = i.artists.map(a => a.name).join(" ").toLowerCase();
      const label = i.labels.map(l => l.name).join(" ").toLowerCase();
      return (
        i.title.toLowerCase().includes(query) ||
        artist.includes(query) ||
        label.includes(query)
      );
    });
  }, [data, q]);

  function handleCardClick(releaseId: number) {
    if (releaseId === selectedId) {
      stopPlayback();
      setSelectedId(null);
      setRelease(null);
      return;
    }
    stopPlayback();
    setSelectedId(releaseId);
    setRelease(null);
    setReleaseError(null);
    setReleaseLoading(true);

    fetch(`/api/public/release/${releaseId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ReleaseDetails>;
      })
      .then(d => { setRelease(d); setReleaseLoading(false); })
      .catch((err: unknown) => {
        setReleaseError(err instanceof Error ? err.message : "Failed to load");
        setReleaseLoading(false);
      });
  }

  function closePanel() {
    stopPlayback();
    setSelectedId(null);
    setRelease(null);
    setReleaseError(null);
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <div className="loading-text">LOADING COLLECTION</div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Hidden YouTube player — always in DOM, invisible */}
      <div
        id="yt-hidden-player"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          opacity: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      />

      {/* ── Header ── */}
      <header className="site-header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="brand-name">Esperáme Records</div>
          </div>

          <div className="header-search">
            <input
              className="search-input"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search artists, titles…"
              aria-label="Search collection"
            />
          </div>

          <div className="header-right">
            <div className="header-updated">
              synced {new Date(data.fetchedAt).toLocaleDateString()}
            </div>
            <div className="header-stat">
              <span className="stat-count">{items.length}</span>
              <span className="stat-label">Records</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className={`app-body${selectedId !== null ? " panel-open" : ""}`}>

        {/* Grid */}
        <div className="collection-grid">
          {items.length === 0 && (
            <div className="empty-state">NO RECORDS FOUND</div>
          )}
          {items.map(i => (
            <div
              key={i.instanceId}
              className={`record-card${selectedId === i.releaseId ? " active" : ""}`}
              onClick={() => handleCardClick(i.releaseId)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === "Enter" && handleCardClick(i.releaseId)}
            >
              <div className="card-cover">
                {i.thumbUrl
                  ? <img src={i.thumbUrl} alt={i.title} loading="lazy" />
                  : <div className="card-cover-placeholder" />
                }
                <div className="card-overlay">
                  <span>{selectedId === i.releaseId ? "OPEN" : "VIEW"}</span>
                </div>
              </div>
              <div className="card-info">
                <div className="card-title">{i.title}</div>
                <div className="card-artist">{i.artists.map(a => a.name).join(", ")}</div>
                {i.year && <div className="card-year">{i.year}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <aside className={`detail-panel${selectedId !== null ? " open" : ""}`}>
          <button className="panel-close" onClick={closePanel} aria-label="Close panel">
            ESC ✕
          </button>

          {/* Scrollable content area */}
          <div className="panel-scrollable">
            {releaseLoading && (
              <div className="panel-loading">LOADING…</div>
            )}

            {releaseError && (
              <div className="panel-error">{releaseError}</div>
            )}

            {release && !releaseLoading && (
              <div className="panel-content">
                {/* Cover */}
                <div className="panel-cover">
                  {(release.coverImageUrl ?? release.thumbUrl)
                    ? <img src={release.coverImageUrl ?? release.thumbUrl} alt={release.title} />
                    : (
                      <div className="panel-cover-placeholder">
                        <span>NO IMAGE</span>
                      </div>
                    )
                  }
                </div>

                {/* Title / Meta */}
                <div className="panel-info">
                  <h2 className="panel-title">{release.title}</h2>
                  <div className="panel-artist">
                    {release.artists.map(a => a.name).join(" & ")}
                  </div>
                  {release.year && (
                    <span className="panel-year">{release.year}</span>
                  )}
                </div>

                {/* Tracklist Player — replaces both Tracklist and Videos sections */}
                {release.tracklist.length > 0 && (
                  <div className="panel-section">
                    <div className="section-label">Tracklist</div>
                    <div className="tracklist">
                      {release.tracklist.map((t, idx) => {
                        const videoId = matchTrackToVideoId(t.title, release.videos);
                        const isActive = activeTrackIdx === idx;
                        return (
                          <div
                            key={idx}
                            className={`track-row${videoId ? " playable" : ""}${isActive ? " playing" : ""}`}
                            onClick={() => {
                              if (!videoId) return;
                              if (isActive) togglePlayPause();
                              else playTrack(videoId, idx);
                            }}
                          >
                            {videoId ? (
                              <button
                                className="track-play-btn"
                                aria-label={isActive && isPlaying ? "Pause" : "Play"}
                                onClick={e => {
                                  e.stopPropagation();
                                  if (isActive) togglePlayPause();
                                  else playTrack(videoId, idx);
                                }}
                              >
                                {isActive && isPlaying ? "▮▮" : "▶"}
                              </button>
                            ) : (
                              <span className="track-pos">
                                {t.position ?? String(idx + 1).padStart(2, "0")}
                              </span>
                            )}
                            <span className="track-title">{t.title}</span>
                            {t.duration && <span className="track-dur">{t.duration}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mini-player — glass card footer, visible when a track is active */}
          {activeVideoId && release && (
            <div className="mini-player">
              {/* Blurred album art background */}
              {(release.coverImageUrl ?? release.thumbUrl) && (
                <div className="mini-player-bg" aria-hidden="true">
                  <img src={release.coverImageUrl ?? release.thumbUrl} alt="" />
                </div>
              )}

              {/* Glass content layer */}
              <div className="mini-player-inner">
                {/* Track info row */}
                <div className="mp-top-row">
                  <div className="mp-track-info">
                    {(release.coverImageUrl ?? release.thumbUrl) && (
                      <img
                        className="mp-thumb"
                        src={release.coverImageUrl ?? release.thumbUrl}
                        alt={release.title}
                      />
                    )}
                    <div className="mp-text">
                      <div className="mp-artist-name">
                        {release.artists.map(a => a.name).join(", ")}
                      </div>
                      <div className="mini-player-track">
                        {activeTrackIdx !== null ? release.tracklist[activeTrackIdx]?.title : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div className="mp-progress-section">
                  <span className="mini-player-time">{formatTime(currentTime)}</span>
                  <div
                    className="progress-bar"
                    onClick={handleSeek}
                    role="slider"
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                  >
                    <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <span className="mini-player-time">
                    -{formatTime(Math.max(0, playerDuration - currentTime))}
                  </span>
                </div>

                {/* Playback controls */}
                <div className="mp-controls-row">
                  <button className="mp-glass-btn" onClick={prevTrack} aria-label="Previous track">⏮</button>
                  <button
                    className="mp-glass-btn mp-play-center"
                    onClick={togglePlayPause}
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                  <button className="mp-glass-btn" onClick={nextTrack} aria-label="Next track">⏭</button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
