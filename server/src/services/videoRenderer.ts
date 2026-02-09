import { spawn } from 'child_process';
import { pool } from '../db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface VideoConfig {
  preset: string;
  visualizer: string;
  effects: Record<string, any>;
  intensities: Record<string, number>;
  textLayers: any[];
  backgroundType: 'gradient' | 'image' | 'video';
  customImage?: string;
  customAlbumArt?: string;
  videoUrl?: string;
}

// Platform-specific font paths
const FONT_PATHS = {
  win32: 'C:\\Windows\\Fonts\\arial.ttf',
  darwin: '/System/Library/Fonts/Helvetica.ttc',
  linux: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
};

/**
 * Start rendering a video project in the background
 */
export async function startVideoRender(projectId: string, songId: string, userId: string, config: VideoConfig): Promise<void> {
  console.log(`[VideoRenderer] Starting render for project ${projectId}`);

  // Check if FFmpeg is available
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    await failProject(projectId, 'FFmpeg is not available on the server. Please install FFmpeg to enable video rendering.');
    return;
  }

  try {
    // Get song details with audio URL
    const songResult = await pool.query(
      'SELECT * FROM songs WHERE id = ?',
      [songId]
    );

    if (songResult.rows.length === 0) {
      await failProject(projectId, 'Song not found');
      return;
    }

    const song = songResult.rows[0];

    // Mark as rendering
    await updateProgress(projectId, 'starting', 0);

    // Start rendering in background (don't await)
    renderVideo(projectId, song, config).catch(async (error) => {
      console.error(`[VideoRenderer] Render failed for project ${projectId}:`, error);
      await failProject(projectId, error instanceof Error ? error.message : 'Unknown error');
    });
  } catch (error) {
    console.error(`[VideoRenderer] Failed to start render for project ${projectId}:`, error);
    await failProject(projectId, error instanceof Error ? error.message : 'Failed to start render');
  }
}

/**
 * Check if FFmpeg is available on the system
 */
async function checkFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    ffmpeg.on('error', () => resolve(false));
    ffmpeg.on('close', (code) => resolve(code === 0));
    setTimeout(() => resolve(false), 5000);
  });
}

/**
 * Render video using FFmpeg
 */
async function renderVideo(projectId: string, song: any, config: VideoConfig): Promise<void> {
  const tempDir = path.join(__dirname, '../../temp', projectId);

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    await updateProgress(projectId, 'fetching_audio', 5);

    const audioUrl = song.audio_url;
    if (!audioUrl) {
      throw new Error('Song has no audio file');
    }

    // Determine audio source path
    let audioPath = '';

    if (audioUrl.startsWith('http')) {
      // Download audio from URL
      audioPath = path.join(tempDir, 'audio.mp3');
      await downloadFile(audioUrl, audioPath);
    } else if (audioUrl.startsWith('/audio/')) {
      // Local audio file - resolve from public directory
      // Extract the full path after /audio/ to preserve subdirectory structure
      const audioRelativePath = audioUrl.replace('/audio/', '');
      const localAudioPath = path.join(__dirname, '../../public/audio', audioRelativePath);
      if (fs.existsSync(localAudioPath)) {
        audioPath = localAudioPath;
      } else {
        throw new Error(`Audio file not found: ${audioUrl} (looked for: ${localAudioPath})`);
      }
    } else {
      throw new Error(`Unsupported audio URL format: ${audioUrl}`);
    }

    await updateProgress(projectId, 'analyzing_audio', 10);

    // Get audio duration
    const duration = await getAudioDuration(audioPath);
    console.log(`[VideoRenderer] Audio duration: ${duration}s for project ${projectId}`);

    await updateProgress(projectId, 'preparing_render', 15);

    // Create output path
    const videoPath = path.join(tempDir, 'output.mp4');
    const publicVideosDir = path.join(__dirname, '../../public/videos');
    fs.mkdirSync(publicVideosDir, { recursive: true });
    const finalVideoPath = path.join(publicVideosDir, `${projectId}.mp4`);

    // Render the video
    await createSimpleVideo(videoPath, audioPath, song, config, duration);

    // Move to public directory
    fs.renameSync(videoPath, finalVideoPath);

    const videoUrl = `/videos/${projectId}.mp4`;
    console.log(`[VideoRenderer] Video created: ${videoUrl}`);

    // Mark as completed
    await completeProject(projectId, videoUrl);

    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.error(`[VideoRenderer] Render error for project ${projectId}:`, error);
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Download a file from URL to local path
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  // Handle both full URLs and server-relative URLs
  let fetchUrl = url;
  if (url.startsWith('/')) {
    // Assume it's a relative URL to the same server
    fetchUrl = `http://localhost:3001${url}`;
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath
    ]);

    let output = '';
    let errorOutput = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0 && output) {
        const duration = parseFloat(output.trim());
        if (!isNaN(duration)) {
          resolve(duration);
        } else {
          reject(new Error('Invalid duration value'));
        }
      } else {
        reject(new Error(`ffprobe failed: ${errorOutput || 'Unknown error'}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`ffprobe error: ${err.message}`));
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      ffprobe.kill();
      reject(new Error('ffprobe timeout'));
    }, 10000);
  });
}

/**
 * Create a simple video with background and audio
 */
async function createSimpleVideo(
  videoPath: string,
  audioPath: string,
  song: any,
  config: VideoConfig,
  duration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args: string[] = [];

    // Build filter complex
    const filterParts: string[] = [];

    // Create background based on config
    if (config.backgroundType === 'image' && config.customImage) {
      // Use custom image
      args.push('-loop', '1', '-i', config.customImage);
      filterParts.push('scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080');
    } else if (song.cover_url) {
      // Use song cover art
      args.push('-loop', '1', '-i', song.cover_url);
      filterParts.push('scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080');
    } else {
      // Create gradient background
      args.push('-f', 'lavfi', '-i', `color=c=#1a1a2e:s=1920x1080:d=${duration}`);
    }

    // Add audio
    args.push('-i', audioPath);

    // Add text overlays
    if (config.textLayers && config.textLayers.length > 0) {
      const platform = os.platform();
      const fontPath = FONT_PATHS[platform as keyof typeof FONT_PATHS] || FONT_PATHS.linux;
      // Normalize path separators for FFmpeg: convert backslashes to forward slashes and escape colons
      const normalizedFontPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');

      config.textLayers.forEach((layer, index) => {
        const x = Math.round((layer.x / 100) * 1920);
        const y = Math.round((layer.y / 100) * 1080);
        const fontSize = layer.size || 48;
        const color = layer.color || '#ffffff';
        const text = layer.text.replace(/'/g, "\\'");

        filterParts.push(
          `drawtext=text='${text}':x=${x}:y=${y}:fontsize=${fontSize}:fontcolor=${color}:fontfile='${normalizedFontPath}'`
        );
      });
    }

    // Combine all filters
    if (filterParts.length > 0) {
      args.push('-vf', filterParts.join(','));
    }

    // Video encoding settings
    args.push('-c:v', 'libx264');
    args.push('-preset', 'fast');
    args.push('-crf', '23');
    args.push('-pix_fmt', 'yuv420p');
    args.push('-tune', 'stillimage'); // Better for static backgrounds

    // Audio encoding settings
    args.push('-c:a', 'aac');
    args.push('-b:a', '128k');
    args.push('-shortest'); // End when shortest stream ends
    args.push('-movflags', '+faststart');

    // Output file
    args.push('-y'); // Overwrite output file
    args.push(videoPath);

    console.log(`[VideoRenderer] FFmpeg args: ${args.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', args);
    let stderrOutput = '';
    let lastProgressUpdate = Date.now();

    ffmpeg.stderr.on('data', (data) => {
      stderrOutput += data.toString();

      // Update progress every 500ms
      const now = Date.now();
      if (now - lastProgressUpdate > 500) {
        lastProgressUpdate = now;

        // Try to parse time from FFmpeg output
        const timeMatch = stderrOutput.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/g);
        if (timeMatch && timeMatch.length > 0) {
          const lastTime = timeMatch[timeMatch.length - 1];
          const parts = lastTime.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          if (parts) {
            const hours = parseInt(parts[1]);
            const minutes = parseInt(parts[2]);
            const seconds = parseFloat(parts[3]);
            const currentTime = hours * 3600 + minutes * 60 + seconds;
            const progress = Math.min(95, Math.round((currentTime / duration) * 100));

            // Update progress in DB (15-95%)
            updateProgress(projectIdFromPath(videoPath), 'encoding', 15 + Math.round(progress * 0.8)).catch(() => {});
          }
        }
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('[VideoRenderer] FFmpeg completed successfully');
        resolve();
      } else {
        console.error('[VideoRenderer] FFmpeg error output:', stderrOutput);
        reject(new Error(`FFmpeg failed with exit code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`FFmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Extract project ID from file path
 */
function projectIdFromPath(filePath: string): string {
  const matches = filePath.match(/([^\/\\]+)$/);
  return matches ? matches[1].replace('.mp4', '') : '';
}

/**
 * Update project progress in database
 */
async function updateProgress(projectId: string, stage: string, progress: number): Promise<void> {
  await pool.query(
    `UPDATE video_projects
     SET render_stage = ?, progress = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [stage, Math.min(100, progress), projectId]
  );
}

/**
 * Mark project as completed
 */
async function completeProject(projectId: string, videoUrl: string): Promise<void> {
  await pool.query(
    `UPDATE video_projects
     SET state = 'completed',
         video_url = ?,
         progress = 100,
         render_stage = 'completed',
         completed_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ?`,
    [videoUrl, projectId]
  );
}

/**
 * Mark project as failed
 */
async function failProject(projectId: string, errorMessage: string): Promise<void> {
  await pool.query(
    `UPDATE video_projects
     SET state = 'failed',
         error_message = ?,
         render_stage = 'failed',
         progress = 0,
         updated_at = datetime('now')
     WHERE id = ?`,
    [errorMessage.substring(0, 500), projectId]
  );
}
