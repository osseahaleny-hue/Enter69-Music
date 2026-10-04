// ENTER69 — Supabase + leitor + PIN
const { createClient } = supabase;
const cfg = window.ENTER69_SUPABASE || {};
const sb = createClient(cfg.url || '', cfg.anonKey || '');

let pendingSong = null;
let pendingDownload = null;
let activeAudio = null;
let activeSong = null;
let toastTimer = null;

const $ = id => document.getElementById(id);

function openModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).hidden = true;
  document.body.style.overflow = '';
}
function notify(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function configured() {
  return Boolean(
    cfg.url &&
    cfg.anonKey &&
    cfg.url.includes('.supabase.co') &&
    !cfg.anonKey.includes('SUA_')
  );
}
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}
function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2,'0')).join('');
}
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2,'0')).join('');
}

async function getSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw error;
  return data.session;
}
async function refreshAuth() {
  try {
    const session = await getSession();
    $('openAdd').textContent = session ? '＋ Adicionar música' : '🔐 Entrar como administrador';
    $('adminStatus').textContent = session ? 'Administrador ligado' : 'Modo público';
    $('logoutBtn').style.display = session ? 'inline-flex' : 'none';
  } catch {
    $('openAdd').textContent = '🔐 Entrar como administrador';
    $('adminStatus').textContent = 'Modo público';
    $('logoutBtn').style.display = 'none';
  }
}

document.querySelectorAll('[data-close]').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.close))
);
['addModal','unlockModal','downloadModal','loginModal'].forEach(id =>
  $(id).addEventListener('click', e => {
    if (e.target === $(id)) closeModal(id);
  })
);

$('openAdd').addEventListener('click', async () => {
  if (!configured()) {
    notify('O Supabase ainda não está configurado.');
    return;
  }
  const session = await getSession().catch(() => null);
  if (!session) {
    $('loginForm').reset();
    $('loginError').textContent = '';
    openModal('loginModal');
    return;
  }
  $('addForm').reset();
  $('addError').textContent = '';
  openModal('addModal');
});

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('loginError').textContent = '';
  const email = $('adminEmail').value.trim();
  const password = $('adminPassword').value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    $('loginError').textContent = 'Email ou palavra-passe incorretos.';
    return;
  }
  closeModal('loginModal');
  await refreshAuth();
  notify('Sessão de administrador iniciada.');
});

$('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  await refreshAuth();
  notify('Sessão terminada.');
});

$('addForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('addError').textContent = '';

  const session = await getSession().catch(() => null);
  if (!session) {
    $('addError').textContent = 'A sessão de administrador expirou.';
    return;
  }

  // Confirm that this authenticated Supabase user is in public.admin_users.
  const { data: isAdmin, error: adminCheckError } =
    await sb.rpc('is_enter69_admin');

  if (adminCheckError) {
    console.error('Admin check error:', adminCheckError);
    $('addError').textContent =
      `Não foi possível verificar o administrador: ${adminCheckError.message}`;
    return;
  }

  if (!isAdmin) {
    $('addError').textContent =
      'Esta conta do Supabase não está cadastrada em admin_users.';
    return;
  }

  const audio = $('audioFile').files[0];
  const cover = $('coverFile').files[0];
  const pin = $('songPin').value.trim();
  const name = $('songName').value.trim();
  const artist = $('artist').value.trim();
  const category = $('category').value.trim();

  if (!name || !artist || !category) {
    $('addError').textContent = 'Preencha nome, artista e categoria.';
    return;
  }
  if (!audio || !audio.name.toLowerCase().endsWith('.mp3')) {
    $('addError').textContent = 'Escolha um ficheiro MP3 válido.';
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    $('addError').textContent = 'O PIN deve ter exatamente 4 dígitos.';
    return;
  }
  if (audio.size > 100 * 1024 * 1024) {
    $('addError').textContent = 'O MP3 não pode ultrapassar 100 MB.';
    return;
  }

  let audioPath = null;
  let coverPath = null;

  try {
    const id = crypto.randomUUID();
    audioPath = `${id}.mp3`;
    coverPath = cover
      ? `${id}-${cover.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      : null;

    const salt = randomSalt();
    const pinHash = await hashPin(pin, salt);

    let result = await sb.storage.from('music').upload(
      audioPath,
      audio,
      { contentType: 'audio/mpeg', upsert: false }
    );
    if (result.error) throw result.error;

    if (cover) {
      result = await sb.storage.from('covers').upload(
        coverPath,
        cover,
        { contentType: cover.type || 'image/jpeg', upsert: false }
      );
      if (result.error) throw result.error;
    }

    const { error } = await sb.from('songs').insert({
      id,
      name,
      artist,
      category,
      file_path: audioPath,
      cover_path: coverPath,
      file_name: audio.name,
      pin_salt: salt,
      pin_hash: pinHash
    });

    if (error) throw error;

    closeModal('addModal');
    await render();
    notify('Música publicada para todos.');
  } catch (err) {
    console.error('ENTER69 publish error:', err);
    if (audioPath) await sb.storage.from('music').remove([audioPath]).catch(() => {});
    if (coverPath) await sb.storage.from('covers').remove([coverPath]).catch(() => {});
    const message = err?.message || err?.error_description || String(err);
    $('addError').textContent = `Não foi possível publicar: ${message}`;
  }
});

async function getSongs() {
  const { data, error } = await sb
    .from('public_songs')
    .select('id,name,artist,category,file_path,cover_path,file_name,created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Capas são solicitadas através da Edge Function sem revelar o PIN.
async function coverUrl(song) {
  if (!song?.cover_path) return '';
  try {
    const url = await invokeAuthorize(song.id, '', 'cover');
    return url;
  } catch {
    return '';
  }
}

async function invokeAuthorize(songId, pin, purpose) {
  const session = await getSession().catch(() => null);
  const headers = {
    'Content-Type': 'application/json',
    'apikey': cfg.anonKey
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(
    `${cfg.url}/functions/v1/authorize-song`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ songId, pin, purpose })
    }
  );

  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    throw new Error(body.error || 'Autorização recusada.');
  }
  return body.url;
}

async function render() {
  const library = $('library');

  if (!configured()) {
    library.innerHTML =
      '<div class="empty"><div class="empty-icon">☁</div>' +
      '<h2>Supabase ainda não configurado</h2>' +
      '<p>Configure o projeto antes de publicar o site.</p></div>';
    return;
  }

  try {
    const songs = await getSongs();
    const term = $('search').value.toLowerCase();
    const selected = $('categoryFilter').value;

    const categories = [...new Set(
      songs.map(s => s.category).filter(Boolean)
    )].sort();

    const filter = $('categoryFilter');
    const old = filter.value;
    filter.innerHTML =
      '<option value="">Todas as categorias</option>' +
      categories.map(c =>
        `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`
      ).join('');
    filter.value = categories.includes(old) ? old : '';

    const shown = songs.filter(s =>
      (!selected || s.category === selected) &&
      `${s.name} ${s.artist} ${s.category}`.toLowerCase().includes(term)
    );

    if (!shown.length) {
      library.innerHTML =
        `<div class="empty"><div class="empty-icon">♫</div>` +
        `<h2>${songs.length ? 'Nenhuma música encontrada' : 'A tua biblioteca está à espera'}</h2>` +
        `<p>${songs.length ? 'Tenta outra pesquisa ou categoria.' : 'Adiciona a primeira música para começar.'}</p></div>`;
      return;
    }

    const cards = await Promise.all(shown.map(async song => {
      const cover = await coverUrl(song);
      return `
        <article class="song-card">
          <div class="cover" ${cover ? `style="background-image:url('${cover}')"` : ''}>
            ${cover ? '' : '♫'}
          </div>
          <div class="song-info">
            <h3>${escapeHTML(song.name)}</h3>
            <p class="artist">${escapeHTML(song.artist)}</p>
            <span class="tag">${escapeHTML(song.category)}</span>
            <div class="actions">
              <button class="listen" data-play="${song.id}">▶ Ouvir</button>
              <button class="download" type="button" data-download="${song.id}">↓ Baixar</button>
            </div>
          </div>
        </article>`;
    }));

    library.innerHTML = cards.join('');

    library.querySelectorAll('[data-play]').forEach(btn =>
      btn.addEventListener('click', () => requestListen(btn.dataset.play))
    );
    library.querySelectorAll('[data-download]').forEach(btn =>
      btn.addEventListener('click', () => requestDownload(btn.dataset.download))
    );
  } catch (error) {
    console.error(error);
    library.innerHTML =
      '<div class="empty"><h2>Não foi possível carregar as músicas</h2>' +
      '<p>Verifique as políticas e a configuração do Supabase.</p></div>';
  }
}

async function getPublicSong(id) {
  const { data, error } = await sb
    .from('public_songs')
    .select('id,name,artist,category,file_path,cover_path,file_name,created_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function requestListen(id) {
  try {
    const song = await getPublicSong(id);
    pendingSong = song;
    $('unlockDescription').textContent =
      `Introduza o PIN de 4 dígitos de “${song.name}” para autorizar a reprodução.`;
    $('unlockPin').value = '';
    $('unlockError').textContent = '';
    openModal('unlockModal');
  } catch {
    notify('Não foi possível encontrar a música.');
  }
}

async function requestDownload(id) {
  try {
    const song = await getPublicSong(id);
    pendingDownload = song;
    $('downloadPin').value = '';
    $('downloadError').textContent = '';
    $('downloadDescription').textContent =
      `Introduza o PIN da música “${song.name}” para autorizar o download.`;
    openModal('downloadModal');
  } catch {
    notify('Não foi possível encontrar a música.');
  }
}

function updatePlayer() {
  if (!activeAudio || !activeSong) return;
  $('playerCurrent').textContent = formatTime(activeAudio.currentTime);
  $('playerDuration').textContent = formatTime(activeAudio.duration);
  $('playerProgress').value =
    activeAudio.duration
      ? (activeAudio.currentTime / activeAudio.duration) * 100
      : 0;
  $('playerPlay').textContent = activeAudio.paused ? '▶' : 'Ⅱ';
  $('playerPlay').setAttribute(
    'aria-label',
    activeAudio.paused ? 'Continuar' : 'Pausar'
  );
}

async function showPlayer(song) {
  $('player').hidden = false;
  $('playerTitle').textContent = song.name;
  $('playerArtist').textContent = song.artist;
  $('playerCover').textContent = '♫';
  $('playerCover').style.backgroundImage = '';

  const cover = await coverUrl(song);
  if (cover) {
    $('playerCover').style.backgroundImage = `url("${cover}")`;
    $('playerCover').textContent = '';
  }
}

async function playAudio(song, url) {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
  }

  activeSong = song;
  activeAudio = new Audio(url);
  const audio = activeAudio;

  await showPlayer(song);

  audio.addEventListener('loadedmetadata', updatePlayer);
  audio.addEventListener('timeupdate', updatePlayer);
  audio.addEventListener('play', updatePlayer);
  audio.addEventListener('pause', updatePlayer);

  audio.addEventListener('ended', () => {
    if (activeAudio === audio) {
      activeAudio = null;
      activeSong = null;
      $('player').hidden = true;
      notify('Música terminada.');
    }
  });

  try {
    await audio.play();
  } catch {
    notify('Não foi possível reproduzir o áudio neste navegador.');
  }
}

$('unlockForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('unlockError').textContent = '';

  if (!pendingSong) return;

  try {
    const url = await invokeAuthorize(
      pendingSong.id,
      $('unlockPin').value,
      'listen'
    );
    const song = pendingSong;
    pendingSong = null;
    closeModal('unlockModal');
    $('unlockForm').reset();
    await playAudio(song, url);
    notify('Música desbloqueada e a tocar.');
  } catch {
    $('unlockError').textContent =
      'PIN incorreto ou autorização recusada.';
  }
});

$('downloadForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('downloadError').textContent = '';

  if (!pendingDownload) return;

  try {
    const url = await invokeAuthorize(
      pendingDownload.id,
      $('downloadPin').value,
      'download'
    );

    const a = document.createElement('a');
    a.href = url;
    a.download = pendingDownload.file_name || `${pendingDownload.name}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    closeModal('downloadModal');
    $('downloadForm').reset();
    pendingDownload = null;
    notify('Download autorizado.');
  } catch {
    $('downloadError').textContent =
      'PIN incorreto ou download não autorizado.';
  }
});

$('playerPlay').addEventListener('click', () => {
  if (!activeAudio) return;
  if (activeAudio.paused) {
    activeAudio.play().catch(() => notify('Não foi possível continuar.'));
  } else {
    activeAudio.pause();
  }
});

$('playerStop').addEventListener('click', () => {
  if (!activeAudio) return;
  activeAudio.pause();
  activeAudio.src = '';
  activeAudio = null;
  activeSong = null;
  $('player').hidden = true;
  notify('Reprodução parada.');
});

$('playerProgress').addEventListener('input', e => {
  if (activeAudio && Number.isFinite(activeAudio.duration)) {
    activeAudio.currentTime =
      (Number(e.target.value) / 100) * activeAudio.duration;
  }
  updatePlayer();
});

$('search').addEventListener('input', render);
$('categoryFilter').addEventListener('change', render);

(async () => {
  if (!configured()) {
    await refreshAuth();
    await render();
    return;
  }

  sb.auth.onAuthStateChange(() => refreshAuth());
  await refreshAuth();
  await render();
})();
