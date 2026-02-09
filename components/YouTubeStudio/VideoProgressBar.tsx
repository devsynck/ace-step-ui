import React from 'react';

interface VideoProgressBarProps {
  value: number; // 0-100
  className?: string;
}

export const VideoProgressBar: React.FC<VideoProgressBarProps> = ({
  value,
  className = ''
}) => {
  const clampedValue = Math.max(0, Math.min(100, value));
  const percentage = `${clampedValue}%`;

  return (
    <div className={`w-full h-2 bg-zinc-200 dark:bg-white/10 rounded-full overflow-hidden ${className}`}>
      <div
        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
        style={{ width: percentage }}
      />
    </div>
  );
};
