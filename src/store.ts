import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ALL_CHANNELS_CATEGORY } from "./features/channels/constants";
import type { Channel } from "./features/playlists/types";
import type { Profile } from "./features/playlists/types";
import { fetchPlaylist } from "./features/playlists/services/fetchPlaylist";

type AppState = {
  hasHydrated: boolean;
  profile: Profile | null;
  channels: Channel[];
  selectedCategory: string;
  selectedChannel: Channel | null;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  notice: string | null;
  lastLoadedAt: string | null;
  // Transient (not persisted): the player window is fullscreen.
  isPlayerFullscreen: boolean;
};

type AppActions = {
  createProfile: (data: { name: string; playlistUrl: string }) => Promise<void>;
  resetProfile: () => void;
  clearError: () => void;
  clearNotice: () => void;
  setHasHydrated: (value: boolean) => void;
  setSelectedCategory: (category: string) => void;
  setSelectedChannel: (channel: Channel | null) => void;
  setSearchQuery: (query: string) => void;
  setPlayerFullscreen: (value: boolean) => void;
  refreshPlaylist: () => Promise<void>;
};

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      profile: null,
      channels: [],
      selectedCategory: ALL_CHANNELS_CATEGORY,
      selectedChannel: null,
      searchQuery: "",
      isLoading: false,
      error: null,
      notice: null,
      lastLoadedAt: null,
      isPlayerFullscreen: false,

      createProfile: async (data) => {
        set({ isLoading: true, error: null, notice: null });
        try {
          const channels = await fetchPlaylist(data.playlistUrl);
          const now = new Date().toISOString();
          const previousProfile = get().profile;

          set({
            profile: {
              id: previousProfile?.id ?? crypto.randomUUID(),
              name: data.name.trim(),
              playlistUrl: data.playlistUrl.trim(),
              createdAt: previousProfile?.createdAt ?? now,
              updatedAt: now,
            },
            channels,
            selectedCategory: ALL_CHANNELS_CATEGORY,
            selectedChannel: channels[0] ?? null,
            searchQuery: "",
            isLoading: false,
            error: null,
            notice: `Playlist loaded: ${channels.length} channels available.`,
            lastLoadedAt: now,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            notice: null,
            isLoading: false,
          });
        }
      },

      resetProfile: () => {
        set({
          profile: null,
          channels: [],
          selectedCategory: ALL_CHANNELS_CATEGORY,
          selectedChannel: null,
          searchQuery: "",
          error: null,
          notice: null,
          lastLoadedAt: null,
        });
      },

      clearError: () => set({ error: null }),
      clearNotice: () => set({ notice: null }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),
      setSelectedChannel: (channel) => set({ selectedChannel: channel }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setPlayerFullscreen: (value) => set({ isPlayerFullscreen: value }),

      refreshPlaylist: async () => {
        const { profile, selectedChannel } = get();
        if (!profile) return;

        set({ isLoading: true, error: null, notice: null });

        try {
          const channels = await fetchPlaylist(profile.playlistUrl);
          const now = new Date().toISOString();
          const nextSelectedChannel = selectedChannel
            ? channels.find((channel) => channel.id === selectedChannel.id) ?? null
            : channels[0] ?? null;

          set({
            channels,
            selectedChannel: nextSelectedChannel,
            isLoading: false,
            error: null,
            notice: `Playlist updated: ${channels.length} channels synced.`,
            lastLoadedAt: now,
            profile: {
              ...profile,
              updatedAt: now,
            },
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Unknown error",
            notice: null,
            isLoading: false,
          });
        }
      },
    }),
    {
      name: "libre-iptv-2-app-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        profile: state.profile,
        channels: state.channels,
        lastLoadedAt: state.lastLoadedAt,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
