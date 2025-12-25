import { put, head } from "@vercel/blob";
import type { CollectionSnapshot } from "./types";

const SNAPSHOT_PATH = "public/collection.json";

export async function writeSnapshot(snapshot: CollectionSnapshot) {
  // Blob SDK put supports allowOverwrite and addRandomSuffix :contentReference[oaicite:10]{index=10}
  return put(SNAPSHOT_PATH, JSON.stringify(snapshot), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 300
  });
}

export async function getSnapshotUrl(): Promise<string | null> {
  try {
    const meta = await head(SNAPSHOT_PATH);
    return meta.url;
  } catch {
    return null;
  }
}
