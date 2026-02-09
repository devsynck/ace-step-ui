import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Filter, Youtube } from 'lucide-react';
import type { Song, VideoProject, VideoProjectState, YouTubeMetadata } from '../types';
import { VideoList, PublishModal } from './YouTubeStudio/';
import { VideoGeneratorModal } from './VideoGeneratorModal';

interface YouTubeStudioViewProps {
  songs: Song[];
  user?: { username: string; isAdmin?: boolean; avatar_url?: string } | null;
  token: string | null;
  videoProjects: VideoProject[];
  onNavigateBack: () => void;
  // Video project callbacks
  loadVideoProjects: () => Promise<void>;
  createVideoProject: (songId: string, config: any, force?: boolean) => Promise<string | undefined>;
  renderVideoProject: (projectId: string) => Promise<void>;
  publishVideoProject: (projectId: string, metadata: YouTubeMetadata, accessToken: string) => Promise<void>;
  deleteVideoProject: (projectId: string) => Promise<void>;
}

export const YouTubeStudioView: React.FC<YouTubeStudioViewProps> = ({
  songs,
  user,
  token,
  videoProjects,
  onNavigateBack,
  loadVideoProjects,
  createVideoProject,
  renderVideoProject,
  publishVideoProject,
  deleteVideoProject,
}) => {
  const [filter, setFilter] = useState<VideoProjectState | 'all'>('all');
  const [selectedProject, setSelectedProject] = useState<VideoProject | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rerenderProject, setRerenderProject] = useState<VideoProject | null>(null);
  const [songsMap, setSongsMap] = useState<Map<string, Song>>(new Map());

  // Build songs map
  useEffect(() => {
    setSongsMap(new Map(songs.map(s => [s.id, s])));
  }, [songs]);

  // Load video projects on mount
  useEffect(() => {
    if (token) {
      loadVideoProjects();
    }
  }, [token]);

  // Poll for project updates every 2 seconds
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(async () => {
      const inProgressProjects = videoProjects.filter(
        p => p.state === 'rendering' || p.state === 'uploading'
      );

      if (inProgressProjects.length === 0) return;

      // Reload all projects to get updated status
      await loadVideoProjects();
    }, 2000);

    return () => clearInterval(interval);
  }, [videoProjects, token, loadVideoProjects]);

  const handleRenderProject = async (projectId: string) => {
    await renderVideoProject(projectId);
  };

  const handlePublishClick = (projectId: string) => {
    const project = videoProjects.find(p => p.id === projectId);
    if (project) {
      setSelectedProject(project);
      setShowPublishModal(true);
    }
  };

  const handlePublish = async (projectId: string, metadata: YouTubeMetadata, accessToken: string) => {
    await publishVideoProject(projectId, metadata, accessToken);
    setShowPublishModal(false);
    setSelectedProject(null);
  };

  const handleDeleteProject = async (projectId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this video project?');
    if (confirmed) {
      await deleteVideoProject(projectId);
    }
  };

  const handleRetryProject = async (projectId: string) => {
    await renderVideoProject(projectId);
  };

  const handleCreateProject = async (songId: string, config: any) => {
    // Pass force: true if this is a re-render (rerenderProject is set)
    await createVideoProject(songId, config, !!rerenderProject);
    setShowCreateModal(false);
    setRerenderProject(null);
  };

  const handleRerender = (project: VideoProject) => {
    setRerenderProject(project);
    setShowCreateModal(true);
  };

  // When creating from YouTube Studio View, also start background rendering
  const handleCreateProjectWithRender = async (songId: string, config: any) => {
    const projectId = await createVideoProject(songId, config);
    setShowCreateModal(false);
    // Note: Background rendering is handled by the modal's onCreateVideoProject callback
    // This is for project creation only - rendering will happen via the modal
  };

  const getFilterCount = (stateFilter: VideoProjectState | 'all') => {
    if (stateFilter === 'all') return videoProjects.length;
    return videoProjects.filter(p => p.state === stateFilter).length;
  };

  return (
    <div className="youtube-studio-view w-full h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-zinc-200 dark:border-white/10 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onNavigateBack}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft size={24} className="text-zinc-600 dark:text-zinc-400" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-600 rounded-lg">
                <Youtube className="text-white" size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">YouTube Studio</h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Manage video projects and publish to YouTube
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all"
          >
            <Plus size={16} />
            Create New Video
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex-shrink-0 border-b border-zinc-200 dark:border-white/10 px-6 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <Filter size={16} />
            <span className="text-sm font-medium">Filter:</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <FilterButton
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              count={getFilterCount('all')}
            >
              All
            </FilterButton>
            <FilterButton
              active={filter === 'rendering'}
              onClick={() => setFilter('rendering')}
              count={getFilterCount('rendering')}
            >
              Rendering
            </FilterButton>
            <FilterButton
              active={filter === 'completed'}
              onClick={() => setFilter('completed')}
              count={getFilterCount('completed')}
            >
              Ready
            </FilterButton>
            <FilterButton
              active={filter === 'uploaded'}
              onClick={() => setFilter('uploaded')}
              count={getFilterCount('uploaded')}
            >
              Uploaded
            </FilterButton>
            <FilterButton
              active={filter === 'failed'}
              onClick={() => setFilter('failed')}
              count={getFilterCount('failed')}
            >
              Failed
            </FilterButton>
          </div>
        </div>
      </div>

      {/* Video List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <VideoList
          projects={videoProjects}
          songs={songsMap}
          filter={filter}
          onRender={handleRenderProject}
          onPublish={handlePublishClick}
          onDelete={handleDeleteProject}
          onRetry={handleRetryProject}
          onCreateNew={() => setShowCreateModal(true)}
          onRerender={handleRerender}
        />
      </div>

      {/* Modals */}
      {showCreateModal && (
        <VideoGeneratorModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setRerenderProject(null);
          }}
          songs={songs}
          song={rerenderProject ? songs.find(s => s.id === rerenderProject.songId) : undefined}
          onPublishToYouTube={() => {}}
          backgroundMode={true}
          onCreateProject={handleCreateProject}
          initialConfig={rerenderProject?.config}
        />
      )}

      {showPublishModal && selectedProject && (
        <PublishModal
          isOpen={showPublishModal}
          onClose={() => {
            setShowPublishModal(false);
            setSelectedProject(null);
          }}
          project={selectedProject}
          song={songsMap.get(selectedProject.songId)}
          onPublish={handlePublish}
        />
      )}
    </div>
  );
};

// Filter Button Component
interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}

const FilterButton: React.FC<FilterButtonProps> = ({ active, onClick, count, children }) => {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
      }`}
    >
      {children} ({count})
    </button>
  );
};
