import type { Channel } from "../types";

function getAttribute(line: string, attr: string): string | undefined {
  const regex = new RegExp(`${attr}="([^"]*)"`);
  return line.match(regex)?.[1];
}

function createChannelId({
  name,
  url,
  tvgId,
}: {
  name: string;
  url: string;
  tvgId?: string;
}): string {
  const base = `${tvgId || name}-${url}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "channel";
}

function getChannelName(line: string): string {
  const commaIndex = line.lastIndexOf(",");
  if (commaIndex === -1) return "Unnamed channel";

  return line.slice(commaIndex + 1).trim() || "Unnamed channel";
}

export function parseM3u(content: string): Channel[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const channels: Channel[] = [];
  const idCounts = new Map<string, number>();
  const usedIds = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];

    if (!currentLine.startsWith("#EXTINF")) {
      continue;
    }

    const nextLine = lines[i + 1];

    if (!nextLine || nextLine.startsWith("#")) {
      continue;
    }

    // Playlists often repeat the same entry; suffix repeats so ids stay
    // unique (they are used as React keys and for selection).
    const baseId = createChannelId({
      name: getChannelName(currentLine),
      url: nextLine,
      tvgId: getAttribute(currentLine, "tvg-id"),
    });
    let id = baseId;
    let suffix = idCounts.get(baseId) ?? 1;
    while (usedIds.has(id)) {
      suffix += 1;
      id = `${baseId}-${suffix}`;
    }
    idCounts.set(baseId, suffix);
    usedIds.add(id);

    channels.push({
      id,
      name: getChannelName(currentLine),
      url: nextLine,
      logo: getAttribute(currentLine, "tvg-logo"),
      groupTitle: getAttribute(currentLine, "group-title") || "No category",
      tvgId: getAttribute(currentLine, "tvg-id"),
      tvgName: getAttribute(currentLine, "tvg-name"),
    });
  }

  return channels;
}
