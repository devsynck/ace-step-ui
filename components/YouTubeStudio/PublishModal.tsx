import React, { useState, useEffect } from 'react';
import { X, Upload as UploadIcon, Loader2, Youtube, AlertTriangle, Eye, EyeOff, Globe, Lock, Film, Wand2 } from 'lucide-react';
import type { VideoProject, Song, YouTubeMetadata, YouTubeVisibilityStatus } from '../../types';

// OAuth2 Token Response type
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GoogleOAuthUser {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string;
  email_verified: boolean;
}

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: VideoProject;
  song: Song | undefined;
  onPublish: (projectId: string, metadata: YouTubeMetadata, accessToken: string) => Promise<void>;
}

// Google OAuth Client ID
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';

interface VisibilityOption {
  value: YouTubeVisibilityStatus;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: 'public',
    label: 'Public',
    icon: <Globe size={16} />,
    description: 'Anyone can search for and view',
  },
  {
    value: 'unlisted',
    label: 'Unlisted',
    icon: <EyeOff size={16} />,
    description: 'Only people with the link can view',
  },
  {
    value: 'private',
    label: 'Private',
    icon: <Lock size={16} />,
    description: 'Only you can view',
  },
];

export const PublishModal: React.FC<PublishModalProps> = ({
  isOpen,
  onClose,
  project,
  song,
  onPublish,
}) => {
  // OAuth state
  const [user, setUser] = useState<GoogleOAuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const tokenClient = React.useRef<any>(null);

  // Form state
  const [metadata, setMetadata] = useState<YouTubeMetadata>({
    title: song?.title || '',
    description: song?.lyrics ? `Lyrics:\n${song.lyrics}\n\nStyle: ${song.style}` : '',
    tags: [],
    visibility: 'unlisted',
  });
  const [tagsInput, setTagsInput] = useState<string>('');

  // UI state
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Enhancement state
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  // Load Google Identity Services
  useEffect(() => {
    const loadGoogleScript = () => {
      const existingScript = document.getElementById('google-oauth-script');
      if (existingScript) return;

      const script = document.createElement('script');
      script.id = 'google-oauth-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        console.error('[PublishModal] Failed to load Google OAuth script');
        setError('Failed to load Google OAuth. Please check your internet connection.');
      };
      script.onload = () => {
        console.log('[PublishModal] Google script loaded');
        console.log('[PublishModal] window.google?.accounts?.oauth2:', window.google?.accounts?.oauth2);
        console.log('[PublishModal] GOOGLE_CLIENT_ID:', GOOGLE_CLIENT_ID);
        if (window.google?.accounts?.oauth2 && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID') {
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
            callback: (tokenResponse: TokenResponse) => {
              console.log('[PublishModal] Token response:', tokenResponse);
              if (tokenResponse.access_token) {
                setAccessToken(tokenResponse.access_token);
                localStorage.setItem('youtube_access_token', tokenResponse.access_token);
                fetchUserInfo(tokenResponse.access_token);
              } else if (tokenResponse.error) {
                console.error('OAuth error:', tokenResponse.error, tokenResponse.error_description);
                setError(`Authentication error: ${tokenResponse.error}`);
              }
            },
            error_callback: (error: { type: string; message: string }) => {
              console.error('[PublishModal] OAuth error:', error);
              setError(`Authentication error: ${error.message}`);
            },
          });
          tokenClient.current = client;
          console.log('[PublishModal] Token client initialized:', client);
        } else {
          console.warn('[PublishModal] Cannot initialize - google not available or client ID not set');
        }
      };
      document.body.appendChild(script);
    };

    loadGoogleScript();

    // Check for stored token
    const storedToken = localStorage.getItem('youtube_access_token');
    const storedUser = localStorage.getItem('youtube_user');
    if (storedToken && storedUser) {
      setAccessToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  // Update metadata when song changes
  useEffect(() => {
    if (song) {
      setMetadata({
        title: song.title || '',
        description: song.lyrics ? `Lyrics:\n${song.lyrics}\n\nStyle: ${song.style}` : '',
        tags: [],
        visibility: 'unlisted',
      });
    }
  }, [song]);

  // Fetch user info using the OAuth access token
  const fetchUserInfo = async (token: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const userInfo = await response.json();
        const userInfoData: GoogleOAuthUser = {
          sub: userInfo.id,
          name: userInfo.name,
          given_name: userInfo.given_name,
          family_name: userInfo.family_name,
          picture: userInfo.picture,
          email: userInfo.email,
          email_verified: userInfo.verified_email,
        };
        setUser(userInfoData);
        localStorage.setItem('youtube_user', JSON.stringify(userInfoData));
      }
    } catch (err) {
      console.error('Error fetching user info:', err);
    }
  };

  // Request OAuth access token
  const handleYouTubeAuth = () => {
    console.log('[PublishModal] Auth clicked, tokenClient.current:', tokenClient.current);
    console.log('[PublishModal] window.google:', window.google);

    if (tokenClient.current && typeof tokenClient.current.requestAccessToken === 'function') {
      console.log('[PublishModal] Calling requestAccessToken...');
      tokenClient.current.requestAccessToken();
    } else if (!tokenClient.current) {
      console.error('[PublishModal] Token client is null, attempting to re-initialize...');
      // Try to re-initialize
      if (window.google?.accounts?.oauth2 && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID') {
        console.log('[PublishModal] Re-initializing token client...');
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          callback: (tokenResponse: TokenResponse) => {
            console.log('[PublishModal] Token response:', tokenResponse);
            if (tokenResponse.access_token) {
              setAccessToken(tokenResponse.access_token);
              localStorage.setItem('youtube_access_token', tokenResponse.access_token);
              fetchUserInfo(tokenResponse.access_token);
            } else if (tokenResponse.error) {
              console.error('OAuth error:', tokenResponse.error, tokenResponse.error_description);
              setError(`Authentication error: ${tokenResponse.error}`);
            }
          },
          error_callback: (error: { type: string; message: string }) => {
            console.error('[PublishModal] OAuth error:', error);
            setError(`Authentication error: ${error.message}`);
          },
        });
        tokenClient.current = client;
        console.log('[PublishModal] Token client re-initialized:', client);
        // Now try requesting the token
        if (typeof client.requestAccessToken === 'function') {
          console.log('[PublishModal] Calling requestAccessToken after re-init...');
          client.requestAccessToken();
        } else {
          setError('Failed to initialize OAuth client. Please refresh the page.');
        }
      } else {
        setError('Google OAuth not available. Please refresh the page and try again.');
      }
    } else {
      console.error('[PublishModal] requestAccessToken is not a function');
      setError('Google OAuth client not properly initialized. Please refresh the page.');
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('youtube_access_token');
    localStorage.removeItem('youtube_user');
  };

  const handlePublish = async () => {
    if (!accessToken) {
      setError('Please sign in with Google to publish to YouTube');
      return;
    }

    if (!metadata.title.trim()) {
      setError('Title is required');
      return;
    }

    if (metadata.title.length > 100) {
      setError('Title must be 100 characters or less');
      return;
    }

    if (metadata.description.length > 5000) {
      setError('Description must be 5000 characters or less');
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      await onPublish(project.id, {
        ...metadata,
        tags: metadata.tags.filter(tag => tag.trim().length > 0),
      }, accessToken);
      onClose();
    } catch (err) {
      console.error('YouTube upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload to YouTube');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleTagsInputBlur = () => {
    const tags = tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    if (tags.length > 50) {
      setError('Maximum 50 tags allowed');
      return;
    }

    if (tags.join(',').length > 500) {
      setError('Tags combined must be 500 characters or less');
      return;
    }

    setMetadata({ ...metadata, tags });
    setError(null);
  };

  const handleAIEnhance = async () => {
    if (!song) return;

    setIsEnhancing(true);
    setEnhanceError(null);

    try {
      // Get auth token from localStorage
      const token = localStorage.getItem('acestep_token');
      if (!token) {
        setEnhanceError('Please sign in to use AI enhancement');
        return;
      }

      // Call the backend endpoint for YouTube metadata enhancement
      const response = await fetch('/api/settings/providers/enhance-youtube-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentTitle: metadata.title,
          currentDescription: metadata.description,
          currentTags: metadata.tags,
          songLyrics: song.lyrics,
          songStyle: song.style,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setEnhanceError(errorData.error || 'Failed to enhance metadata');
        return;
      }

      const result = await response.json();

      if (result.success && result.title && result.description && result.tags) {
        setMetadata({
          ...metadata,
          title: result.title,
          description: result.description,
          tags: result.tags,
        });
        setTagsInput(result.tags.join(', '));
      }
    } catch (error) {
      setEnhanceError(error instanceof Error ? error.message : 'Failed to enhance metadata');
    } finally {
      setIsEnhancing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 rounded-lg">
              <Youtube className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Publish to YouTube</h1>
              <p className="text-zinc-500 text-xs">Share your video with the world</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            disabled={isPublishing}
          >
            <X className="text-zinc-400" size={20} />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Column - Video Preview */}
          <div className="w-1/2 bg-black flex items-center justify-center p-6 overflow-auto">
            <div className="w-full aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-white/10 shadow-2xl flex-shrink-0">
              {project.videoUrl ? (
                <video
                  src={project.videoUrl}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <Film className="text-zinc-700 mx-auto mb-3" size={48} />
                    <p className="text-zinc-600 text-sm">No video available</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="w-1/2 bg-zinc-900 p-6 overflow-y-auto min-h-0">
            {/* Auth Section */}
            <div className="mb-6">
              {user ? (
                <div className="flex items-center justify-between bg-zinc-800/50 rounded-lg p-3 border border-white/5">
                  <div className="flex items-center gap-3">
                    {user.picture ? (
                      <img
                        src={user.picture}
                        alt={user.name}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white font-bold">
                        {user.name?.charAt(0) || '?'}
                      </div>
                    )}
                    <div>
                      <p className="text-white text-sm font-medium">{user.name}</p>
                      <p className="text-zinc-500 text-xs">{user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="text-zinc-500 hover:text-red-400 text-xs font-medium transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="bg-zinc-800/50 rounded-lg p-4 border border-white/5">
                  <p className="text-zinc-400 text-sm mb-3">Sign in to publish your video to YouTube</p>
                  {GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID' ? (
                    <button
                      onClick={handleYouTubeAuth}
                      className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all hover:shadow-lg hover:shadow-red-600/25"
                    >
                      <Youtube size={18} />
                      Connect YouTube Account
                    </button>
                  ) : (
                    <div className="text-center py-2">
                      <p className="text-amber-500 text-xs mb-2">
                        Google OAuth Client ID not configured
                      </p>
                      <p className="text-zinc-600 text-[10px]">
                        Set VITE_GOOGLE_CLIENT_ID in your .env file
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Metadata Form */}
            <div className="space-y-4">
              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-zinc-300">Title</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAIEnhance}
                      disabled={isEnhancing || !song}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded transition-all"
                    >
                      {isEnhancing ? (
                        <>
                          <Loader2 className="animate-spin" size={12} />
                          Enhancing...
                        </>
                      ) : (
                        <>
                          <Wand2 size={12} />
                          AI Enhance All
                        </>
                      )}
                    </button>
                    <span className={`${metadata.title.length > 100 ? 'text-red-400' : 'text-zinc-500'} text-xs`}>
                      {metadata.title.length}/100
                    </span>
                  </div>
                </div>
                <input
                  type="text"
                  value={metadata.title}
                  onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                  maxLength={100}
                  placeholder="Enter video title..."
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label className="flex items-center justify-between text-sm font-medium text-zinc-300 mb-1.5">
                  <span>Description</span>
                  <span className={`${metadata.description.length > 5000 ? 'text-red-400' : 'text-zinc-500'} text-xs`}>
                    {metadata.description.length}/5000
                  </span>
                </label>
                <textarea
                  value={metadata.description}
                  onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                  maxLength={5000}
                  rows={5}
                  placeholder="Enter video description..."
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all resize-none"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Tags</label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  onBlur={handleTagsInputBlur}
                  placeholder="music, ai, cover song (comma-separated)"
                  className="w-full bg-zinc-800 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50 transition-all"
                />
                <p className="text-zinc-600 text-xs mt-1">
                  Separate tags with commas. Maximum 50 tags, 500 characters total.
                </p>
              </div>

              {/* Visibility */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Visibility</label>
                <div className="grid grid-cols-3 gap-2">
                  {VISIBILITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMetadata({ ...metadata, visibility: option.value })}
                      className={`p-3 rounded-lg border transition-all text-left ${
                        metadata.visibility === option.value
                          ? 'bg-red-500/20 border-red-500/50'
                          : 'bg-zinc-800 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`${metadata.visibility === option.value ? 'text-red-400' : 'text-zinc-500'}`}>
                          {option.icon}
                        </div>
                        <span className={`text-xs font-medium ${
                          metadata.visibility === option.value ? 'text-white' : 'text-zinc-400'
                        }`}>
                          {option.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-600">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quota Warning */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={14} />
                  <div>
                    <p className="text-amber-500 text-xs font-medium">API Quota Notice</p>
                    <p className="text-zinc-500 text-[10px] mt-0.5">
                      Each upload costs 1,600 quota units. Default daily limit is 10,000 units (~6 uploads per day).
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}

              {/* AI Enhance Error Display */}
              {enhanceError && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                  <p className="text-purple-400 text-xs">{enhanceError}</p>
                </div>
              )}

              {/* Publish Button */}
              <button
                onClick={handlePublish}
                disabled={!user || isPublishing || !metadata.title.trim()}
                className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                  !user || isPublishing || !metadata.title.trim()
                    ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700 hover:shadow-lg hover:shadow-red-600/25'
                }`}
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Publishing to YouTube...
                  </>
                ) : (
                  <>
                    <UploadIcon size={16} />
                    Publish to YouTube
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
