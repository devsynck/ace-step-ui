import React from 'react';
import { Video, Plus } from 'lucide-react';
import type { VideoProject, Song, VideoProjectState } from '../../types';
import { VideoListItem } from './VideoListItem';

interface VideoListProps {
  projects: VideoProject[];
  songs: Map<string, Song>;
  filter: VideoProjectState | 'all';
  onRender: (projectId: string) => void;
  onPublish: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onRetry: (projectId: string) => void;
  onCreateNew: () => void;
  onRerender?: (project: VideoProject) => void;
}

export const VideoList: React.FC<VideoListProps> = ({
  projects,
  songs,
  filter,
  onRender,
  onPublish,
  onDelete,
  onRetry,
  onCreateNew,
  onRerender,
}) => {
  const filteredProjects = projects.filter(p => {
    if (filter === 'all') return true;
    return p.state === filter;
  });

  const getEmptyState = () => {
    switch (filter) {
      case 'all':
        return {
          icon: <Video size={48} />,
          title: 'No video projects yet',
          description: 'Create your first video project to get started with YouTube Studio.',
          actionLabel: 'Create New Video',
        };
      case 'rendering':
        return {
          icon: <Video size={48} />,
          title: 'No videos rendering',
          description: 'Videos currently rendering will appear here.',
        };
      case 'completed':
        return {
          icon: <Video size={48} />,
          title: 'No videos ready',
          description: 'Completed videos ready for publishing will appear here.',
        };
      case 'uploaded':
        return {
          icon: <Video size={48} />,
          title: 'No videos published',
          description: 'Videos published to YouTube will appear here.',
        };
      case 'failed':
        return {
          icon: <Video size={48} />,
          title: 'No failed videos',
          description: 'Failed video projects will appear here.',
        };
      default:
        return {
          icon: <Video size={48} />,
          title: 'No videos found',
          description: 'No videos match the current filter.',
        };
    }
  };

  const emptyState = getEmptyState();

  if (filteredProjects.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 px-4">
        <div className="text-center max-w-md">
          <div className="text-zinc-300 dark:text-zinc-600 mx-auto mb-4">
            {emptyState.icon}
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">
            {emptyState.title}
          </h3>
          <p className="text-zinc-500 dark:text-zinc-400 mb-6">
            {emptyState.description}
          </p>
          {filter === 'all' && emptyState.actionLabel && (
            <button
              onClick={onCreateNew}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all"
            >
              <Plus size={16} />
              {emptyState.actionLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filteredProjects.map(project => (
        <VideoListItem
          key={project.id}
          project={project}
          song={songs.get(project.songId)}
          onRender={() => onRender(project.id)}
          onPublish={() => onPublish(project.id)}
          onDelete={() => onDelete(project.id)}
          onRetry={() => onRetry(project.id)}
          onRerender={onRerender ? () => onRerender(project) : undefined}
        />
      ))}
    </div>
  );
};
