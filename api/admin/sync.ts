import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchFullCollection } from "../../lib/discogsClient.ts";
import { normalize } from "../../lib/normalize.ts";
import { writeSnapshot } from "../../lib/blobStore.ts";
import type { CollectionSnapshot } from "../../lib/types.ts";

function isAuthorized(req: VercelRequest) {
  const ua = (req.headers["user-agent"] as string) || "";
  if (ua.includes("vercel-cron")) return true;

  const secret = req.headers["x-admin-secret"] as string | undefined;
  return secret && secret === process.env.ADMIN_SYNC_SECRET;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    res.status(401).send("Unauthorized");
    return;
  }

  try {
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

    res.status(200).json({
      ok: true,
      items: items.length,
      fetchedAt: snapshot.fetchedAt,
      blobUrl: blob.url
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync error:", msg);
    res.status(500).json({ ok: false, error: msg });
  }
}
