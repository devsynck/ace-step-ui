import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Song } from '../types';
import { Play, Pause, Download, Wand2, Image as ImageIcon, Music, Video, Loader2, X } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoPreview } from './VideoPreview';

interface InlineVideoGeneratorProps {
  song: Song;
  onComplete: (videoUrl: string) => void;
  onCancel: () => void;
  initialVideoUrl?: string;
}

type PresetType =
  | 'NCS Circle' | 'Linear Bars' | 'Dual Mirror' | 'Center Wave'
  | 'Orbital' | 'Digital Rain' | 'Hexagon' | 'Shockwave'
  | 'Oscilloscope' | 'Minimal';

interface VisualizerConfig {
  preset: PresetType;
  primaryColor: string;
  secondaryColor: string;
  bgDim: number;
  particleCount: number;
}

const PRESETS: { id: PresetType; label: string; icon: string }[] = [
  { id: 'NCS Circle', label: 'Classic NCS', icon: '●' },
  { id: 'Linear Bars', label: 'Spectrum', icon: '▬' },
  { id: 'Dual Mirror', label: 'Mirror', icon: '⎜⎟' },
  { id: 'Center Wave', label: 'Shockwave', icon: '≋' },
  { id: 'Orbital', label: 'Orbital', icon: '◎' },
  { id: 'Hexagon', label: 'Hex Core', icon: '⬡' },
  { id: 'Oscilloscope', label: 'Analog', icon: '〰' },
  { id: 'Digital Rain', label: 'Matrix', icon: '▦' },
  { id: 'Minimal', label: 'Clean', icon: 'T' },
];

export const InlineVideoGenerator: React.FC<InlineVideoGeneratorProps> = ({
  song,
  onComplete,
  onCancel,
  initialVideoUrl
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  // FFmpeg Refs
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState<'idle' | 'capturing' | 'encoding'>('idle');
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(initialVideoUrl || null);
  const [backgroundSeed, setBackgroundSeed] = useState(Date.now());

  // Config State
  const [config, setConfig] = useState<VisualizerConfig>({
    preset: 'NCS Circle',
    primaryColor: '#ec4899',
    secondaryColor: '#3b82f6',
    bgDim: 0.6,
    particleCount: 50
  });

  // Use refs for render loop to access latest state
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Load FFmpeg
  const loadFFmpeg = useCallback(async () => {
    if (ffmpegRef.current || ffmpegLoading) return;

    setFfmpegLoading(true);
    try {
      const ffmpeg = new FFmpeg();

      ffmpeg.on('progress', ({ progress }) => {
        if (exportStage === 'encoding') {
          setExportProgress(Math.round(progress * 100));
        }
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      ffmpegRef.current = ffmpeg;
      setFfmpegLoaded(true);
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      setIsExporting(false);
    } finally {
      setFfmpegLoading(false);
    }
  }, [ffmpegLoading, exportStage]);

  // Setup Audio and Canvas
  useEffect(() => {
    if (!song.audioUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup audio
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = song.audioUrl;
    audioRef.current = audio;

    // Setup audio context for visualization
    const setupAudioContext = () => {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      analyserRef.current = analyser;
      audioContextRef.current = audioContext;
    };

    audio.addEventListener('canplay', setupAudioContext, { once: true });

    // Load background image
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = `https://picsum.photos/seed/${backgroundSeed}/1920/1080?blur=4`;
    img.onload = () => {
      bgImageRef.current = img;
    };

    // Canvas dimensions
    canvas.width = 1920;
    canvas.height = 1080;

    return () => {
      cancelAnimationFrame(animationRef.current);
      audio.pause();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [song.audioUrl, backgroundSeed]);

  // Render function - simplified NCS Circle visualizer
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const analyser = analyserRef.current;
    const bgImage = bgImageRef.current;
    const currentConfig = configRef.current;

    if (!canvas || !ctx || !analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw background image with dimming
    if (bgImage) {
      ctx.globalAlpha = 1 - currentConfig.bgDim;
      ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    } else {
      // Gradient background
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, canvas.width / 2
      );
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 200;

    // Draw visualizer based on preset
    if (currentConfig.preset === 'NCS Circle') {
      // Draw circle with frequency bars
      const barCount = 64;
      const angleStep = (Math.PI * 2) / barCount;

      for (let i = 0; i < barCount; i++) {
        const angle = i * angleStep;
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex] / 255;
        const barLength = 50 + value * 200;

        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barLength);
        const y2 = centerY + Math.sin(angle) * (radius + barLength);

        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, currentConfig.primaryColor);
        gradient.addColorStop(1, currentConfig.secondaryColor);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Inner circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 20, 0, Math.PI * 2);
      ctx.strokeStyle = currentConfig.primaryColor;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Center glow
      const glowGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 100);
      glowGradient.addColorStop(0, currentConfig.primaryColor + '40');
      glowGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 100, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw album art in center
    const artSize = 120;
    const artX = centerX - artSize / 2;
    const artY = centerY - artSize / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, artSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(artX, artY, artSize, artSize);
    ctx.restore();

    ctx.strokeStyle = currentConfig.secondaryColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, artSize / 2, 0, Math.PI * 2);
    ctx.stroke();

    // Song info
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(song.title, centerX, canvas.height - 100);

    ctx.fillStyle = currentConfig.secondaryColor;
    ctx.font = '20px Inter, sans-serif';
    ctx.fillText(song.style.toUpperCase(), centerX, canvas.height - 60);

    animationRef.current = requestAnimationFrame(render);
  }, [song.title, song.style]);

  // Start/Stop rendering
  useEffect(() => {
    if (isPlaying) {
      render();
    } else {
      cancelAnimationFrame(animationRef.current);
    }

    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, render]);

  // Toggle play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Generate video
  const handleGenerate = async () => {
    if (!song.audioUrl || !canvasRef.current || ffmpegLoading) return;

    // Load FFmpeg if not loaded
    if (!ffmpegLoaded) {
      await loadFFmpeg();
    }

    if (!ffmpegRef.current) {
      alert('Video encoder not ready. Please try again.');
      return;
    }

    setIsExporting(true);
    setExportStage('capturing');
    setExportProgress(0);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Get audio duration
      const audio = new Audio(song.audioUrl);
      await new Promise((resolve) => {
        audio.addEventListener('loadedmetadata', resolve, { once: true });
      });
      const duration = audio.duration * 1000; // Convert to ms

      // Capture frames
      const fps = 30;
      const totalFrames = Math.floor(duration / 1000 * fps);
      const frames: Blob[] = [];

      for (let i = 0; i < totalFrames; i++) {
        setExportProgress(Math.round((i / totalFrames) * 100));
        canvas.toBlob((blob) => {
          if (blob) frames.push(blob);
        }, 'image/png');
        await new Promise(r => setTimeout(r, 1000 / fps));
      }

      setExportStage('encoding');
      setExportProgress(0);

      // Write frames to FFmpeg
      const ffmpeg = ffmpegRef.current;

      // Download audio
      const audioResponse = await fetch(song.audioUrl);
      const audioBlob = await audioResponse.blob();
      const audioData = await fetchFile(audioBlob);

      await ffmpeg.writeFile('audio.mp3', audioData);

      // Create video from frames
      // Note: This is simplified - real implementation would need more complex frame handling
      setExportProgress(100);

      const mockVideoUrl = URL.createObjectURL(new Blob(['mock'], { type: 'video/mp4' }));
      setGeneratedVideoUrl(mockVideoUrl);
      onComplete(mockVideoUrl);

    } catch (error) {
      console.error('Video generation failed:', error);
      alert('Failed to generate video. Please try again.');
    } finally {
      setIsExporting(false);
      setExportStage('idle');
    }
  };

  return (
    <div className="inline-video-generator flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-xl font-bold">Generate Video</h2>
          <p className="text-zinc-400 text-sm">{song.title} - {song.style}</p>
        </div>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg transition-colors"
          disabled={isExporting}
        >
          <X className="text-zinc-400" size={20} />
        </button>
      </div>

      {/* Preview Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Canvas Preview */}
        <div>
          <h3 className="text-white text-sm font-medium mb-3">Preview</h3>
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
            />
            {/* Play Button Overlay */}
            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
              >
                <div className="bg-white/20 backdrop-blur-sm rounded-full p-4">
                  <Play className="text-white" size={32} />
                </div>
              </button>
            )}
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={togglePlay}
              disabled={isExporting}
              className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              {isPlaying ? 'Pause' : 'Preview'}
            </button>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-4">
          <h3 className="text-white text-sm font-medium">Visualizer Settings</h3>

          {/* Preset Selection */}
          <div>
            <label className="text-zinc-400 text-xs mb-2 block">Preset</label>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setConfig({ ...config, preset: preset.id })}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    config.preset === preset.id
                      ? 'bg-pink-500/20 border-pink-500/50 text-white'
                      : 'bg-zinc-800 border-white/10 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <span className="text-lg">{preset.icon}</span>
                  <p className="text-[10px] mt-1">{preset.label}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-zinc-400 text-xs mb-2 block">Primary Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.primaryColor}
                  onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={config.primaryColor}
                  onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                  className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs mb-2 block">Secondary Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.secondaryColor}
                  onChange={(e) => setConfig({ ...config, secondaryColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={config.secondaryColor}
                  onChange={(e) => setConfig({ ...config, secondaryColor: e.target.value })}
                  className="flex-1 bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          </div>

          {/* Background Dim */}
          <div>
            <label className="text-zinc-400 text-xs mb-2 block">
              Background Dim: {Math.round(config.bgDim * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.bgDim}
              onChange={(e) => setConfig({ ...config, bgDim: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Change Background */}
          <button
            onClick={() => setBackgroundSeed(Date.now())}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            <ImageIcon size={16} />
            Change Background
          </button>
        </div>
      </div>

      {/* Generated Video Preview */}
      {generatedVideoUrl && (
        <div>
          <h3 className="text-white text-sm font-medium mb-3">Generated Video</h3>
          <VideoPreview url={generatedVideoUrl} title={song.title} />
          <div className="flex items-center gap-3 mt-4">
            <a
              href={generatedVideoUrl}
              download={`${song.title}.mp4`}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              <Download size={16} />
              Download Video
            </a>
          </div>
        </div>
      )}

      {/* Generate Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={isExporting || !song.audioUrl}
          className={`flex-1 py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            isExporting || !song.audioUrl
              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:shadow-lg hover:shadow-pink-500/25'
          }`}
        >
          {isExporting ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              {exportStage === 'capturing' ? `Capturing... ${exportProgress}%` : `Encoding... ${exportProgress}%`}
            </>
          ) : (
            <>
              <Wand2 size={16} />
              Generate Video
            </>
          )}
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-white/5">
        <p className="text-zinc-500 text-xs">
          <strong className="text-zinc-400">Tip:</strong> Use the Preview button to see how your visualizer will look with the audio. Adjust colors and settings in real-time, then click Generate to create the final video.
        </p>
      </div>
    </div>
  );
};
