import { fetchFullCollection } from "../../lib/discogsClient.ts";
import { normalize } from "../../lib/normalize.ts";
import { writeSnapshot } from "../../lib/blobStore.ts";
import type { CollectionSnapshot } from "../../lib/types.ts";

function isAuthorized(request: Request) {
  const ua = request.headers.get("user-agent") || "";
  if (ua.includes("vercel-cron")) return true; // cron UA :contentReference[oaicite:12]{index=12}

  const secret = request.headers.get("x-admin-secret");
  return secret && secret === process.env.ADMIN_SYNC_SECRET;
}

export default {
  async fetch(request: Request) {
    if (!isAuthorized(request)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { username, folderId, releases } = await fetchFullCollection(0);
    const items = normalize(releases);

    const snapshot: CollectionSnapshot = {
      username,
      folderId,
      fetchedAt: new Date().toISOString(),
      totalItems: items.length,
      items
    };

    const blob = await writeSnapshot(snapshot);

    return Response.json({
      ok: true,
      items: items.length,
      fetchedAt: snapshot.fetchedAt,
      blobUrl: blob.url
    });
  }
};
