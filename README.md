# ACE-Step UI

A local-first web UI for [ACE-Step 1.5](https://github.com/ace-step/ACE-Step) AI music generation.

![ACE-Step UI](https://img.shields.io/badge/ACE--Step-1.5-pink)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- Generate music with text prompts and lyrics
- Simple and Custom generation modes
- Instrumental and vocal track support
- Audio editor with waveform visualization
- Stem extraction (vocals, drums, bass, other)
- Video generator with Pexels backgrounds
- Local SQLite database (no cloud required)
- Playlist management
- Beautiful gradient album covers (no internet needed)

## Requirements

- **Node.js** 18+
- **Python** 3.10+ (3.11 recommended)
- **NVIDIA GPU** with 8GB+ VRAM (12GB+ recommended)
- **FFmpeg** and **FFprobe** (for audio processing)
- [uv](https://github.com/astral-sh/uv) package manager (recommended for Python)

## Installation

### 1. Install ACE-Step

```bash
# Clone ACE-Step
git clone https://github.com/ace-step/ACE-Step
cd ACE-Step

# Create virtual environment and install
uv venv
uv pip install -e .

# Download the model (first run will download automatically, or manually):
# The model will be downloaded to ~/.cache/huggingface/

cd ..
```

### 2. Install ACE-Step UI

```bash
# Clone this repository
git clone https://github.com/your-org/ace-step-ui
cd ace-step-ui

# Run setup script
./setup.sh
```

Or manually:

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..

# Copy environment file
cp server/.env.example server/.env
```

### 3. Configure (Optional)

Edit `server/.env` to customize:

```env
# Server port
PORT=3001

# ACE-Step API URL (default: http://localhost:8001)
ACESTEP_API_URL=http://localhost:8001

# Database location
DATABASE_PATH=./data/acestep.db

# Optional: Pexels API key for video backgrounds
# Get a free key at https://www.pexels.com/api/
PEXELS_API_KEY=your_key_here
```

## Usage

### Step 1: Start ACE-Step API Server

In a terminal, start the ACE-Step API server:

```bash
cd /path/to/ACE-Step
uv run acestep-api --port 8001
```

Wait until you see "Application startup complete" before proceeding.

### Step 2: Start ACE-Step UI

In another terminal:

```bash
cd ace-step-ui
./start.sh
```

Or manually in two terminals:

```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
npm run dev
```

### Step 3: Open the UI

Open http://localhost:3000 in your browser.

On first launch, you'll be asked to set a username. This is stored locally.

## Generating Music

1. **Simple Mode**: Enter a description of the music you want
2. **Custom Mode**: Fine-tune parameters like BPM, key, duration, and add lyrics
3. Click "Create" to generate

Generated songs are saved locally and appear in your library.

## Additional Features

### Audio Editor
Click the waveform icon on any song to open the built-in audio editor for trimming, fading, and effects.

### Stem Extraction
Extract vocals, drums, bass, and other stems from any song using the Demucs-powered stem separator.

### Video Generator
Create music videos with:
- Custom backgrounds from Pexels (requires API key)
- Gradient animations
- Lyrics display
- Album art overlay

## Troubleshooting

### "ACE-Step API not reachable"
Make sure the ACE-Step API server is running on port 8001:
```bash
cd /path/to/ACE-Step
uv run acestep-api --port 8001
```

### "CUDA out of memory"
- Close other GPU-intensive applications
- Try generating shorter clips (30-60 seconds)
- Reduce batch size if available

### Songs show 0:00 duration
This can happen if FFprobe is not installed. Install it:
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```
New songs will automatically detect duration. For existing songs, they'll update when played.

## Development

```bash
# Run in development mode with hot reload
./start.sh

# Build for production
npm run build
cd server && npm run build
```

## License

MIT

## Credits

- [ACE-Step](https://github.com/ace-step/ACE-Step) - AI music generation model
- [Demucs](https://github.com/facebookresearch/demucs) - Audio source separation
- [Pexels](https://www.pexels.com) - Stock video backgrounds
