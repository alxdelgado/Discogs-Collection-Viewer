import { getSnapshotUrl } from "../../lib/blobStore.ts";

export default {
  async fetch() {
    const url = await getSnapshotUrl();
    if (!url) return new Response("Snapshot not found. Run /api/admin/sync first.", { status: 404 });

    const res = await fetch(url);
    const body = await res.text();

    return new Response(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, s-maxage=300, stale-while-revalidate=3600"
      }
    });
  }
};
