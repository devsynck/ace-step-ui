import React, { useState, useMemo } from 'react';
import { Song } from '../types';
import { Video, Search, Grid, List, Clock } from 'lucide-react';

interface SongSelectorProps {
  songs: Song[];
  selectedSong?: Song | null;
  generatedVideos: Map<string, string>;
  onSongSelect: (song: Song) => void;
  viewMode?: 'grid' | 'list';
}

type SongFilter = 'all' | 'with-video' | 'without-video';
type SortOption = 'newest' | 'oldest' | 'title';

export const SongSelector: React.FC<SongSelectorProps> = ({
  songs,
  selectedSong,
  generatedVideos,
  onSongSelect,
  viewMode = 'grid'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<SongFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [displayMode, setDisplayMode] = useState<'grid' | 'list'>(viewMode);

  const filteredAndSortedSongs = useMemo(() => {
    let filtered = [...songs];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(song =>
        song.title.toLowerCase().includes(query) ||
        song.style.toLowerCase().includes(query) ||
        (song.lyrics && song.lyrics.toLowerCase().includes(query))
      );
    }

    // Apply video status filter
    if (filter === 'with-video') {
      filtered = filtered.filter(song =>
        !!song.videoUrl || !!generatedVideos.get(song.id)
      );
    } else if (filter === 'without-video') {
      filtered = filtered.filter(song =>
        !song.videoUrl && !generatedVideos.get(song.id)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'newest') {
        return b.createdAt.getTime() - a.createdAt.getTime();
      } else if (sortBy === 'oldest') {
        return a.createdAt.getTime() - b.createdAt.getTime();
      } else {
        return a.title.localeCompare(b.title);
      }
    });

    return filtered;
  }, [songs, searchQuery, filter, sortBy, generatedVideos]);

  const hasVideo = (song: Song): boolean => {
    return !!song.videoUrl || !!generatedVideos.get(song.id);
  };

  return (
    <div className="song-selector">
      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input
            type="text"
            placeholder="Search by title, style, or lyrics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 transition-all"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-pink-500 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            All Songs ({songs.length})
          </button>
          <button
            onClick={() => setFilter('with-video')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              filter === 'with-video'
                ? 'bg-green-500 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            <Video size={14} />
            Has Video ({songs.filter(s => hasVideo(s)).length})
          </button>
          <button
            onClick={() => setFilter('without-video')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'without-video'
                ? 'bg-amber-500 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            Needs Video ({songs.filter(s => !hasVideo(s)).length})
          </button>
        </div>

        {/* Sort and View Toggle */}
        <div className="flex items-center justify-between">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title">By Title</option>
          </select>

          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 border border-zinc-200 dark:border-white/10">
            <button
              onClick={() => setDisplayMode('grid')}
              className={`p-2 rounded transition-all ${
                displayMode === 'grid'
                  ? 'bg-white dark:bg-zinc-600 text-pink-500 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
              title="Grid view"
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setDisplayMode('list')}
              className={`p-2 rounded transition-all ${
                displayMode === 'list'
                  ? 'bg-white dark:bg-zinc-600 text-pink-500 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-zinc-500 text-sm">
          {filteredAndSortedSongs.length} {filteredAndSortedSongs.length === 1 ? 'song' : 'songs'}
          {searchQuery && ` matching "${searchQuery}"`}
        </p>
      </div>

      {/* Songs Display */}
      {filteredAndSortedSongs.length === 0 ? (
        <div className="text-center py-16">
          <Video className="text-zinc-600 mx-auto mb-4" size={48} />
          <p className="text-zinc-500 text-lg mb-2">No songs found</p>
          <p className="text-zinc-600 text-sm">
            {searchQuery
              ? 'Try adjusting your search or filters'
              : filter === 'with-video'
              ? 'No songs with videos yet. Generate one first!'
              : filter === 'without-video'
              ? 'All songs have videos!'
              : 'Create your first song to get started.'}
          </p>
        </div>
      ) : displayMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredAndSortedSongs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              hasVideo={hasVideo(song)}
              selected={selectedSong?.id === song.id}
              onClick={() => onSongSelect(song)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSortedSongs.map((song) => (
            <SongListItem
              key={song.id}
              song={song}
              hasVideo={hasVideo(song)}
              selected={selectedSong?.id === song.id}
              onClick={() => onSongSelect(song)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface SongCardProps {
  song: Song;
  hasVideo: boolean;
  selected: boolean;
  onClick: () => void;
}

const SongCard: React.FC<SongCardProps> = ({ song, hasVideo, selected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`group relative rounded-xl overflow-hidden transition-all ${
        selected
          ? 'ring-2 ring-pink-500 ring-offset-2 ring-offset-zinc-900 dark:ring-offset-zinc-900'
          : 'hover:scale-[1.02] hover:shadow-xl'
      }`}
    >
      {/* Cover Image */}
      <div className="relative aspect-square bg-zinc-800">
        <img
          src={song.coverUrl}
          alt={song.title}
          className="w-full h-full object-cover"
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Video Status Badge */}
        {hasVideo && (
          <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
            <Video size={10} />
            Video
          </div>
        )}

        {/* Play/Pause indicator on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
            <Video className="text-white" size={24} />
          </div>
        </div>
      </div>

      {/* Song Info */}
      <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
        <p className="text-white text-sm font-medium truncate drop-shadow-lg">{song.title}</p>
        <p className="text-zinc-300 text-xs truncate drop-shadow-md">{song.style}</p>
      </div>
    </button>
  );
};

interface SongListItemProps {
  song: Song;
  hasVideo: boolean;
  selected: boolean;
  onClick: () => void;
}

const SongListItem: React.FC<SongListItemProps> = ({ song, hasVideo, selected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-lg transition-all w-full text-left ${
        selected
          ? 'bg-pink-500/20 border border-pink-500/50'
          : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-transparent'
      }`}
    >
      {/* Cover Image */}
      <div className="relative w-12 h-12 flex-shrink-0 rounded overflow-hidden">
        <img
          src={song.coverUrl}
          alt={song.title}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Song Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{song.title}</p>
        <p className="text-zinc-400 text-xs truncate">{song.style}</p>
      </div>

      {/* Duration and Video Status */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-zinc-500 text-xs flex items-center gap-1">
          <Clock size={12} />
          {song.duration}
        </span>
        {hasVideo && (
          <span className="bg-green-500/20 text-green-400 text-[10px] font-medium px-2 py-1 rounded-full flex items-center gap-1">
            <Video size={10} />
            Video
          </span>
        )}
      </div>
    </button>
  );
};
