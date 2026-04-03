# Softball Walk-Up Songs

This is a simple local web app for assigning Spotify songs and clip times to players, then triggering those clips on game day.

## Already configured

The Spotify Client ID is already filled in inside `app.js`.

## Before you run it

In your Spotify Developer Dashboard, add this exact Redirect URI:

`http://127.0.0.1:3000/`

Spotify now requires exact redirect URI matching for browser auth flows, and local development should use an explicit loopback IP such as `127.0.0.1` rather than `localhost`.

## Run it

In this folder:

```bash
python3 -m http.server 3000
```

Then open:

`http://127.0.0.1:3000/`

## Notes

- Spotify Premium is required for the Web Playback SDK.
- Development-mode Spotify apps also require the app owner to have Premium.
- If Spotify says playback is blocked, try opening the page directly in Chrome or Safari, not inside another app's iframe.
- All roster data is stored in your browser `localStorage`.


## Updates

- Stop playback with the red Stop button at the top or the square button on any player card.
- Reorder players with the up/down arrows on each player card.
