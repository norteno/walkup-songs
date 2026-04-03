# Walk-Up Songs (GitHub repo songs only)

This version uses only audio files stored in your GitHub Pages repo.

## Setup

1. Put your audio files in `songs/`
2. List them in `songs/manifest.json`
3. Open the app on GitHub Pages
4. Search and assign songs to players

## Example manifest

```json
{
  "songs": [
    { "title": "Thunder", "artist": "Team Mix", "file": "thunder.mp3" },
    { "title": "Fireball", "artist": "Pitbull", "file": "fireball.mp3" }
  ]
}
```

Use only the filename in `file`, not `songs/thunder.mp3`.
