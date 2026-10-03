import { parseM3u } from "../parser/parseM3u";
import type { Channel } from "../types";

function normalizePlaylistUrl(rawUrl: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a valid playlist URL");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("The playlist must use http or https");
  }

  return parsedUrl.toString();
}

export async function fetchPlaylist(url: string): Promise<Channel[]> {
  const normalizedUrl = normalizePlaylistUrl(url);
  let response: Response;

  try {
    response = await fetch(normalizedUrl, {
      headers: {
        Accept: "application/x-mpegURL, application/vnd.apple.mpegurl, text/plain",
      },
    });
  } catch {
    throw new Error(
      "Could not connect to the playlist. Check the URL, your connection, or whether the server is blocking access.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Could not load the playlist (HTTP ${response.status})`,
    );
  }

  const content = await response.text();

  if (!content.includes("#EXTINF")) {
    throw new Error(
      "The file does not appear to be a valid M3U playlist",
    );
  }

  const channels = parseM3u(content);

  if (channels.length === 0) {
    throw new Error(
      "The playlist loaded, but it doesn't contain any usable channels.",
    );
  }

  return channels;
}
