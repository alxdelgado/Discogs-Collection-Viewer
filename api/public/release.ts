import type { VercelRequest, VercelResponse } from "@vercel/node";
import { head, put } from "@vercel/blob";

type PublicReleaseVideo = {
  title: string;
  uri: string; // often YouTube URL if Discogs has it
  duration?: number;
  embed?: boolean;
};

type PublicReleaseTrack = {
  position?: string;
  title: string;
  duration?: string;
};

type PublicReleaseDetails = {
  releaseId: number;
  title: string;
  year?: number;
  artists: { name: string }[];
  genres?: string[];
  styles?: string[];
  notes?: string;

  tracklist: PublicReleaseTrack[];
  videos: PublicReleaseVideo[];

  thumbUrl?: string;
  coverImageUrl?: string;

  fetchedAt: string;
};

function getBaseUrl(req: VercelRequest) {
  const proto = (req.headers["x-forwarded-proto"] as string) || "http";
  const host = (req.headers.host as string) || "localhost:3000";
  return `${proto}://${host}`;
}

let cachedAllowlist: { set: Set<number>; fetchedAtMs: number } | null = null;
const ALLOWLIST_TTL_MS = 5 * 60 * 1000; // 5 minutes (local + prod friendly)

async function getAllowedReleaseIds(req: VercelRequest): Promise<Set<number>> {
  const now = Date.now();
  if (cachedAllowlist && now - cachedAllowlist.fetchedAtMs < ALLOWLIST_TTL_MS) {
    return cachedAllowlist.set;
  }

  const baseUrl = getBaseUrl(req);
  const resp = await fetch(`${baseUrl}/api/public/collection`, {
    headers: { "accept": "application/json" },
  });
  if (!resp.ok) throw new Error(`Failed to load collection snapshot: ${resp.status}`);

  const data = await resp.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const set = new Set<number>();

  for (const it of items) {
    const id = Number(it?.releaseId);
    if (Number.isFinite(id)) set.add(id);
  }

  cachedAllowlist = { set, fetchedAtMs: now };
  return set;
}

function normalizeDiscogsRelease(raw: any): Omit<PublicReleaseDetails, "fetchedAt"> {
  // Discogs release objects commonly include tracklist + videos when present.
  // (Tracklist/videos existence aligns with Discogs client models too.) :contentReference[oaicite:2]{index=2}

  const releaseId = Number(raw?.id);
  const title = String(raw?.title ?? "");
  const year = raw?.year != null ? Number(raw.year) : undefined;

  const artists =
    Array.isArray(raw?.artists) ? raw.artists.map((a: any) => ({ name: String(a?.name ?? "") })) : [];

  const images = Array.isArray(raw?.images) ? raw.images : [];
  const primary = images.find((img: any) => img?.type === "primary") ?? images[0];

  const thumbUrl = primary?.uri150 ? String(primary.uri150) : undefined;
  const coverImageUrl = primary?.uri ? String(primary.uri) : undefined;

  const tracklist: PublicReleaseTrack[] = Array.isArray(raw?.tracklist)
    ? raw.tracklist.map((t: any) => ({
        position: t?.position ? String(t.position) : undefined,
        title: String(t?.title ?? ""),
        duration: t?.duration ? String(t.duration) : undefined,
      }))
    : [];

  const videos: PublicReleaseVideo[] = Array.isArray(raw?.videos)
    ? raw.videos.map((v: any) => ({
        title: String(v?.title ?? ""),
        uri: String(v?.uri ?? ""),
        duration: v?.duration != null ? Number(v.duration) : undefined,
        embed: v?.embed != null ? Boolean(v.embed) : undefined,
      }))
    : [];

  return {
    releaseId,
    title,
    year,
    artists,
    genres: Array.isArray(raw?.genres) ? raw.genres.map(String) : undefined,
    styles: Array.isArray(raw?.styles) ? raw.styles.map(String) : undefined,
    notes: raw?.notes ? String(raw.notes) : undefined,
    tracklist,
    videos,
    thumbUrl,
    coverImageUrl,
  };
}

async function fetchDiscogsRelease(releaseId: number) {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) throw new Error("Missing DISCOGS_TOKEN env var");

  const resp = await fetch(`https://api.discogs.com/releases/${releaseId}`, {
    headers: {
      "Authorization": `Discogs token=${token}`,
      // Discogs likes a User-Agent; set something identifiable
      "User-Agent": "discogs-collection-viewer/1.0 (+https://github.com/alxdelgado/Discogs-Collection-Viewer)",
      "Accept": "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Discogs release fetch failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

function errToString(err: unknown) {
  if (err instanceof Error) return `${err.name}: ${err.message}\n${err.stack ?? ""}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method Not Allowed" });
      return;
    }

    const releaseId = Number(req.query.releaseId);
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      res.status(400).json({ ok: false, error: "Invalid releaseId" });
      return;
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );

    const allowed = await getAllowedReleaseIds(req);
    if (!allowed.has(releaseId)) {
      res.status(404).json({ ok: false, error: "Release not found in collection" });
      return;
    }

    const cachePath = `public/releases/${releaseId}.json`;

    // 1) Try Blob cache
    try {
      const meta = await head(cachePath);
      const cachedResp = await fetch(meta.url);
      if (cachedResp.ok) {
        const cachedJson = await cachedResp.json();
        res.status(200).json({ ...cachedJson, _debugSource: "blob" }); // dev-only
        return;
      }
    } catch (e) {
      // cache miss is fine; but log unexpected blob errors during dev
      console.warn("Blob cache miss or error:", errToString(e));
    }

    // 2) Fetch from Discogs, normalize, store, return
    const raw = await fetchDiscogsRelease(releaseId);
    const normalized = normalizeDiscogsRelease(raw);

    const payload: PublicReleaseDetails = {
      ...normalized,
      fetchedAt: new Date().toISOString(),
    };

    await put(cachePath, JSON.stringify(payload), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60 * 60 * 24 * 30,
    });

    res.status(200).json({ ...payload, _debugSource: "discogs" }); // dev-only
  } catch (err) {
    const msg = errToString(err);
    console.error("release endpoint error:", msg);

    // IMPORTANT: return something readable in dev
    res.status(500).setHeader("content-type", "text/plain; charset=utf-8");
    res.end(`release endpoint error:\n${msg}`);
  }
}
