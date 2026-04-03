const CLIENT_ID = '8d83e767e2944f7f9a392318c2f46a2b';
const SCOPES = [
  'streaming',
  'user-modify-playback-state',
  'user-read-playback-state'
];

const STORAGE_KEYS = {
  roster: 'walkup_roster_v1',
  codeVerifier: 'spotify_pkce_verifier',
  accessToken: 'spotify_access_token',
  refreshToken: 'spotify_refresh_token',
  expiresAt: 'spotify_expires_at'
};

const state = {
  roster: [],
  selectedPlayerId: null,
  player: null,
  playerDeviceId: null,
  accessToken: localStorage.getItem(STORAGE_KEYS.accessToken) || '',
  refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken) || '',
  expiresAt: Number(localStorage.getItem(STORAGE_KEYS.expiresAt) || 0),
  pauseTimer: null,
  sdkReady: false,
};

const els = {
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  stopBtn: document.getElementById('stopBtn'),
  addPlayerBtn: document.getElementById('addPlayerBtn'),
  rosterList: document.getElementById('rosterList'),
  selectedPlayer: document.getElementById('selectedPlayer'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  searchResults: document.getElementById('searchResults'),
  authStatus: document.getElementById('authStatus'),
  authHint: document.getElementById('authHint'),
  playerStatus: document.getElementById('playerStatus'),
  playerHint: document.getElementById('playerHint'),
  nowPlaying: document.getElementById('nowPlaying'),
  clipStatus: document.getElementById('clipStatus'),
  template: document.getElementById('playerCardTemplate')
};

function getRedirectUri() {
  return `https://norteno.github.io/walkup-songs/`;
}

function setAuthStatus(text, hint = '') {
  els.authStatus.textContent = text;
  els.authHint.textContent = hint;
}

function setPlayerStatus(text, hint = '') {
  els.playerStatus.textContent = text;
  els.playerHint.textContent = hint;
}

function setClipStatus(title = '—', status = 'No clip playing') {
  els.nowPlaying.textContent = title;
  els.clipStatus.textContent = status;
}

function updateStopButtons() {
  const canStop = Boolean(state.accessToken && state.playerDeviceId);
  if (els.stopBtn) els.stopBtn.disabled = !canStop;
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultPlayer() {
  return {
    id: uuid(),
    name: `Player ${state.roster.length + 1}`,
    songTitle: '',
    artist: '',
    albumImage: '',
    trackUri: '',
    trackId: '',
    startTime: '0:00',
    endTime: '0:15'
  };
}

function saveRoster() {
  localStorage.setItem(STORAGE_KEYS.roster, JSON.stringify(state.roster));
}

function movePlayer(playerId, direction) {
  const index = state.roster.findIndex((player) => player.id === playerId);
  if (index < 0) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.roster.length) return;
  const [player] = state.roster.splice(index, 1);
  state.roster.splice(newIndex, 0, player);
  saveRoster();
  render();
}

function loadRoster() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.roster) || '[]');
    if (Array.isArray(saved) && saved.length) {
      state.roster = saved;
      state.selectedPlayerId = saved[0].id;
      return;
    }
  } catch {}
  state.roster = [createDefaultPlayer()];
  state.selectedPlayerId = state.roster[0].id;
  saveRoster();
}

function parseTimeToMs(value) {
  if (!value) return 0;
  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const parts = trimmed.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 2) {
    return ((parts[0] * 60) + parts[1]) * 1000;
  }
  if (parts.length === 3) {
    return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
  }
  return 0;
}

function formatTrack(track) {
  const artists = track.artists.map((artist) => artist.name).join(', ');
  return {
    songTitle: track.name,
    artist: artists,
    albumImage: track.album.images?.[2]?.url || track.album.images?.[1]?.url || track.album.images?.[0]?.url || '',
    trackUri: track.uri,
    trackId: track.id,
  };
}

function setTokens({ access_token, refresh_token, expires_in }) {
  state.accessToken = access_token;
  if (refresh_token) state.refreshToken = refresh_token;
  state.expiresAt = Date.now() + ((expires_in || 3600) - 30) * 1000;
  localStorage.setItem(STORAGE_KEYS.accessToken, state.accessToken);
  localStorage.setItem(STORAGE_KEYS.refreshToken, state.refreshToken);
  localStorage.setItem(STORAGE_KEYS.expiresAt, String(state.expiresAt));
}

function clearTokens() {
  state.accessToken = '';
  state.refreshToken = '';
  state.expiresAt = 0;
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.expiresAt);
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(arrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function beginLogin() {
  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(64)));
  localStorage.setItem(STORAGE_KEYS.codeVerifier, verifier);
  const challenge = base64UrlEncode(await sha256(verifier));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    redirect_uri: getRedirectUri(),
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem(STORAGE_KEYS.codeVerifier);
  if (!verifier) throw new Error('Missing PKCE verifier. Try connecting again.');

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Spotify token exchange failed.');
  }

  const data = await response.json();
  setTokens(data);
  localStorage.removeItem(STORAGE_KEYS.codeVerifier);
}

async function refreshAccessToken() {
  if (!state.refreshToken) return false;

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: state.refreshToken,
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    clearTokens();
    return false;
  }

  const data = await response.json();
  setTokens({ ...data, refresh_token: data.refresh_token || state.refreshToken });
  return true;
}

async function ensureAccessToken() {
  if (state.accessToken && Date.now() < state.expiresAt) return state.accessToken;
  const refreshed = await refreshAccessToken();
  return refreshed ? state.accessToken : '';
}

async function spotifyFetch(url, options = {}) {
  const token = await ensureAccessToken();
  if (!token) throw new Error('Not connected to Spotify.');

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return spotifyFetch(url, options);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Spotify request failed: ${response.status}`);
  }
  return response.json();
}

async function handleAuthCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    setAuthStatus('Spotify denied access', error);
    return;
  }

  if (!code) return;

  setAuthStatus('Finishing Spotify login…', 'Exchanging the authorization code.');
  try {
    await exchangeCodeForToken(code);
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    window.history.replaceState({}, '', url.pathname);
  } catch (err) {
    setAuthStatus('Connection failed', err.message);
  }
}

async function stopPlayback() {
  if (state.pauseTimer) {
    clearTimeout(state.pauseTimer);
    state.pauseTimer = null;
  }

  if (!state.accessToken || !state.playerDeviceId) {
    setClipStatus('—', 'No clip playing');
    updateStopButtons();
    return;
  }

  try {
    await spotifyFetch(`https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(state.playerDeviceId)}`, { method: 'PUT' });
    setClipStatus(els.nowPlaying.textContent || '—', 'Stopped');
  } catch (err) {
    setPlayerStatus('Stop failed', err.message);
  }
}

function disconnect() {
  clearTokens();
  if (state.player) {
    try { state.player.disconnect(); } catch {}
    state.player = null;
    state.playerDeviceId = null;
    state.sdkReady = false;
  }
  setAuthStatus('Not connected', 'Click Connect Spotify to sign in again.');
  setPlayerStatus('Not ready', 'Reconnect Spotify to create a browser player.');
  setClipStatus();
  updateStopButtons();
  render();
}

function updateSelectedPlayerOptions() {
  const current = state.selectedPlayerId;
  els.selectedPlayer.innerHTML = '';
  state.roster.forEach((player) => {
    const option = document.createElement('option');
    option.value = player.id;
    option.textContent = player.name || 'Unnamed player';
    if (player.id === current) option.selected = true;
    els.selectedPlayer.appendChild(option);
  });
}

function renderRoster() {
  els.rosterList.innerHTML = '';

  for (const player of state.roster) {
    const fragment = els.template.content.cloneNode(true);
    const card = fragment.querySelector('.player-card');
    const nameInput = fragment.querySelector('.player-name-input');
    const songMeta = fragment.querySelector('.song-meta');
    const startInput = fragment.querySelector('.start-input');
    const endInput = fragment.querySelector('.end-input');
    const moveUpBtn = fragment.querySelector('.move-up-btn');
    const moveDownBtn = fragment.querySelector('.move-down-btn');
    const playBtn = fragment.querySelector('.play-btn');
    const stopCardBtn = fragment.querySelector('.stop-card-btn');
    const deleteBtn = fragment.querySelector('.delete-btn');

    nameInput.value = player.name || '';
    startInput.value = player.startTime || '0:00';
    endInput.value = player.endTime || '0:15';

    if (player.songTitle) {
      songMeta.classList.remove('empty-song');
      songMeta.textContent = `${player.songTitle} — ${player.artist}`;
    }

    const index = state.roster.findIndex((p) => p.id === player.id);
    moveUpBtn.disabled = index === 0;
    moveDownBtn.disabled = index === state.roster.length - 1;

    if (player.id === state.selectedPlayerId) {
      card.style.borderColor = '#8dc9a8';
      card.style.boxShadow = '0 0 0 3px rgba(15, 157, 88, 0.08)';
    }

    nameInput.addEventListener('input', (event) => {
      player.name = event.target.value;
      updateSelectedPlayerOptions();
      saveRoster();
    });

    startInput.addEventListener('input', (event) => {
      player.startTime = event.target.value;
      saveRoster();
    });

    endInput.addEventListener('input', (event) => {
      player.endTime = event.target.value;
      saveRoster();
    });

    card.addEventListener('click', (event) => {
      if (event.target.closest('button') || event.target.closest('input')) return;
      state.selectedPlayerId = player.id;
      render();
    });

    moveUpBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      movePlayer(player.id, -1);
    });

    moveDownBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      movePlayer(player.id, 1);
    });

    playBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await playPlayerClip(player.id);
    });

    stopCardBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await stopPlayback();
    });

    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.roster.length === 1) {
        state.roster[0] = createDefaultPlayer();
        state.selectedPlayerId = state.roster[0].id;
      } else {
        state.roster = state.roster.filter((p) => p.id !== player.id);
        if (state.selectedPlayerId === player.id) {
          state.selectedPlayerId = state.roster[0]?.id || null;
        }
      }
      saveRoster();
      render();
    });

    els.rosterList.appendChild(fragment);
  }
}

function render() {
  updateSelectedPlayerOptions();
  renderRoster();
  const connected = Boolean(state.accessToken);
  els.connectBtn.hidden = connected;
  els.disconnectBtn.hidden = !connected;
  if (connected) {
    setAuthStatus('Connected', `Redirect URI in Spotify should be ${getRedirectUri()}`);
  }
  updateStopButtons();
}

function addPlayer() {
  const player = createDefaultPlayer();
  state.roster.push(player);
  state.selectedPlayerId = player.id;
  saveRoster();
  render();
}

async function searchTracks() {
  const query = els.searchInput.value.trim();
  if (!query) return;
  if (!state.selectedPlayerId) {
    els.searchResults.textContent = 'Add or select a player first.';
    return;
  }

  els.searchResults.textContent = 'Searching…';

  try {
    const data = await spotifyFetch(`https://api.spotify.com/v1/search?${new URLSearchParams({ q: query, type: 'track', limit: '10' }).toString()}`);
    const items = data?.tracks?.items || [];
    if (!items.length) {
      els.searchResults.textContent = 'No songs found.';
      return;
    }

    els.searchResults.innerHTML = '';
    items.forEach((track) => {
      const div = document.createElement('div');
      div.className = 'search-result';
      const artists = track.artists.map((a) => a.name).join(', ');
      const art = track.album.images?.[2]?.url || track.album.images?.[1]?.url || '';
      div.innerHTML = `
        <div class="search-result-top">
          <div>
            <strong>${track.name}</strong>
            <div>${artists}</div>
            <small>${track.album.name}</small>
          </div>
          ${art ? `<img src="${art}" alt="Album art" width="56" height="56" style="border-radius:12px; object-fit:cover;">` : ''}
        </div>
      `;
      const assignBtn = document.createElement('button');
      assignBtn.textContent = 'Assign to player';
      assignBtn.className = 'secondary-btn';
      assignBtn.addEventListener('click', () => {
        const player = state.roster.find((p) => p.id === state.selectedPlayerId);
        if (!player) return;
        Object.assign(player, formatTrack(track));
        saveRoster();
        render();
      });
      div.appendChild(assignBtn);
      els.searchResults.appendChild(div);
    });
  } catch (err) {
    els.searchResults.textContent = err.message;
  }
}

async function initializeSpotifyPlayer() {
  if (!state.accessToken || state.player || !window.Spotify) return;

  setPlayerStatus('Starting browser player…', 'Accept playback transfer prompts if Spotify asks.');

  const player = new window.Spotify.Player({
    name: 'Softball Walk-Up Songs',
    getOAuthToken: async (cb) => cb(await ensureAccessToken()),
    volume: 0.8,
  });

  player.addListener('ready', ({ device_id }) => {
    state.playerDeviceId = device_id;
    state.sdkReady = true;
    setPlayerStatus('Ready', 'Browser player connected.');
    updateStopButtons();
  });

  player.addListener('not_ready', () => {
    state.sdkReady = false;
    state.playerDeviceId = null;
    setPlayerStatus('Offline', 'Open the page in a desktop browser and reconnect.');
    updateStopButtons();
  });

  player.addListener('initialization_error', ({ message }) => {
    setPlayerStatus('Initialization error', message);
  });

  player.addListener('authentication_error', ({ message }) => {
    setPlayerStatus('Authentication error', message);
  });

  player.addListener('account_error', ({ message }) => {
    setPlayerStatus('Premium required', message);
  });

  player.addListener('playback_error', ({ message }) => {
    setPlayerStatus('Playback error', message);
  });

  player.addListener('player_state_changed', (sdkState) => {
    if (!sdkState?.track_window?.current_track) return;
    const track = sdkState.track_window.current_track;
    setClipStatus(`${track.name} — ${track.artists.map((a) => a.name).join(', ')}`, sdkState.paused ? 'Paused' : 'Playing');
  });

  await player.connect();
  state.player = player;
}

async function transferPlaybackHere() {
  if (!state.playerDeviceId) throw new Error('Spotify browser player is not ready yet.');

  await spotifyFetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [state.playerDeviceId], play: false })
  });
}

async function playPlayerClip(playerId) {
  const playerData = state.roster.find((p) => p.id === playerId);
  if (!playerData) return;
  if (!playerData.trackUri) {
    setClipStatus(playerData.name || 'Player', 'Select a song first.');
    return;
  }

  if (!state.accessToken) {
    setAuthStatus('Not connected', 'Connect Spotify before playing clips.');
    return;
  }

  if (!state.player) {
    await initializeSpotifyPlayer();
  }

  const startMs = parseTimeToMs(playerData.startTime);
  const endMs = parseTimeToMs(playerData.endTime);
  const durationMs = Math.max(1000, endMs - startMs || 15000);

  try {
    await transferPlaybackHere();
    await spotifyFetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(state.playerDeviceId)}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [playerData.trackUri], position_ms: startMs })
    });

    if (state.pauseTimer) clearTimeout(state.pauseTimer);
    state.pauseTimer = setTimeout(async () => {
      try {
        await spotifyFetch(`https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(state.playerDeviceId)}`, { method: 'PUT' });
        setClipStatus(`${playerData.songTitle} — ${playerData.artist}`, `Stopped at ${playerData.endTime || 'clip end'}`);
      } catch {}
      state.pauseTimer = null;
    }, durationMs);

    setClipStatus(`${playerData.songTitle} — ${playerData.artist}`, `${playerData.name} clip is playing`);
  } catch (err) {
    setPlayerStatus('Playback failed', err.message);
  }
}

function bindEvents() {
  els.connectBtn.addEventListener('click', beginLogin);
  els.disconnectBtn.addEventListener('click', disconnect);
  els.stopBtn.addEventListener('click', stopPlayback);
  els.addPlayerBtn.addEventListener('click', addPlayer);
  els.searchBtn.addEventListener('click', searchTracks);
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchTracks();
  });
  els.selectedPlayer.addEventListener('change', (event) => {
    state.selectedPlayerId = event.target.value;
    render();
  });
}

window.onSpotifyWebPlaybackSDKReady = async () => {
  if (state.accessToken) {
    await initializeSpotifyPlayer();
  }
};

async function boot() {
  loadRoster();
  bindEvents();
  await handleAuthCallback();

  if (state.accessToken) {
    setAuthStatus('Connected', `Redirect URI in Spotify should be ${getRedirectUri()}`);
    if (window.Spotify) await initializeSpotifyPlayer();
  } else {
    setAuthStatus('Not connected', `Add ${getRedirectUri()} as a redirect URI in your Spotify app.`);
  }

  render();
}

boot();
