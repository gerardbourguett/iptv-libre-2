import { useState } from "react";

type CreateProfileFormProps = {
  isLoading: boolean;
  error: string | null;
  onSubmit: (data: { name: string; playlistUrl: string }) => void;
};

export function CreateProfileForm({
  isLoading,
  error,
  onSubmit,
}: CreateProfileFormProps) {
  const [name, setName] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, playlistUrl });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="profile-name"
          className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary"
        >
          Profile name{" "}
          <span aria-hidden="true" className="text-accent-text">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </label>
        <input
          id="profile-name"
          className="app-input px-4 py-2.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My IPTV"
          required
          aria-required="true"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="profile-playlist-url"
          className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-secondary"
        >
          M3U playlist URL{" "}
          <span aria-hidden="true" className="text-accent-text">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </label>
        <input
          id="profile-playlist-url"
          className="mono app-input px-4 py-2.5 text-sm"
          value={playlistUrl}
          onChange={(e) => setPlaylistUrl(e.target.value)}
          placeholder="https://example.com/playlist.m3u"
          required
          aria-required="true"
          type="url"
          inputMode="url"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3"
        >
          <p className="text-xs font-medium text-danger">{error}</p>
        </div>
      )}

      <button
        className="btn-primary relative mt-1 overflow-hidden px-5 py-3 text-sm"
        type="submit"
        disabled={isLoading}
      >
        {isLoading && (
          <span className="absolute inset-0 btn-shimmer" />
        )}
        <span className="relative">
          {isLoading ? "Connecting..." : "Start watching"}
        </span>
      </button>
    </form>
  );
}
