import { Router, Response } from 'express';
import axios from 'axios';
import { Readable } from 'stream';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/youtube/upload
 * Upload a video to YouTube using OAuth2 access token
 *
 * Body: {
 *   accessToken: string;
 *   videoUrl: string;
 *   metadata: {
 *     title: string;
 *     description: string;
 *     tags: string[];
 *     visibility: 'public' | 'private' | 'unlisted';
 *   };
 * }
 */
interface YouTubeUploadBody {
  accessToken: string;
  videoUrl: string;
  metadata: {
    title: string;
    description: string;
    tags: string[];
    visibility: 'public' | 'private' | 'unlisted';
  };
}

router.post('/upload', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accessToken, videoUrl, metadata } = req.body as YouTubeUploadBody;

    // Validate required fields
    if (!accessToken) {
      res.status(400).json({ error: 'Access token is required' });
      return;
    }
    if (!videoUrl) {
      res.status(400).json({ error: 'Video URL is required' });
      return;
    }
    if (!metadata?.title) {
      res.status(400).json({ error: 'Video title is required' });
      return;
    }

    // Validate title length (YouTube max 100 chars)
    if (metadata.title.length > 100) {
      res.status(400).json({ error: 'Title must be 100 characters or less' });
      return;
    }

    // Validate description length (YouTube max 5000 chars)
    if (metadata.description?.length > 5000) {
      res.status(400).json({ error: 'Description must be 5000 characters or less' });
      return;
    }

    // Validate tags (max 500 chars total, 50 tags max)
    if (metadata.tags && metadata.tags.length > 50) {
      res.status(400).json({ error: 'Maximum 50 tags allowed' });
      return;
    }

    const tagsString = metadata.tags?.join(',') || '';
    if (tagsString.length > 500) {
      res.status(400).json({ error: 'Tags combined must be 500 characters or less' });
      return;
    }

    // Log the upload attempt
    console.log(`[YouTube] Upload requested by user ${req.user!.id} for video: ${videoUrl}`);

    // Fetch the video file
    let videoBuffer: Buffer;
    let contentType: string;

    try {
      // Check if videoUrl is a relative URL (local file)
      if (videoUrl.startsWith('/') || videoUrl.startsWith('./')) {
        // For local files, we'd need to serve from public directory
        // For now, assume it's a full URL or relative to audio endpoint
        const fullUrl = videoUrl.startsWith('/') ? `http://localhost:${process.env.PORT || 3001}${videoUrl}` : videoUrl;
        const response = await axios.get<ArrayBuffer>(fullUrl, { responseType: 'arraybuffer' });
        videoBuffer = Buffer.from(response.data);
        contentType = response.headers['content-type'] || 'video/mp4';
      } else if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        // External URL
        const response = await axios.get<ArrayBuffer>(videoUrl, { responseType: 'arraybuffer' });
        videoBuffer = Buffer.from(response.data);
        contentType = response.headers['content-type'] || 'video/mp4';
      } else {
        // Assume it's a data URL or blob URL
        res.status(400).json({ error: 'Invalid video URL format. Use HTTP/HTTPS URL or local path.' });
        return;
      }

      // Verify video size (YouTube max 256GB for regular uploads, but we'll set 2GB limit)
      const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
      if (videoBuffer.length > maxSize) {
        res.status(400).json({ error: 'Video file too large. Maximum size is 2GB.' });
        return;
      }

      console.log(`[YouTube] Video fetched: ${videoBuffer.length} bytes, type: ${contentType}`);
    } catch (fetchError) {
      console.error('[YouTube] Error fetching video:', fetchError);
      res.status(400).json({ error: 'Failed to fetch video file. Please check the URL and try again.' });
      return;
    }

    // Prepare YouTube upload request
    // Using resumable upload approach for better handling of larger files
    const youtubeApiUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

    try {
      // Step 1: Initialize the resumable upload session
      const initResponse = await axios.post(
        youtubeApiUrl,
        {
          snippet: {
            title: metadata.title,
            description: metadata.description || '',
            tags: metadata.tags || [],
            categoryId: '10', // Music category
          },
          status: {
            privacyStatus: metadata.visibility || 'private',
            selfDeclaredMadeForKids: false,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const uploadUrl = initResponse.headers['location'];
      if (!uploadUrl) {
        res.status(500).json({ error: 'Failed to initialize YouTube upload session' });
        return;
      }

      console.log(`[YouTube] Upload session initialized: ${uploadUrl}`);

      // Step 2: Upload the actual video file
      const uploadResponse = await axios.put(uploadUrl, videoBuffer, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
          'Content-Length': videoBuffer.length.toString(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      // Extract video ID from response
      const videoId = uploadResponse.data?.id;

      if (!videoId) {
        console.error('[YouTube] Upload response missing video ID:', uploadResponse.data);
        res.status(500).json({ error: 'Upload completed but no video ID returned' });
        return;
      }

      console.log(`[YouTube] Upload successful! Video ID: ${videoId}`);

      // Success response with quota warning
      res.json({
        success: true,
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        quotaWarning: 'Note: This upload used 1,600 quota units. YouTube Data API has a daily quota of 10,000 units.',
      });
    } catch (apiError) {
      // Handle YouTube API errors
      if (axios.isAxiosError(apiError)) {
        const statusCode = apiError.response?.status;
        const errorData = apiError.response?.data;

        console.error('[YouTube] API Error:', statusCode, errorData);

        // Parse common error types
        let errorMessage = 'YouTube upload failed';

        if (statusCode === 401) {
          errorMessage = 'Authentication failed. Please sign in with Google again.';
        } else if (statusCode === 403) {
          if (errorData?.error?.errors?.[0]?.reason === 'quotaExceeded') {
            errorMessage = 'YouTube API quota exceeded. Please try again tomorrow.';
          } else {
            errorMessage = 'Access denied. Please check your YouTube channel permissions.';
          }
        } else if (statusCode === 400) {
          errorMessage = errorData?.error?.message || 'Invalid request. Please check your video metadata.';
        }

        res.status(statusCode || 500).json({
          error: errorMessage,
          details: errorData,
        });
      } else {
        throw apiError;
      }
    }
  } catch (error) {
    console.error('[YouTube] Upload error:', error);
    res.status(500).json({
      error: 'Internal server error during YouTube upload',
      details: (error as Error).message,
    });
  }
});

/**
 * GET /api/youtube/quota-info
 * Returns information about YouTube API quota
 */
router.get('/quota-info', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    dailyQuota: 10000,
    uploadCost: 1600,
    maxUploadsPerDay: Math.floor(10000 / 1600),
    warning: 'Each video upload consumes 1,600 quota units. The default daily quota is 10,000 units (approximately 6 uploads per day).',
  });
});

export default router;
