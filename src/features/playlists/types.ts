export type Channel = {
  id: string;
  name: string;
  url: string;
  logo?: string;
  groupTitle?: string;
  tvgId?: string;
  tvgName?: string;
};

export type Profile = {
  id: string;
  name: string;
  playlistUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type Playlist = {
  profileId: string;
  channels: Channel[];
  categories: string[];
  loadedAt: string;
};
