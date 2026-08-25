import https from 'https';
import http from 'http';

export interface YouTubeVideoMeta {
  videoId: string;
  title: string;
  thumbnail: string;
  authorName: string;
}

/**
 * Parse a YouTube video ID from various URL formats.
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/,
 *           youtube.com/embed/, music.youtube.com/watch?v=
 */
export function parseYouTubeUrl(input: string): string | null {
  const trimmed = input.trim();

  // Direct video ID (11 chars, alphanumeric + - + _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.replace('www.', '').replace('m.', '');

    // youtu.be/VIDEO_ID
    if (hostname === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return isValidVideoId(id) ? id : null;
    }

    // youtube.com or music.youtube.com
    if (hostname === 'youtube.com' || hostname === 'music.youtube.com') {
      // /watch?v=VIDEO_ID
      const vParam = url.searchParams.get('v');
      if (vParam && isValidVideoId(vParam)) return vParam;

      // /shorts/VIDEO_ID, /embed/VIDEO_ID, /v/VIDEO_ID
      const pathMatch = url.pathname.match(/^\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch && isValidVideoId(pathMatch[2])) return pathMatch[2];

      // /live/VIDEO_ID
      const liveMatch = url.pathname.match(/^\/live\/([a-zA-Z0-9_-]{11})/);
      if (liveMatch && isValidVideoId(liveMatch[1])) return liveMatch[1];
    }
  } catch {
    // Not a valid URL, try regex fallback
    const idMatch = trimmed.match(/(?:v=|\/(?:shorts|embed|v|live)\/)([a-zA-Z0-9_-]{11})/);
    if (idMatch && isValidVideoId(idMatch[1])) return idMatch[1];
  }

  return null;
}

function isValidVideoId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

/**
 * Fetch video metadata via YouTube oEmbed API (no API key needed).
 */
export async function fetchVideoMeta(videoId: string): Promise<YouTubeVideoMeta | null> {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  return new Promise((resolve) => {
    const req = https.get(oembedUrl, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        res.resume();
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            videoId,
            title: json.title || 'Untitled',
            thumbnail: json.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            authorName: json.author_name || 'Unknown',
          });
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

/**
 * Extract a YouTube URL from a transaction memo string.
 * The memo may contain just a URL, or text with a URL embedded.
 */
export function extractYouTubeUrlFromMemo(memo: string): string | null {
  // Try the whole memo as a URL first
  const directId = parseYouTubeUrl(memo);
  if (directId) return directId;

  // Try to find a URL in the text
  const urlRegex = /https?:\/\/[^\s]+/g;
  const matches = memo.match(urlRegex);
  if (matches) {
    for (const match of matches) {
      const id = parseYouTubeUrl(match);
      if (id) return id;
    }
  }

  return null;
}
