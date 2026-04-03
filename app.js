const STORAGE_KEYS = {
  roster: 'walkup_local_roster_v1',
  topInfoHidden: 'walkup_local_top_info_hidden_v1'
};

const state = {
  roster: [],
  selectedPlayerId: null,
  librarySongs: [],
  pauseTimer: null,
  currentAudio: null,
  topInfoHidden: false,
};

const els = {
  stopBtn: document.getElementById('stopBtn'),
  addPlayerBtn: document.getElementById('addPlayerBtn'),
  toggleSetupBtn: document.getElementById('toggleSetupBtn'),
  setupHero: document.getElementById('setupHero'),
  setupStatus: document.getElementById('setupStatus'),
  setupInstructions: document.getElementById('setupInstructions'),
  rosterList: document.getElementById('rosterList'),
  selectedPlayer: document.getElementById('selectedPlayer'),
  librarySearch: document.getElementById('librarySearch'),
  libraryResults: document.getElementById('libraryResults'),
  libraryStatus: document.getElementById('libraryStatus'),
  libraryHint: document.getElementById('libraryHint'),
  nowPlaying: document.getElementById('nowPlaying'),
  clipStatus: document.getElementById('clipStatus'),
  template: document.getElementById('playerCardTemplate')
};

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultPlayer() {
  return {
    id: uuid(),
    name: `Player ${state.roster.length + 1}`,
    songTitle: '',
    artist: '',
    sourceType: 'repo',
    sourcePath: '',
    sourceName: '',
    albumImage: '',
    startTime: '0:00',
    endTime: '0:15'
  };
}

function saveRoster() {
  localStorage.setItem(STORAGE_KEYS.roster, JSON.stringify(state.roster));
}

function loadRoster() {
  state.topInfoHidden = localStorage.getItem(STORAGE_KEYS.topInfoHidden) === 'true';

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.roster) || '[]');
    if (Array.isArray(saved) && saved.length) {
      state.roster = saved;
      state.selectedPlayerId = saved[0].id;
      return;
    }
  } catch (error) {
    console.error('Could not load saved roster:', error);
  }

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

function setClipStatus(title = '—', status = 'No clip playing') {
  els.nowPlaying.textContent = title;
  els.clipStatus.textContent = status;
}

function getSelectedPlayer() {
  return state.roster.find((player) => player.id === state.selectedPlayerId) || state.roster[0] || null;
}

function getPlayableSource(player) {
  if (!player || !player.sourcePath) return null;
  return new URL(`./songs/${player.sourcePath}`, window.location.href).toString();
}

function stopPlayback() {
  clearTimeout(state.pauseTimer);
  state.pauseTimer = null;

  if (state.currentAudio) {
    try {
      state.currentAudio.pause();
      state.currentAudio.currentTime = 0;
    } catch (error) {
      console.error('Could not stop audio:', error);
    }
  }

  setClipStatus('—', 'No clip playing');
}

async function playPlayer(playerId) {
  const player = state.roster.find((item) => item.id === playerId);
  if (!player) return;

  const source = getPlayableSource(player);
  if (!source) {
    alert('Choose a repo song for this player first.');
    return;
  }

  stopPlayback();

  const startMs = parseTimeToMs(player.startTime);
  let endMs = parseTimeToMs(player.endTime);
  if (endMs <= startMs) endMs = startMs + 15000;

  const audio = state.currentAudio || new Audio();
  state.currentAudio = audio;

  audio.pause();
  audio.src = source;
  audio.preload = 'auto';
  audio.playsInline = true;

  setClipStatus(
    player.name || 'Player',
    `Loading ${player.songTitle || player.sourceName || 'song'}…`
  );

  const beginClipWindow = async () => {
    try {
      audio.currentTime = startMs / 1000;
    } catch (error) {
      console.warn('Could not seek before playback:', error);
    }

    try {
      if (audio.paused) {
        await audio.play();
      }
    } catch (error) {
      console.error('Second play attempt failed:', error);
      alert('Playback was blocked on this phone. Tap the player again.');
      setClipStatus('—', 'Playback blocked');
      return;
    }

    setClipStatus(
      player.name || 'Player',
      `${player.songTitle || player.sourceName || 'Song'} • ${player.artist || 'Local audio'}`
    );

    clearTimeout(state.pauseTimer);
    state.pauseTimer = window.setTimeout(() => {
      stopPlayback();
    }, Math.max(250, endMs - startMs));
  };

  audio.addEventListener(
    'error',
    () => {
      console.error('Audio failed to load:', source);
      setClipStatus('—', 'Could not load audio file');
      alert('Could not load audio file.');
    },
    { once: true }
  );

  try {
    audio.load();

    // Critical for mobile browsers: first play must happen directly from the tap.
    await audio.play();

    if (audio.readyState >= 1) {
      await beginClipWindow();
    } else {
      audio.addEventListener(
        'loadedmetadata',
        () => {
          beginClipWindow();
        },
        { once: true }
      );
    }
  } catch (error) {
    console.error('Playback failed:', error);
    alert('Playback was blocked on this phone. Tap the player again.');
    setClipStatus('—', 'Playback blocked');
  }
}

function updatePlayer(playerId, updates) {
  const player = state.roster.find((item) => item.id === playerId);
  if (!player) return;

  Object.assign(player, updates);
  saveRoster();
  render();
}

function movePlayer(playerId, direction) {
  const index = state.roster.findIndex((player) => player.id === playerId);
  if (index < 0) return;

  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.roster.length) return;

  const [player] = state.roster.splice(index, 1);
  state.roster.splice(nextIndex, 0, player);

  saveRoster();
  render();
}

function deletePlayer(playerId) {
  const index = state.roster.findIndex((item) => item.id === playerId);
  if (index < 0) return;

  state.roster.splice(index, 1);

  if (!state.roster.length) {
    state.roster.push(createDefaultPlayer());
  }

  if (!state.roster.some((item) => item.id === state.selectedPlayerId)) {
    state.selectedPlayerId = state.roster[0].id;
  }

  saveRoster();
  render();
}

function assignRepoSongToPlayer(playerId, song) {
  updatePlayer(playerId, {
    sourceType: 'repo',
    sourcePath: song.file,
    sourceName: song.file,
    songTitle: song.title || song.file,
    artist: song.artist || 'Repo song',
    albumImage: song.image || ''
  });
}

async function loadRepoSongs() {
  els.libraryStatus.textContent = 'Checking for repo songs…';
  els.libraryHint.textContent = 'Looking for songs/manifest.json...';

  try {
    const manifestUrl = `./songs/manifest.json?v=${Date.now()}`;
    const response = await fetch(manifestUrl, { cache: 'no-store' });

    if (!response.ok) {
      throw new Error(`Manifest request failed: ${response.status}`);
    }

    const data = await response.json();
    const songs = Array.isArray(data) ? data : Array.isArray(data.songs) ? data.songs : [];

    state.librarySongs = songs.filter((song) => song && song.file);

    if (state.librarySongs.length) {
      els.libraryStatus.textContent = `${state.librarySongs.length} repo song${state.librarySongs.length === 1 ? '' : 's'} loaded`;
      els.libraryHint.textContent = 'Tap “Choose” to assign one to the selected player.';
    } else {
      els.libraryStatus.textContent = 'Manifest found, but no songs listed';
      els.libraryHint.textContent = 'Check songs/manifest.json and make sure each song has a file value.';
    }
  } catch (error) {
    console.error('Could not load repo songs:', error);
    state.librarySongs = [];
    els.libraryStatus.textContent = 'No repo songs found yet';
    els.libraryHint.textContent = 'Add a songs folder and valid manifest.json to your GitHub repo, then refresh the page.';
  }

  renderLibraryResults();
}

function renderSelectedPlayerOptions() {
  els.selectedPlayer.innerHTML = '';

  state.roster.forEach((player) => {
    const option = document.createElement('option');
    option.value = player.id;
    option.textContent = player.name || 'Unnamed player';

    if (player.id === state.selectedPlayerId) {
      option.selected = true;
    }

    els.selectedPlayer.appendChild(option);
  });
}

function renderLibraryResults() {
  const player = getSelectedPlayer();
  const query = (els.librarySearch.value || '').trim().toLowerCase();

  const songs = state.librarySongs.filter((song) => {
    if (!query) return true;
    return `${song.title || ''} ${song.artist || ''} ${song.file || ''}`
      .toLowerCase()
      .includes(query);
  });

  els.libraryResults.innerHTML = '';

  if (!songs.length) {
    els.libraryResults.className = 'search-results empty-state';
    els.libraryResults.textContent = state.librarySongs.length
      ? 'No songs match that search.'
      : 'No repo songs loaded yet. Add songs/manifest.json in your GitHub repo.';
    return;
  }

  els.libraryResults.className = 'search-results';

  songs.forEach((song) => {
    const row = document.createElement('div');
    row.className = 'song-result';

    const meta = document.createElement('div');
    meta.className = 'song-result-meta';

    const title = document.createElement('strong');
    title.textContent = song.title || song.file;

    const artist = document.createElement('span');
    artist.textContent = song.artist || song.file;

    meta.append(title, artist);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = player ? 'Choose' : 'Select a player';
    btn.disabled = !player;
    btn.addEventListener('click', () => {
      if (!player) return;
      assignRepoSongToPlayer(player.id, song);
    });

    row.append(meta, btn);
    els.libraryResults.appendChild(row);
  });
}

function applyTopInfoVisibility() {
  const shouldHide = !!state.topInfoHidden;

  [els.setupHero, els.setupStatus, els.setupInstructions].forEach((el) => {
    if (el) {
      el.classList.toggle('is-hidden', shouldHide);
    }
  });

  if (els.toggleSetupBtn) {
    els.toggleSetupBtn.textContent = shouldHide ? 'Show top info' : 'Hide top info';
  }
}

function renderRoster() {
  els.rosterList.innerHTML = '';

  state.roster.forEach((player, index) => {
    const fragment = els.template.content.cloneNode(true);
    const card = fragment.querySelector('.player-card');
    const nameInput = fragment.querySelector('.player-name-input');
    const songMeta = fragment.querySelector('.song-meta');
    const startInput = fragment.querySelector('.start-input');
    const endInput = fragment.querySelector('.end-input');
    const playBtn = fragment.querySelector('.play-btn');
    const stopBtn = fragment.querySelector('.stop-card-btn');
    const deleteBtn = fragment.querySelector('.delete-btn');
    const upBtn = fragment.querySelector('.move-up-btn');
    const downBtn = fragment.querySelector('.move-down-btn');
    const chooseFromLibraryBtn = fragment.querySelector('.choose-from-library-btn');

    nameInput.value = player.name || '';
    startInput.value = player.startTime || '0:00';
    endInput.value = player.endTime || '0:15';

    if (player.songTitle || player.sourceName) {
      songMeta.classList.remove('empty-song');

      if (player.albumImage) {
        songMeta.innerHTML = `
          <div class="song-meta-content">
            <img src="${player.albumImage}" alt="${escapeHtml(player.songTitle || 'Song art')}" />
            <div>
              <strong>${escapeHtml(player.songTitle || player.sourceName)}</strong>
              <span>${escapeHtml(player.artist || 'Repo song')}</span>
            </div>
          </div>
        `;
      } else {
        songMeta.innerHTML = `
          <strong>${escapeHtml(player.songTitle || player.sourceName)}</strong>
          <span>${escapeHtml(player.artist || 'Repo song')}</span>
        `;
      }
    }

    nameInput.addEventListener('input', (event) => {
      player.name = event.target.value;
      saveRoster();
      renderSelectedPlayerOptions();
    });

    startInput.addEventListener('change', (event) => {
      updatePlayer(player.id, { startTime: event.target.value || '0:00' });
    });

    endInput.addEventListener('change', (event) => {
      updatePlayer(player.id, { endTime: event.target.value || '0:15' });
    });

    playBtn.addEventListener('click', () => playPlayer(player.id));
    stopBtn.addEventListener('click', stopPlayback);
    deleteBtn.addEventListener('click', () => deletePlayer(player.id));
    upBtn.addEventListener('click', () => movePlayer(player.id, -1));
    downBtn.addEventListener('click', () => movePlayer(player.id, 1));

    chooseFromLibraryBtn.addEventListener('click', () => {
      state.selectedPlayerId = player.id;
      renderSelectedPlayerOptions();
      renderLibraryResults();
      els.librarySearch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      els.librarySearch.focus();
    });

    if (index === 0) upBtn.disabled = true;
    if (index === state.roster.length - 1) downBtn.disabled = true;

    card.addEventListener('click', (event) => {
      if (event.target.closest('button, input, label')) return;
      state.selectedPlayerId = player.id;
      renderSelectedPlayerOptions();
      renderLibraryResults();
    });

    els.rosterList.appendChild(fragment);
  });
}

function render() {
  applyTopInfoVisibility();
  renderSelectedPlayerOptions();
  renderRoster();
  renderLibraryResults();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bindEvents() {
  els.stopBtn.addEventListener('click', stopPlayback);

  els.addPlayerBtn.addEventListener('click', () => {
    const player = createDefaultPlayer();
    state.roster.push(player);
    state.selectedPlayerId = player.id;
    saveRoster();
    render();
  });

  els.toggleSetupBtn.addEventListener('click', () => {
    state.topInfoHidden = !state.topInfoHidden;
    localStorage.setItem(STORAGE_KEYS.topInfoHidden, String(state.topInfoHidden));
    applyTopInfoVisibility();
  });

  els.selectedPlayer.addEventListener('change', (event) => {
    state.selectedPlayerId = event.target.value;
    renderLibraryResults();
  });

  els.librarySearch.addEventListener('input', renderLibraryResults);
}

async function init() {
  loadRoster();
  bindEvents();
  render();
  await loadRepoSongs();
}

init();
