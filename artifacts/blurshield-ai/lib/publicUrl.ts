export function resolvePublicUrl(
  url: string | null,
  platformId: string,
  platformUrls: Record<string, string>,
): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url, platformUrls[platformId]);
    const browsePrefix = `/api/browse/${platformId}`;
    if (parsed.pathname.startsWith(browsePrefix)) {
      const base = new URL(platformUrls[platformId]);
      const suffix = parsed.pathname.slice(browsePrefix.length) || '/';
      base.pathname = suffix;
      base.search = parsed.search;
      base.hash = parsed.hash;
      return base.toString();
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
