import net from 'net';
import { config } from './config';

/**
 * Liquidsoap telnet control client.
 * Communicates with Liquidsoap's server interface over TCP.
 */
export class LiquidsoapClient {
  private host: string;
  private port: number;

  constructor(host?: string, port?: number) {
    this.host = host || config.liquidsoapHost;
    this.port = port || config.liquidsoapPort;
  }

  /**
   * Send a command to Liquidsoap and return the response.
   */
  private async sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      let response = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          client.destroy();
          reject(new Error(`[Liquidsoap] Timeout sending command: ${command}`));
        }
      }, 5000);

      client.connect(this.port, this.host, () => {
        client.write(command + '\n');
        // Send quit after command to close cleanly
        client.write('quit\n');
      });

      client.on('data', (data) => {
        response += data.toString();
      });

      client.on('end', () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          // Strip the "Bye!" from quit and the trailing "END" marker
          const cleaned = response
            .replace(/\r?\nBye!\r?\n?/g, '')
            .replace(/\r?\nEND\r?\n?$/g, '')
            .trim();
          resolve(cleaned);
        }
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error(`[Liquidsoap] Connection error: ${err.message}`));
        }
      });
    });
  }

  /**
   * Push an audio file to the request queue.
   * The file must be accessible to Liquidsoap (local filesystem).
   * Optionally annotate with metadata.
   */
  async pushTrack(
    filePath: string,
    metadata?: { title?: string; artist?: string; youtubeId?: string }
  ): Promise<string> {
    let uri = filePath;

    // Use annotate protocol to pass metadata
    if (metadata) {
      const annotations: string[] = [];
      if (metadata.title) annotations.push(`title="${metadata.title}"`);
      if (metadata.artist) annotations.push(`artist="${metadata.artist}"`);
      if (metadata.youtubeId) annotations.push(`youtube_id="${metadata.youtubeId}"`);
      if (annotations.length > 0) {
        uri = `annotate:${annotations.join(',')}:${filePath}`;
      }
    }

    console.log(`[Liquidsoap] Pushing track: ${uri}`);
    const response = await this.sendCommand(`queue.push ${uri}`);
    return response;
  }

  /**
   * Push a jingle to the jingle queue.
   */
  async pushJingle(filePath: string): Promise<string> {
    console.log(`[Liquidsoap] Pushing jingle: ${filePath}`);
    const response = await this.sendCommand(`jingles.push ${filePath}`);
    return response;
  }

  /**
   * Skip the currently playing track.
   */
  async skip(): Promise<string> {
    console.log('[Liquidsoap] Skipping current track');
    const response = await this.sendCommand('radio.skip');
    return response;
  }

  /**
   * Get the list of available commands (useful for debugging).
   */
  async help(): Promise<string> {
    return this.sendCommand('help');
  }

  /**
   * Get remaining time of the current source.
   */
  async getRemainingTime(): Promise<number> {
    try {
      const response = await this.sendCommand('radio.remaining');
      const seconds = parseFloat(response);
      return isNaN(seconds) ? 0 : seconds;
    } catch {
      return 0;
    }
  }

  /**
   * Check if Liquidsoap is reachable.
   */
  async isAlive(): Promise<boolean> {
    try {
      const response = await this.sendCommand('version');
      return response.length > 0;
    } catch {
      return false;
    }
  }
}
