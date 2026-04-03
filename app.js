const CLIENT_ID = '8d83e767e2944f7f9a392318c2f46a2b';
const SCOPES = [
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
  accessToken: localStorage.getItem(STORAGE_KEYS.accessToken) || '',
  refreshToken: localStorage.getItem(STORAGE_KEYS.refreshToken) || '',
  expiresAt: Number(localStorage.getItem(STORAGE_KEYS.expiresAt) || 0),
  pauseTimer: null,
  activeDeviceId: '',
  activeDeviceName: '',
  devices: [],
};

const els = {
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  stopBtn: document.getElementById('stopBtn'),
  refreshDeviceBtn: document.getElementById('refreshDeviceBtn'),
  transferBtn: document.getElementById('transferBtn'),
  addPlayerBtn: document.getElementById('addPlayerBtn'),
  rosterList: document.getElementById('rosterList'),
  selectedPlayer: document.getElementById('selectedPlayer'),
  deviceSelect: document.getElementById('deviceSelect'),
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
  return `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}`;
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

function formatMsToTime(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function adjustTimeValue(value, deltaSeconds) {
  const current = parseTimeToMs(value);
  return formatMsToTime(current + deltaSeconds * 1000);
}

function renderDeviceOptions() {
  if (!els.deviceSelect) return;
  els.deviceSelect.innerHTML = '';
  if (!state.devices.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No Spotify device found yet';
    els.deviceSelect.appendChild(option);
    return;
  }
  state.devices.forEach((device) => {
    const option = document.createElement('option');
    option.value = device.id;
    option.textContent = `${device.name} (${device.type})${device.is_active ? ' — active' : ''}${device.is_restricted ? ' — restricted' : ''}`;
    if (device.id === state.activeDeviceId) option.selected = true;
    els.deviceSelect.appendChild(option);
  });
}

async function transferPlaybackToDevice(deviceId, play = false) {
  if (!deviceId) throw new Error('Choose a Spotify device first.');
  await spotifyFetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play })
  });
  const device = state.devices.find((d) => d.id === deviceId);
  state.activeDeviceId = deviceId;
  state.activeDeviceName = device?.name || '';
  renderDeviceOptions();
  updateStopButtons();
  setPlayerStatus(`Ready: ${state.activeDeviceName || 'Selected device'}`, 'This phone is selected for Spotify playback control.');
}

function updateStopButtons() {
  const canStop = Boolean(state.accessToken && state.activeDeviceId);
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
  renderDeviceOptions();
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
  if (parts.length === 2) return ((parts[0] * 60) + parts[1]) * 1000;
  if (parts.length === 3) return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
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
  state.activeDeviceId = '';
  state.activeDeviceName = '';
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.expiresAt);
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64UrlEncode(arrayBufferOrBytes) {
  const bytes = arrayBufferOrBytes instanceof ArrayBuffer ? new Uint8Array(arrayBufferOrBytes) : arrayBufferOrBytes;
  return btoa(String.fromCharCode(...bytes))
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
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return null;
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
    window.history.replaceState({}, '', getRedirectUri());
  } catch (err) {
    setAuthStatus('Connection failed', err.message);
  }
}

async function fetchDevices() {
  const data = await spotifyFetch('https://api.spotify.com/v1/me/player/devices');
  return data?.devices || [];
}

async function refreshActiveDevice() {
  if (!state.accessToken) {
    state.activeDeviceId = '';
    state.activeDeviceName = '';
    updateStopButtons();
    return null;
  }

  const devices = await fetchDevices();
  state.devices = devices;
  const usable = devices.filter((d) => !d.is_restricted);
  const active = usable.find((d) => d.is_active) || usable.find((d) => /iphone|android|phone/i.test(`${d.type} ${d.name}`)) || usable[0] || null;

  if (!active) {
    state.activeDeviceId = '';
    state.activeDeviceName = '';
    setPlayerStatus('No active Spotify device', 'Open the Spotify app on your phone first, start any song there, then tap Refresh Device.');
    updateStopButtons();
    return null;
  }

  state.activeDeviceId = active.id;
  state.activeDeviceName = active.name;
  renderDeviceOptions();
  setPlayerStatus(`Ready: ${active.name}`, 'Phone mode: this page controls the Spotify app/device instead of playing audio in the browser.');
  updateStopButtons();
  return active;
}

async function stopPlayback() {
  if (state.pauseTimer) {
    clearTimeout(state.pauseTimer);
    state.pauseTimer = null;
  }

  try {
    if (!state.activeDeviceId) await refreshActiveDevice();
    if (!state.activeDeviceId) {
      setClipStatus('—', 'No Spotify device selected');
      return;
    }

    await spotifyFetch(`https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(state.activeDeviceId)}`, { method: 'PUT' });
    setClipStatus(els.nowPlaying.textContent || '—', 'Stopped');
  } catch (err) {
    setPlayerStatus('Stop failed', err.message);
  }
}

function disconnect() {
  clearTokens();
  if (state.pauseTimer) {
    clearTimeout(state.pauseTimer);
    state.pauseTimer = null;
  }
  setAuthStatus('Not connected', 'Click Connect Spotify to sign in again.');
  setPlayerStatus('Not ready', 'Reconnect Spotify, then open the Spotify app on your phone and tap Refresh Device.');
  setClipStatus();
  updateStopButtons();
  renderDeviceOptions();
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
    const startMinusBtn = fragment.querySelector('.start-minus-btn');
    const startPlusBtn = fragment.querySelector('.start-plus-btn');
    const endMinusBtn = fragment.querySelector('.end-minus-btn');
    const endPlusBtn = fragment.querySelector('.end-plus-btn');
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

    startMinusBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      player.startTime = adjustTimeValue(player.startTime || '0:00', -5);
      if (parseTimeToMs(player.endTime) < parseTimeToMs(player.startTime)) player.endTime = player.startTime;
      saveRoster();
      render();
    });
    startPlusBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      player.startTime = adjustTimeValue(player.startTime || '0:00', 5);
      if (parseTimeToMs(player.endTime) < parseTimeToMs(player.startTime)) player.endTime = adjustTimeValue(player.startTime, 5);
      saveRoster();
      render();
    });
    endMinusBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      player.endTime = adjustTimeValue(player.endTime || player.startTime || '0:15', -5);
      if (parseTimeToMs(player.endTime) < parseTimeToMs(player.startTime)) player.endTime = player.startTime;
      saveRoster();
      render();
    });
    endPlusBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      player.endTime = adjustTimeValue(player.endTime || player.startTime || '0:15', 5);
      saveRoster();
      render();
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
  renderDeviceOptions();
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

  const startMs = parseTimeToMs(playerData.startTime);
  const endMs = parseTimeToMs(playerData.endTime);
  const durationMs = Math.max(1000, endMs - startMs || 15000);

  try {
    let device = state.devices.find((d) => d.id === els.deviceSelect?.value && !d.is_restricted) || null;
    if (!device) device = await refreshActiveDevice();
    if (!device) return;

    if (!device.is_active) {
      await transferPlaybackToDevice(device.id, false);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    await spotifyFetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(device.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [playerData.trackUri], position_ms: startMs })
    });

    if (state.pauseTimer) clearTimeout(state.pauseTimer);
    state.pauseTimer = setTimeout(async () => {
      try {
        await spotifyFetch(`https://api.spotify.com/v1/me/player/pause?device_id=${encodeURIComponent(device.id)}`, { method: 'PUT' });
        setClipStatus(`${playerData.songTitle} — ${playerData.artist}`, `Stopped at ${playerData.endTime || 'clip end'}`);
      } catch {}
      state.pauseTimer = null;
    }, durationMs);

    setClipStatus(`${playerData.songTitle} — ${playerData.artist}`, `${playerData.name} clip is playing on ${device.name}`);
  } catch (err) {
    const message = err.message || 'Playback failed.';
    if (/NO_ACTIVE_DEVICE|device/i.test(message)) {
      setPlayerStatus('Open Spotify first', 'Open the Spotify app on your phone, play any song there once, then tap Refresh Device and try again.');
    } else {
      setPlayerStatus('Playback failed', message);
    }
  }
}

function bindEvents() {
  els.connectBtn.addEventListener('click', beginLogin);
  els.disconnectBtn.addEventListener('click', disconnect);
  els.stopBtn.addEventListener('click', stopPlayback);
  els.refreshDeviceBtn?.addEventListener('click', async () => {
    try {
      await refreshActiveDevice();
    } catch (err) {
      setPlayerStatus('Device refresh failed', err.message);
    }
  });
  els.transferBtn?.addEventListener('click', async () => {
    try {
      const deviceId = els.deviceSelect?.value;
      await transferPlaybackToDevice(deviceId, false);
    } catch (err) {
      setPlayerStatus('Could not select device', err.message);
    }
  });
  els.addPlayerBtn.addEventListener('click', addPlayer);
  els.searchBtn.addEventListener('click', searchTracks);
  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') searchTracks();
  });
  els.selectedPlayer.addEventListener('change', (event) => {
    state.selectedPlayerId = event.target.value;
    render();
  });
  els.deviceSelect?.addEventListener('change', (event) => {
    state.activeDeviceId = event.target.value;
    const device = state.devices.find((d) => d.id === state.activeDeviceId);
    state.activeDeviceName = device?.name || '';
    updateStopButtons();
  });
}

async function boot() {
  loadRoster();
  bindEvents();
  await handleAuthCallback();

  if (state.accessToken) {
    setAuthStatus('Connected', `Redirect URI in Spotify should be ${getRedirectUri()}`);
    try {
      await refreshActiveDevice();
    } catch {
      setPlayerStatus('Open Spotify first', 'Open the Spotify app on your phone, make it the active device, then tap Refresh Device.');
    }
  } else {
    setAuthStatus('Not connected', `Add ${getRedirectUri()} as a redirect URI in your Spotify app.`);
    setPlayerStatus('Waiting for Spotify app', 'Phone mode controls the real Spotify app on your phone, not the browser audio player.');
  }

  renderDeviceOptions();
  render();
}

boot();
