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
      return (i.title.toLowerCase().includes(query) || artist.includes(query));
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
        setReleaseError(err instanceof Error ? err.message : "Failed to load release");
        setReleaseLoading(false);
      });
  }

  function closePanel() {
    setSelectedId(null);
    setRelease(null);
    setReleaseError(null);
  }

  if (!data) return <div style={{ padding: 24 }}>Loading… (run sync if needed)</div>;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Left: collection */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1>{data.username} — Discogs Collection</h1>
        <div style={{ opacity: 0.7, marginBottom: 12 }}>
          {data.totalItems} items • updated {new Date(data.fetchedAt).toLocaleString()}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search artist or title…"
          style={{ width: "100%", padding: 12, marginBottom: 16, boxSizing: "border-box" }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
          {items.map((i) => (
            <div
              key={i.instanceId}
              className={`card${selectedId === i.releaseId ? " selected" : ""}`}
              onClick={() => handleCardClick(i.releaseId)}
            >
              {i.thumbUrl && <img src={i.thumbUrl} alt="" style={{ width: "100%", borderRadius: 6 }} />}
              <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13 }}>{i.title}</div>
              <div style={{ opacity: 0.8, fontSize: 12 }}>{i.artists.map(a => a.name).join(", ")}</div>
              <div style={{ opacity: 0.6, fontSize: 12 }}>{i.year ?? ""}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className={`panel${selectedId !== null ? " open" : ""}`}>
        <button
          onClick={closePanel}
          style={{
            position: "absolute", top: 16, right: 16,
            background: "none", border: "none", color: "inherit",
            fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 4
          }}
          aria-label="Close panel"
        >
          ×
        </button>

        {releaseLoading && (
          <div style={{ paddingTop: 48, textAlign: "center", opacity: 0.7 }}>Loading…</div>
        )}

        {releaseError && (
          <div style={{ paddingTop: 48, color: "#f87171" }}>{releaseError}</div>
        )}

        {release && !releaseLoading && (
          <div style={{ paddingTop: 8 }}>
            {(release.coverImageUrl ?? release.thumbUrl) && (
              <img
                src={release.coverImageUrl ?? release.thumbUrl}
                alt=""
                style={{ width: "100%", borderRadius: 8, marginBottom: 16 }}
              />
            )}

            <h2 style={{ margin: "0 0 4px", fontSize: 18, paddingRight: 28 }}>{release.title}</h2>
            <div style={{ opacity: 0.8, marginBottom: 4 }}>
              {release.artists.map(a => a.name).join(" & ")}
            </div>
            {release.year && (
              <div style={{ opacity: 0.6, fontSize: 14, marginBottom: 16 }}>{release.year}</div>
            )}

            {release.tracklist.length > 0 && (
              <>
                <hr style={{ borderColor: "#333", margin: "12px 0" }} />
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Tracklist</div>
                <div style={{ fontSize: 13 }}>
                  {release.tracklist.map((t, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex", justifyContent: "space-between", gap: 8,
                        padding: "4px 0", borderBottom: "1px solid #222"
                      }}
                    >
                      <span style={{ opacity: 0.5, flexShrink: 0, minWidth: 24 }}>{t.position ?? ""}</span>
                      <span style={{ flex: 1 }}>{t.title}</span>
                      {t.duration && <span style={{ opacity: 0.5, flexShrink: 0 }}>{t.duration}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {(() => {
              const embeds = release.videos
                .map(v => ({ title: v.title, embedUrl: getYouTubeEmbedUrl(v.uri) }))
                .filter((v): v is { title: string; embedUrl: string } => v.embedUrl !== null);

              if (embeds.length === 0) return null;

              return (
                <>
                  <hr style={{ borderColor: "#333", margin: "16px 0 12px" }} />
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Videos</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {embeds.map((v, idx) => (
                      <div key={idx}>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{v.title}</div>
                        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 6 }}>
                          <iframe
                            src={v.embedUrl}
                            title={v.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
