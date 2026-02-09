import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import { startVideoRender } from '../services/videoRenderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use ../../public/videos from routes/ to match server/public/videos (where static files are served from)
    const videosDir = path.join(__dirname, '../../public/videos');
    if (!fs.existsSync(videosDir)) {
      fs.mkdirSync(videosDir, { recursive: true });
    }
    cb(null, videosDir);
  },
  filename: (req, file, cb) => {
    const projectId = req.params.id;
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${projectId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp4', '.webm', '.mov'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, WebM, and MOV files are allowed.'));
    }
  },
});

/**
 * POST /api/video-projects
 * Create a new video project for a song
 */
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { songId, config, force } = req.body;
    const userId = req.user!.id;

    if (!songId) {
      res.status(400).json({ error: 'songId is required' });
      return;
    }

    // Check if project already exists for this song (unless force is true)
    if (!force) {
      const existing = await pool.query(
        'SELECT id FROM video_projects WHERE song_id = ? AND user_id = ?',
        [songId, userId]
      );

      if (existing.rows.length > 0) {
        // Return existing project
        const project = await pool.query(
          'SELECT * FROM video_projects WHERE id = ?',
          [existing.rows[0].id]
        );
        res.json({ project: transformProject(project.rows[0]) });
        return;
      }
    }

    // Generate unique project ID
    const id = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await pool.query(
      `INSERT INTO video_projects (id, song_id, user_id, config)
       VALUES (?, ?, ?, ?)`,
      [id, songId, userId, JSON.stringify(config || {})]
    );

    const project = await pool.query(
      'SELECT * FROM video_projects WHERE id = ?',
      [id]
    );

    res.json({ project: transformProject(project.rows[0]) });
  } catch (error) {
    console.error('[VideoProjects] Create error:', error);
    res.status(500).json({ error: 'Failed to create video project' });
  }
});

/**
 * GET /api/video-projects
 * List all video projects for the authenticated user
 */
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      `SELECT * FROM video_projects
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    const projects = result.rows.map(transformProject);
    res.json({ projects });
  } catch (error) {
    console.error('[VideoProjects] List error:', error);
    res.status(500).json({ error: 'Failed to list video projects' });
  }
});

/**
 * GET /api/video-projects/:id
 * Get a single video project
 */
router.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    const userId = req.user!.id;

    const result = await pool.query(
      'SELECT * FROM video_projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Video project not found' });
      return;
    }

    res.json({ project: transformProject(result.rows[0]) });
  } catch (error) {
    console.error('[VideoProjects] Get error:', error);
    res.status(500).json({ error: 'Failed to get video project' });
  }
});

/**
 * POST /api/video-projects/:id/render
 * Start rendering a video project
 */
router.post('/:id/render', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    const userId = req.user!.id;

    // Get project
    const projectResult = await pool.query(
      'SELECT * FROM video_projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );

    if (projectResult.rows.length === 0) {
      res.status(404).json({ error: 'Video project not found' });
      return;
    }

    const project = projectResult.rows[0];
    const config = project.config ? JSON.parse(project.config) : {};

    // Check if already rendering
    if (project.state === 'rendering') {
      res.json({ jobId: project.render_job_id, message: 'Already rendering' });
      return;
    }

    // Mark as rendering and generate job ID
    const jobId = `render_${projectId}_${Date.now()}`;

    await pool.query(
      `UPDATE video_projects
       SET state = 'rendering', render_job_id = ?, render_stage = 'queued', progress = 0, updated_at = datetime('now')
       WHERE id = ?`,
      [jobId, projectId]
    );

    // Start background rendering
    startVideoRender(projectId, project.song_id, userId, config).catch(async (error) => {
      console.error('[VideoProjects] Background render error:', error);
    });

    res.json({ jobId, message: 'Rendering started' });
  } catch (error) {
    console.error('[VideoProjects] Render start error:', error);
    res.status(500).json({ error: 'Failed to start video render' });
  }
});

/**
 * GET /api/video-projects/:id/status
 * Poll the status of a video project
 */
router.get('/:id/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    const userId = req.user!.id;

    const result = await pool.query(
      'SELECT * FROM video_projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Video project not found' });
      return;
    }

    const project = transformProject(result.rows[0]);

    // If rendering, check with Python backend for status
    if (project.state === 'rendering' && project.renderJobId) {
      // TODO: Poll Python backend for actual status
      // For now, return the current state
    }

    res.json({ project });
  } catch (error) {
    console.error('[VideoProjects] Status error:', error);
    res.status(500).json({ error: 'Failed to get video project status' });
  }
});

/**
 * POST /api/video-projects/:id/complete
 * Mark a video project as completed with video URL
 */
router.post('/:id/complete', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    const userId = req.user!.id;
    const { videoUrl } = req.body;

    if (!videoUrl) {
      res.status(400).json({ error: 'videoUrl is required' });
      return;
    }

    await pool.query(
      `UPDATE video_projects
       SET state = 'completed',
           video_url = ?,
           progress = 100,
           completed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [videoUrl, projectId, userId]
    );

    const result = await pool.query(
      'SELECT * FROM video_projects WHERE id = ?',
      [projectId]
    );

    res.json({ project: transformProject(result.rows[0]) });
  } catch (error) {
    console.error('[VideoProjects] Complete error:', error);
    res.status(500).json({ error: 'Failed to complete video project' });
  }
});

/**
 * POST /api/video-projects/:id/publish
 * Update project with YouTube metadata after publishing
 */
router.post('/:id/publish', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    const userId = req.user!.id;
    const { youtubeVideoId, youtubeVideoUrl, metadata } = req.body;

    if (!youtubeVideoId) {
      res.status(400).json({ error: 'youtubeVideoId is required' });
      return;
    }

    await pool.query(
      `UPDATE video_projects
       SET state = 'uploaded',
           youtube_video_id = ?,
           youtube_video_url = ?,
           youtube_metadata = ?,
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [youtubeVideoId, youtubeVideoUrl || `https://www.youtube.com/watch?v=${youtubeVideoId}`, JSON.stringify(metadata || {}), projectId, userId]
    );

    const result = await pool.query(
      'SELECT * FROM video_projects WHERE id = ?',
      [projectId]
    );

    res.json({ project: transformProject(result.rows[0]) });
  } catch (error) {
    console.error('[VideoProjects] Publish error:', error);
    res.status(500).json({ error: 'Failed to update video project' });
  }
});

/**
 * POST /api/video-projects/:id/upload
 * Upload a rendered video from client-side rendering
 */
router.post('/:id/upload', authMiddleware, upload.single('video'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    const userId = req.user!.id;

    if (!req.file) {
      res.status(400).json({ error: 'No video file provided' });
      return;
    }

    // Verify project exists and belongs to user
    const projectResult = await pool.query(
      'SELECT * FROM video_projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );

    if (projectResult.rows.length === 0) {
      res.status(404).json({ error: 'Video project not found' });
      return;
    }

    // Generate public URL for the video
    const videoUrl = `/videos/${req.file.filename}`;

    // Update project with video URL and mark as completed
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

    const result = await pool.query(
      'SELECT * FROM video_projects WHERE id = ?',
      [projectId]
    );

    res.json({ project: transformProject(result.rows[0]) });
  } catch (error) {
    console.error('[VideoProjects] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

/**
 * POST /api/video-projects/:id/progress
 * Update render progress from client-side rendering
 */
router.post('/:id/progress', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    const userId = req.user!.id;
    const { stage, progress, errorMessage } = req.body;

    // Verify project exists and belongs to user
    const projectResult = await pool.query(
      'SELECT * FROM video_projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );

    if (projectResult.rows.length === 0) {
      res.status(404).json({ error: 'Video project not found' });
      return;
    }

    // Determine state based on progress and error
    let state = 'rendering';
    if (errorMessage) {
      state = 'failed';
    } else if (progress >= 100) {
      state = 'completed';
    }

    // Update progress
    await pool.query(
      `UPDATE video_projects
       SET state = ?,
           render_stage = ?,
           progress = ?,
           error_message = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [state, stage || null, progress || 0, errorMessage || null, projectId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[VideoProjects] Progress update error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

/**
 * DELETE /api/video-projects/:id
 * Delete a video project
 */
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    const userId = req.user!.id;

    await pool.query(
      'DELETE FROM video_projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[VideoProjects] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete video project' });
  }
});

/**
 * Transform database row to API response format
 */
function transformProject(row: any): any {
  return {
    id: row.id,
    songId: row.song_id,
    userId: row.user_id,
    state: row.state,
    renderStage: row.render_stage,
    progress: row.progress || 0,
    videoUrl: row.video_url,
    errorMessage: row.error_message,
    config: row.config ? JSON.parse(row.config) : {},
    youtubeMetadata: row.youtube_metadata ? JSON.parse(row.youtube_metadata) : undefined,
    uploadProgress: row.upload_progress || 0,
    youtubeVideoId: row.youtube_video_id,
    youtubeVideoUrl: row.youtube_video_url,
    renderJobId: row.render_job_id,
    uploadJobId: row.upload_job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export default router;
