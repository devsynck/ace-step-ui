export interface Song {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  coverUrl: string;
  duration: string;
  createdAt: Date;
  isGenerating?: boolean;
  queuePosition?: number; // Position in queue (undefined = actively generating, number = waiting in queue)
  progress?: number;
  stage?: string;
  generationParams?: any;
  tags: string[];
  audioUrl?: string;
  videoUrl?: string; // URL of the generated video for YouTube upload
  isPublic?: boolean;
  likeCount?: number;
  viewCount?: number;
  userId?: string;
  creator?: string;
  creator_avatar?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  cover_url?: string;
  songIds?: string[];
  isPublic?: boolean;
  is_public?: boolean;
  user_id?: string;
  creator?: string;
  created_at?: string;
  song_count?: number;
  songs?: any[];
}

export interface Comment {
  id: string;
  songId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: Date;
}

export interface GenerationParams {
  // Mode
  customMode: boolean;

  // Simple Mode
  songDescription?: string;

  // Custom Mode
  prompt: string;
  lyrics: string;
  style: string;
  title: string;

  // Common
  instrumental: boolean;
  vocalLanguage: string;

  // Music Parameters
  bpm: number;
  keyScale: string;
  timeSignature: string;
  duration: number;

  // Generation Settings
  inferenceSteps: number;
  guidanceScale: number;
  batchSize: number;
  randomSeed: boolean;
  seed: number;
  thinking: boolean;
  audioFormat: 'mp3' | 'flac';
  inferMethod: 'ode' | 'sde';
  shift: number;

  // LM Parameters
  lmTemperature: number;
  lmCfgScale: number;
  lmTopK: number;
  lmTopP: number;
  lmNegativePrompt: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;
}

export interface PlayerState {
  currentSong: Song | null;
  isPlaying: boolean;
  progress: number;
  volume: number;
}

export interface User {
  id: string;
  username: string;
  createdAt: Date;
  followerCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
  isAdmin?: boolean;
  avatar_url?: string;
  banner_url?: string;
}

export interface UserProfile {
  user: User;
  publicSongs: Song[];
  publicPlaylists: Playlist[];
  stats: {
    totalSongs: number;
    totalLikes: number;
  };
}

// AI Provider types
export type ProviderType = 'gemini' | 'ollama' | 'openai' | 'anthropic' | 'custom';

export interface AIProvider {
  id: string;
  userId: string;
  name: string;
  providerType: ProviderType;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  headers?: Record<string, string>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// Simplified views for ACE-Step UI
export type View = 'create' | 'library' | 'profile' | 'song' | 'playlist' | 'search' | 'settings' | 'youtube_studio';

// YouTube Studio types
export type YouTubeVisibilityStatus = 'public' | 'private' | 'unlisted';

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  visibility: YouTubeVisibilityStatus;
}

// Video Project types
export type VideoProjectState =
  | 'not_started'     // No render initiated
  | 'rendering'       // Server is rendering video
  | 'completed'       // Render complete, ready for upload
  | 'uploading'       // Uploading to YouTube
  | 'uploaded'        // Successfully uploaded
  | 'failed'          // Render or upload failed
  | 'cancelled';      // User cancelled

export type VideoRenderStage =
  | 'idle'
  | 'queued'
  | 'initializing'
  | 'processing'
  | 'encoding'
  | 'finalizing';

export interface VideoProject {
  id: string;
  songId: string;
  userId: string;
  state: VideoProjectState;
  renderStage?: VideoRenderStage;
  progress: number;              // 0-100
  videoUrl?: string;             // Rendered video URL
  errorMessage?: string;

  // Video config (from VideoGeneratorModal)
  config: {
    preset: string;
    visualizer: string;
    effects: Record<string, any>;
    intensities: Record<string, number>;
    textLayers: any[];
    backgroundType: 'gradient' | 'image' | 'video';
    customImage?: string;
    customAlbumArt?: string;
    videoUrl?: string;
  };

  // YouTube metadata
  youtubeMetadata?: {
    title: string;
    description: string;
    tags: string[];
    visibility: 'public' | 'private' | 'unlisted';
  };

  // Upload tracking
  uploadProgress?: number;
  youtubeVideoId?: string;
  youtubeVideoUrl?: string;

  // Job IDs for polling
  renderJobId?: string;
  uploadJobId?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface YouTubeUploadRequest {
  accessToken: string;
  videoUrl: string;
  metadata: YouTubeMetadata;
}

export interface YouTubeUploadResponse {
  success: boolean;
  videoId?: string;
  error?: string;
  quotaWarning?: string;
}

export interface GoogleOAuthUser {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string;
  email_verified: boolean;
}
