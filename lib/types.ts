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
