import { useEffect, useMemo, useState } from "react";
import type { CollectionSnapshot, ReleaseDetails } from "../lib/types";
import "./App.css";

function getYouTubeEmbedUrl(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (!url.hostname.includes("youtube.com") && !url.hostname.includes("youtu.be")) return null;
    const v = url.searchParams.get("v");
    if (!v) return null;
    return `https://www.youtube.com/embed/${v}`;
  } catch {
    return null;
  }
}

export default function App() {
  const [data, setData] = useState<CollectionSnapshot | null>(null);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [release, setRelease] = useState<ReleaseDetails | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/collection")
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    const query = q.trim().toLowerCase();
    if (!query) return data.items;
    return data.items.filter(i => {
      const artist = i.artists.map(a => a.name).join(" ").toLowerCase();
      return i.title.toLowerCase().includes(query) || artist.includes(query);
    });
  }, [data, q]);

  function handleCardClick(releaseId: number) {
    if (releaseId === selectedId) {
      setSelectedId(null);
      setRelease(null);
      return;
    }
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

  const embeds = release
    ? release.videos
        .map(v => ({ title: v.title, embedUrl: getYouTubeEmbedUrl(v.uri) }))
        .filter((v): v is { title: string; embedUrl: string } => v.embedUrl !== null)
    : [];

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="site-header">
        <div className="header-inner">
          <div className="header-brand">
            <div className="brand-name">{data.username}</div>
            <div className="brand-sub">Record Collection</div>
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

              {/* Tracklist */}
              {release.tracklist.length > 0 && (
                <div className="panel-section">
                  <div className="section-label">Tracklist</div>
                  <div className="tracklist">
                    {release.tracklist.map((t, idx) => (
                      <div key={idx} className="track-row">
                        <span className="track-pos">{t.position ?? String(idx + 1).padStart(2, "0")}</span>
                        <span className="track-title">{t.title}</span>
                        {t.duration && <span className="track-dur">{t.duration}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Videos */}
              {embeds.length > 0 && (
                <div className="panel-section">
                  <div className="section-label">Videos</div>
                  <div className="videos">
                    {embeds.map((v, idx) => (
                      <div key={idx}>
                        <div className="video-label">{v.title}</div>
                        <div className="video-frame">
                          <iframe
                            src={v.embedUrl}
                            title={v.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
