const API_BASE = "https://api.discogs.com";

type DiscogsCollectionResponse = {
  pagination: { page: number; pages: number; per_page: number; items: number };
  releases: Array<{
    id: number;              // releaseId
    instance_id: number;
    basic_information: {
      title: string;
      year?: number;
      thumb?: string;
      cover_image?: string;
      uri?: string;
      artists?: Array<{ name: string }>;
    };
  }>;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function fetchFullCollection(folderId = 0) {
  const username = requiredEnv("DISCOGS_USERNAME");
  const token = requiredEnv("DISCOGS_TOKEN");
  const userAgent = requiredEnv("DISCOGS_USER_AGENT");

  const perPage = 100;
  let page = 1;
  let pages = 1;

  const all: DiscogsCollectionResponse["releases"] = [];

  while (page <= pages) {
    const url = new URL(`${API_BASE}/users/${encodeURIComponent(username)}/collection/folders/${folderId}/releases`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": userAgent, // Discogs requires this :contentReference[oaicite:8]{index=8}
        "Authorization": `Discogs token=${token}`
      }
    });

    // basic backoff on rate limit
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Discogs error ${res.status}: ${text.slice(0, 300)}`);
    }

    // Discogs provides rate limit headers; you can log them for visibility :contentReference[oaicite:9]{index=9}
    const data = (await res.json()) as DiscogsCollectionResponse;

    pages = data.pagination.pages;
    all.push(...data.releases);
    page += 1;
  }

  return { username, folderId, releases: all };
}
