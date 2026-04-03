# Walk-Up Songs (GitHub-hosted local audio)

This version loads songs only from your GitHub Pages repo.

## Repo structure

```
index.html
styles.css
app.js
songs/
  manifest.json
  Cook.mp3
  All I Do Is Win.mp3
```

## Important rule

Use the exact GitHub filename in `manifest.json`, including capitalization.

Example:

```json
{
  "songs": [
    { "title": "COOK", "artist": "Sofi Tukker", "file": "songs/Cook.mp3" },
    { "title": "All I Do Is Win", "artist": "DJ Khaled", "file": "songs/All I Do Is Win.mp3" }
  ]
}
```

This app accepts either `songs/Filename.mp3` or just `Filename.mp3`, but using full `songs/...` paths in the manifest is the safest choice.

## If mobile says the file cannot be loaded

1. Open the MP3 directly in the browser.
2. Confirm the path and capitalization match exactly.
3. Hard refresh the app after updating GitHub Pages.
