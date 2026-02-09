import React from 'react';
import { Clock, Loader2, CheckCircle2, Youtube, XCircle, AlertCircle } from 'lucide-react';
import type { VideoProjectState } from '../../types';

interface VideoStatusBadgeProps {
  state: VideoProjectState;
  progress?: number;
  error?: string;
}

export const VideoStatusBadge: React.FC<VideoStatusBadgeProps> = ({
  state,
  progress,
  error
}) => {
  const getStatusConfig = () => {
    switch (state) {
      case 'not_started':
        return {
          label: 'Not Started',
          icon: <Clock size={14} />,
          bgColor: 'bg-zinc-100 dark:bg-zinc-800',
          textColor: 'text-zinc-600 dark:text-zinc-400',
          borderColor: 'border-zinc-200 dark:border-white/10'
        };
      case 'rendering':
        return {
          label: progress !== undefined ? `Rendering ${Math.round(progress)}%` : 'Rendering...',
          icon: <Loader2 size={14} className="animate-spin" />,
          bgColor: 'bg-blue-500/10 dark:bg-blue-500/20',
          textColor: 'text-blue-600 dark:text-blue-400',
          borderColor: 'border-blue-500/20'
        };
      case 'uploading':
        return {
          label: progress !== undefined ? `Uploading ${Math.round(progress)}%` : 'Uploading...',
          icon: <Loader2 size={14} className="animate-spin" />,
          bgColor: 'bg-purple-500/10 dark:bg-purple-500/20',
          textColor: 'text-purple-600 dark:text-purple-400',
          borderColor: 'border-purple-500/20'
        };
      case 'completed':
        return {
          label: 'Ready to Publish',
          icon: <CheckCircle2 size={14} />,
          bgColor: 'bg-green-500/10 dark:bg-green-500/20',
          textColor: 'text-green-600 dark:text-green-400',
          borderColor: 'border-green-500/20'
        };
      case 'uploaded':
        return {
          label: 'Published',
          icon: <Youtube size={14} />,
          bgColor: 'bg-red-500/10 dark:bg-red-500/20',
          textColor: 'text-red-600 dark:text-red-400',
          borderColor: 'border-red-500/20'
        };
      case 'failed':
        return {
          label: 'Failed',
          icon: <XCircle size={14} />,
          bgColor: 'bg-red-500/10 dark:bg-red-500/20',
          textColor: 'text-red-600 dark:text-red-400',
          borderColor: 'border-red-500/20'
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          icon: <AlertCircle size={14} />,
          bgColor: 'bg-zinc-100 dark:bg-zinc-800',
          textColor: 'text-zinc-600 dark:text-zinc-400',
          borderColor: 'border-zinc-200 dark:border-white/10'
        };
      default:
        return {
          label: 'Unknown',
          icon: <AlertCircle size={14} />,
          bgColor: 'bg-zinc-100 dark:bg-zinc-800',
          textColor: 'text-zinc-600 dark:text-zinc-400',
          borderColor: 'border-zinc-200 dark:border-white/10'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bgColor} ${config.textColor} ${config.borderColor}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
      {error && state === 'failed' && (
        <span className="ml-1 text-[10px] opacity-70 max-w-[150px] truncate">
          ({error})
        </span>
      )}
    </div>
  );
};
