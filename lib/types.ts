export type CollectionItem = {
  instanceId: number;
  releaseId: number;
  title: string;
  artists: { name: string }[];
  year?: number;
  thumbUrl?: string;
  coverImageUrl?: string;
  discogsUri?: string;
};

export type CollectionSnapshot = {
  username: string;
  folderId: number;
  fetchedAt: string;
  totalItems: number;
  items: CollectionItem[];
};

export type ReleaseDetails = { 
  releaseId: number;
  title: string;
  artists: { name: string }[];
  year?: number;
  thumbUrl?: string;
  coverImageUrl?: string;
  discogsUri?: string;

  tracklist: { position?: string; title: string; duration?: string }[];

  videos: { title: string; uri: string; duration?: number; embed?: boolean }[];

  fetchedAt: string;
};