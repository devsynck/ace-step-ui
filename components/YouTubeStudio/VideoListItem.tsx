import React, { useState } from 'react';
import { Play, Youtube, Trash2, RefreshCw, ExternalLink, Calendar, X } from 'lucide-react';
import type { VideoProject, Song } from '../../types';
import { VideoStatusBadge } from './VideoStatusBadge';
import { VideoProgressBar } from './VideoProgressBar';

interface VideoListItemProps {
  project: VideoProject;
  song: Song | undefined;
  onRender: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onRerender?: () => void;
}

export const VideoListItem: React.FC<VideoListItemProps> = ({
  project,
  song,
  onRender,
  onPublish,
  onDelete,
  onRetry,
  onRerender,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const getActionButton = () => {
    switch (project.state) {
      case 'not_started':
        return (
          <button
            onClick={onRender}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
          >
            <Play size={16} />
            Render Video
          </button>
        );
      case 'completed':
        return (
          <div className="flex items-center gap-2">
            {project.videoUrl && (
              <button
                onClick={() => setShowPreview(true)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
              >
                <Play size={16} />
                Preview
              </button>
            )}
            {onRerender && (
              <button
                onClick={onRerender}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Re-render
              </button>
            )}
            <button
              onClick={onPublish}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
            >
              <Youtube size={16} />
              Publish to YouTube
            </button>
          </div>
        );
      case 'uploaded':
        return project.youtubeVideoUrl ? (
          <a
            href={project.youtubeVideoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
          >
            <ExternalLink size={16} />
            View on YouTube
          </a>
        ) : null;
      case 'failed':
        return (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl p-4 border border-zinc-200 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/20 transition-all">
      <div className="flex items-start gap-4">
        {/* Song thumbnail */}
        <div className="flex-shrink-0">
          <img
            src={song?.coverUrl || `https://picsum.photos/seed/${project.songId}/200/200`}
            alt=""
            className="w-20 h-20 rounded-lg object-cover bg-zinc-200 dark:bg-zinc-700"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Song title and style */}
          <div className="mb-2">
            <h3 className="font-semibold text-zinc-900 dark:text-white truncate">
              {song?.title || 'Unknown Song'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
              {song?.style || song?.caption || 'No style'}
            </p>
          </div>

          {/* Status badge and progress */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <VideoStatusBadge
                state={project.state}
                progress={project.state === 'rendering' ? project.progress : project.uploadProgress}
                error={project.errorMessage}
              />
              <span className="text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
                <Calendar size={12} />
                {formatDate(project.createdAt)}
              </span>
            </div>

            {/* Progress bar for rendering/uploading */}
            {(project.state === 'rendering' || project.state === 'uploading') && (
              <VideoProgressBar
                value={project.state === 'rendering' ? project.progress : (project.uploadProgress || 0)}
                className="max-w-[200px]"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {getActionButton()}
          <button
            onClick={onDelete}
            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
            title="Delete project"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Video Preview Modal */}
      {showPreview && project.videoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl mx-4">
            <button
              onClick={() => setShowPreview(false)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-zinc-300 transition-colors"
            >
              <X size={24} />
            </button>
            <video
              src={project.videoUrl}
              controls
              autoPlay
              className="w-full rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
