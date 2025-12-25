import type { CollectionItem } from "./types";

export function normalize(releases: any[]): CollectionItem[] {
  return releases.map((r) => {
    const bi = r.basic_information ?? {};
    return {
      instanceId: r.instance_id,
      releaseId: r.id,
      title: bi.title ?? "Unknown",
      artists: (bi.artists ?? []).map((a: any) => ({ name: a.name })),
      year: bi.year,
      thumbUrl: bi.thumb,
      coverImageUrl: bi.cover_image,
      discogsUri: bi.uri
    };
  });
}
