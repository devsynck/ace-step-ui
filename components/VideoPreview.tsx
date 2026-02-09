import React from 'react';
import { Film } from 'lucide-react';

interface VideoPreviewProps {
  url: string | null | undefined;
  title?: string;
  className?: string;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ url, title, className = '' }) => {
  return (
    <div className={`video-preview-wrapper ${className}`}>
      <div className="w-full aspect-video bg-zinc-900 rounded-lg overflow-hidden border border-white/10 shadow-2xl">
        {url ? (
          <video
            src={url}
            controls
            className="w-full h-full object-contain"
            title={title}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Film className="text-zinc-700 mx-auto mb-3" size={48} />
              <p className="text-zinc-600 text-sm">No video selected</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
