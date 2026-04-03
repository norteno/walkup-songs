# Local Walk-Up Songs App

This version removes Spotify completely and plays local audio files instead.

## Quick start

Open `index.html` from your GitHub Pages site or from a simple local server.

## Two ways to add songs

### Option 1: put songs in your GitHub repo

Create a `songs/` folder and add audio files plus a `manifest.json` file.

Example:

```json
{
  "songs": [
    { "title": "Thunder", "artist": "Team Mix", "file": "song1.mp3" },
    { "title": "Fireball", "artist": "Pitbull", "file": "fireball.mp3" }
  ]
}
```

If you want album art, add an `image` field pointing to a file path or URL.

### Option 2: upload files inside the app

Use the **Upload song** button or **Upload for player** on a player card.
Those uploaded files are stored in browser local storage for that device/browser.

## Notes

- This version is much better for iPhone/iPad because it does not rely on Spotify auth or browser SDK playback.
- Only use audio files you have permission to use.
