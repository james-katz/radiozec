import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { config } from './config';

export interface DownloadResult {
  filePath: string;
  youtubeId: string;
  title: string;
  duration: number;
}

/**
 * Download audio from a YouTube video using yt-dlp.
 * Returns the path to the downloaded file.
 * Skips download if a file for the given youtubeId already exists.
 */
export async function downloadAudio(youtubeId: string): Promise<DownloadResult> {
  const mediaDir = config.mediaDir;

  // Ensure media directory exists
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  const outputTemplate = path.join(mediaDir, `${youtubeId}.%(ext)s`);
  const expectedPath = path.join(mediaDir, `${youtubeId}.${config.audioFormat}`);

  // Deduplication — skip download if file already exists
  if (fs.existsSync(expectedPath)) {
    console.log(`[Downloader] Cache hit: ${youtubeId}`);
    const duration = await probeDuration(expectedPath);
    return {
      filePath: expectedPath,
      youtubeId,
      title: youtubeId, // Will be overridden by caller with oEmbed data
      duration,
    };
  }

  console.log(`[Downloader] Downloading: ${youtubeId} (format: ${config.audioFormat}, bitrate: ${config.audioBitrate})`);

  const url = `https://www.youtube.com/watch?v=${youtubeId}`;

  // Check for cookies file (needed on VPS/datacenter IPs to bypass YouTube bot detection)
  const cookiesPath = path.resolve(__dirname, '..', 'cookies.txt');
  const hasCookies = fs.existsSync(cookiesPath);

  return new Promise<DownloadResult>((resolve, reject) => {
    const args = [
      url,
      '-x',                                // Extract audio
      '--audio-format', config.audioFormat, // Target format
      '--audio-quality', '0',              // Best quality
      '-o', outputTemplate,                 // Output path
      '--no-playlist',                      // Don't download playlists
      '--no-warnings',                      // Suppress warnings
      '--print-json',                       // Print metadata as JSON to stdout
      '--no-simulate',                      // Actually download (needed with --print-json)
      '--js-runtimes', 'node',             // Use Node.js for YouTube JS challenges
    ];

    // Add cookies if available
    if (hasCookies) {
      args.push('--cookies', cookiesPath);
    }

    let stdout = '';
    let stderr = '';

    const child: ChildProcess = spawn('yt-dlp', args);

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Downloader] yt-dlp failed (exit ${code}): ${stderr}`);
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
        return;
      }

      // Parse the JSON output for metadata
      let title = youtubeId;
      let duration = 0;

      try {
        const meta = JSON.parse(stdout.trim());
        title = meta.title || meta.fulltitle || youtubeId;
        duration = meta.duration || 0;
      } catch {
        console.warn('[Downloader] Could not parse yt-dlp JSON output');
      }

      // Find the actual output file (extension might vary)
      const actualPath = findDownloadedFile(mediaDir, youtubeId);
      if (!actualPath) {
        reject(new Error(`Downloaded file not found for ${youtubeId}`));
        return;
      }

      console.log(`[Downloader] Complete: ${title} (${duration}s) → ${actualPath}`);

      resolve({
        filePath: actualPath,
        youtubeId,
        title,
        duration,
      });
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}. Is yt-dlp installed?`));
    });
  });
}

/**
 * Find the downloaded file for a given youtubeId.
 * yt-dlp might produce a file with a different extension than expected.
 */
function findDownloadedFile(dir: string, youtubeId: string): string | null {
  const files = fs.readdirSync(dir);
  const match = files.find((f) => f.startsWith(youtubeId + '.'));
  return match ? path.join(dir, match) : null;
}

/**
 * Get the duration of an audio file using ffprobe.
 */
async function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ]);

    let stdout = '';
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.on('close', () => {
      const duration = parseFloat(stdout.trim());
      resolve(isNaN(duration) ? 0 : duration);
    });

    child.on('error', () => resolve(0));
  });
}

/**
 * Clean up old audio files from the media directory.
 * Removes files older than the configured cleanup threshold.
 */
export function cleanupMediaFiles(): void {
  const mediaDir = config.mediaDir;
  if (!fs.existsSync(mediaDir)) return;

  const maxAgeMs = config.mediaCleanupHours * 60 * 60 * 1000;
  const now = Date.now();
  let cleaned = 0;

  const files = fs.readdirSync(mediaDir);
  for (const file of files) {
    // Never delete the fallback directory
    if (file === 'fallback') continue;

    const filePath = path.join(mediaDir, file);
    const stat = fs.statSync(filePath);

    if (stat.isFile() && (now - stat.mtimeMs) > maxAgeMs) {
      fs.unlinkSync(filePath);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Downloader] Cleaned up ${cleaned} old audio file(s)`);
  }
}
