import { useEffect, useMemo, useState } from "react";
import type { CollectionSnapshot } from "../lib/types";
import "./App.css";

export default function App() {
  const [data, setData] = useState<CollectionSnapshot | null>(null);
  const [q, setQ] = useState("");

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

  if (!data) return <div style={{ padding: 24 }}>Loading… (run sync if needed)</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>{data.username} — Discogs Collection</h1>
      <div style={{ opacity: 0.7, marginBottom: 12 }}>
        {data.totalItems} items • updated {new Date(data.fetchedAt).toLocaleString()}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search artist or title…"
        style={{ width: "100%", padding: 12, marginBottom: 16 }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {items.map((i) => (
          <a key={i.instanceId} href={i.discogsUri} target="_blank" rel="noreferrer"
             style={{ border: "1px solid #333", borderRadius: 8, padding: 10, textDecoration: "none", color: "inherit" }}>
            {i.thumbUrl && <img src={i.thumbUrl} alt="" style={{ width: "100%", borderRadius: 6 }} />}
            <div style={{ marginTop: 8, fontWeight: 700 }}>{i.title}</div>
            <div style={{ opacity: 0.8, fontSize: 14 }}>{i.artists.map(a => a.name).join(", ")}</div>
            <div style={{ opacity: 0.6, fontSize: 13 }}>{i.year ?? ""}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
