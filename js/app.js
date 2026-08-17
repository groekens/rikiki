// ─── Screen routing ───────────────────────────────────────────────
const SCREENS = ['setup', 'game', 'scores', 'rules', 'compte'];
const SPLIT_MIN_WIDTH = 840;
let activeScreen = 'setup';

// Landscape tablet / desktop: game panel and scoreboard side by side.
function isSplitViewport() {
  return window.innerWidth >= SPLIT_MIN_WIDTH && window.innerWidth > window.innerHeight;
}

function splitApplies(id) {
  return isSplitViewport() && (id === 'game' || id === 'scores') && Game.hasActiveGame();
}

function showScreen(id) {
  if (!SCREENS.includes(id)) return;
  activeScreen = id;
  const split = splitApplies(id);
  document.body.classList.toggle('split', split);

  SCREENS.forEach(s => {
    const visible = split ? (s === 'game' || s === 'scores') : (s === id);
    document.getElementById('screen-' + s).classList.toggle('active', visible);
    const btn = document.getElementById('nav-' + s);
    if (btn) btn.classList.toggle('active', s === id);
  });

  // Render whatever is now on screen. renderFinished() never navigates,
  // so this cannot loop back into showScreen().
  if (split || id === 'game') renderGameScreen();
  if (split || id === 'scores') renderScores();
  if (id === 'setup') refreshResumeCard();
  if (id === 'compte') renderCompte();
}

// Re-evaluate the split layout when the iPad is rotated.
window.addEventListener('resize', () => {
  const shouldSplit = splitApplies(activeScreen);
  if (shouldSplit !== document.body.classList.contains('split')) showScreen(activeScreen);
});

// ─── Toast ────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
window.showToast = showToast;

// ─── Persistence ──────────────────────────────────────────────────
let cloudSyncTimer = null;

function persistLocal() {
  if (!Game.hasActiveGame()) return;
  Storage.saveGame(Game.serialize());
}

// Cloud writes are coarse on purpose: once per settled round, not per keystroke.
function syncCloud() {
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => {
    if (!window.saveGameState || !window.currentUser || !Game.hasActiveGame()) return;
    const sorted = Game.getSortedPlayers();
    window.saveGameState({
      gameId: Game.state.id,
      statut: Game.state.phase === 'finished' ? 'terminee' : 'en_cours',
      joueurs: sorted.map(p => p.name),
      scores: sorted.map(p => p.total),
      gagnant: sorted[0] ? sorted[0].name : '',
      manches: Game.state.totalRounds,
      mancheCourante: Game.completedRounds(),
      parametres: { ...Game.settings },
      etatJson: JSON.stringify(Game.serialize()),
    });
  }, 400);
}

Game.onChange = persistLocal;

// firebase.js calls this once the user is authenticated, so a game started
// before signing in still lands in the cloud.
window.syncCloudNow = syncCloud;

// ─── Resume banner ────────────────────────────────────────────────
let savedGameData = null;

function refreshResumeCard() {
  const card = document.getElementById('resume-card');
  if (!card) return;
  savedGameData = Storage.loadGame();

  const st = savedGameData && savedGameData.state;
  if (!st || !st.players || st.players.length < 2 || st.phase === 'setup') {
    card.style.display = 'none';
    return;
  }

  const finished = st.phase === 'finished';
  // The saved game may be the one already loaded in memory (user tapped Pause,
  // or navigated back here mid-game). Same card, different wording.
  const loaded = Game.hasActiveGame() && Game.state.id === st.id;
  const done = finished ? st.totalRounds : st.currentRound;

  let title, action;
  if (finished) { title = '🏆 Dernière partie'; action = 'Revoir les scores →'; }
  else if (loaded) { title = '▶ Partie en cours'; action = 'Revenir à la partie →'; }
  else { title = '⏸ Partie en pause'; action = 'Reprendre →'; }

  card.querySelector('h3').textContent = title;
  card.querySelector('.btn-primary').textContent = action;
  document.getElementById('resume-players').textContent = st.players.map(p => p.name).join(' · ');
  document.getElementById('resume-progress').textContent = finished
    ? `Terminée · ${st.totalRounds} manches`
    : `Manche ${Math.min(done + 1, st.totalRounds)} sur ${st.totalRounds}`;
  card.style.display = 'block';
}

function resumeSavedGame() {
  if (!savedGameData) { showToast('Aucune partie à reprendre'); return; }
  if (!Game.restore(savedGameData)) { showToast('Sauvegarde illisible'); return; }
  enableGameNav();
  renderSettings();
  showScreen(Game.state.phase === 'finished' ? 'scores' : 'game');
  showToast('Partie reprise ✓');
}

function discardSavedGame() {
  if (!confirm('Abandonner cette partie ? La sauvegarde sera supprimée.')) return;
  Storage.clearGame();
  savedGameData = null;
  refreshResumeCard();
  showToast('Sauvegarde supprimée');
}

function pauseGame() {
  persistLocal();
  syncCloud();
  showScreen('setup');
  showToast('Partie mise en pause ✓');
}

function enableGameNav() {
  document.getElementById('nav-game').disabled = false;
  document.getElementById('nav-scores').disabled = false;
  document.getElementById('btn-end-setup').style.display = 'block';
  document.getElementById('finished-area').style.display = 'none';
  document.getElementById('round-header-area').style.display = 'block';
}

// ─── Setup screen ─────────────────────────────────────────────────
let setupPlayers = [];

function renderSetup() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  setupPlayers.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';
    row.innerHTML = `
      <div class="avatar">${name[0].toUpperCase()}</div>
      <span style="flex:1;font-size:15px;">${name}</span>
      ${i === 0 ? '<span class="badge badge-purple">1er dealer</span>' : ''}
      <button class="btn-sm danger" onclick="removePlayer(${i})">✕</button>`;
    list.appendChild(row);
  });
  updateRoundPreview();
}

function updateRoundPreview() {
  const n = setupPlayers.length;
  const el = document.getElementById('round-preview');
  if (n < 2) { el.innerHTML = '<span style="color:var(--text3);font-size:13px;">Ajoutez au moins 2 joueurs</span>'; return; }
  const maxCards = Math.floor(52 / n);
  const total = maxCards * 2 - 1;
  el.innerHTML = `<p style="font-size:14px;color:var(--text2);">${n} joueurs · <strong>${total} manches</strong> · max ${maxCards} cartes par manche</p>`;
}

function addPlayer() {
  const inp = document.getElementById('player-input');
  const name = inp.value.trim();
  if (!name) return;
  if (setupPlayers.length >= 8) { showToast('Maximum 8 joueurs'); return; }
  if (setupPlayers.map(p => p.toLowerCase()).includes(name.toLowerCase())) { showToast('Nom déjà utilisé'); return; }
  setupPlayers.push(name);
  inp.value = '';
  inp.focus();
  renderSetup();
}

function removePlayer(idx) {
  setupPlayers.splice(idx, 1);
  renderSetup();
}

function startGame() {
  if (setupPlayers.length < 2) { showToast('Ajoutez au moins 2 joueurs'); return; }
  const saved = Storage.loadGame();
  const pending = saved && saved.state && saved.state.phase !== 'setup' && saved.state.phase !== 'finished';
  if (pending && !confirm('Une partie est en pause. Démarrer une nouvelle partie va la remplacer. Continuer ?')) return;

  Game.init([...setupPlayers]);
  enableGameNav();
  syncCloud();
  showScreen('game');
}

// ─── Game screen ──────────────────────────────────────────────────
function renderGameScreen() {
  if (!Game.hasActiveGame()) return;
  if (Game.state.phase === 'finished') { renderFinished(); return; }

  document.getElementById('finished-area').style.display = 'none';
  document.getElementById('round-header-area').style.display = 'block';

  const r = Game.currentRoundData();
  const ri = Game.state.currentRound;
  const total = Game.state.totalRounds;
  const players = Game.state.players;

  // Round header
  document.getElementById('round-title').textContent = `Manche ${ri + 1}`;
  document.getElementById('round-sub').textContent = `${r.cards} carte${r.cards > 1 ? 's' : ''}`;
  document.getElementById('round-badge').textContent = `${ri + 1} / ${total}`;

  // Show "start descending" button only if still ascending and not already triggered
  const btnDescend = document.getElementById('btn-descend');
  if (!Game.state.descending && !Game.isAtPeak() && r.cards > 1) {
    btnDescend.style.display = 'inline-flex';
  } else {
    btnDescend.style.display = 'none';
  }

  // Correcting an earlier round only makes sense once one is settled.
  const btnFix = document.getElementById('btn-fix-round');
  if (btnFix) btnFix.style.display = Game.completedRounds() > 0 ? 'block' : 'none';

  // Dealer / first player info
  document.getElementById('info-dealer').textContent = players[r.dealer].name;
  document.getElementById('info-first').textContent = players[r.firstPlayer].name;

  // Phase
  if (Game.state.phase === 'announce') {
    renderAnnouncePhase();
  } else {
    renderResultPhase();
  }
}

function confirmDescend() {
  const r = Game.currentRoundData();
  if (!confirm(`Commencer la descente maintenant ? La prochaine manche sera à ${r.cards - 1} carte${r.cards - 1 > 1 ? 's' : ''}, puis 1.`)) return;
  Game.triggerDescend();
  document.getElementById('btn-descend').style.display = 'none';
  document.getElementById('round-badge').textContent = `${Game.state.currentRound + 1} / ${Game.state.totalRounds}`;
  syncCloud();
  showToast('Descente amorcée, partie raccourcie ✓');
}

function backToAnnounce() {
  // Reset announcements for current round
  const r = Game.currentRoundData();
  r.announcements.forEach(a => { a.announced = null; });
  Game.state.phase = 'announce';
  persistLocal();
  renderAnnouncePhase();
  document.getElementById('phase-result').style.display = 'none';
  document.getElementById('phase-announce').style.display = 'block';
}

function renderAnnouncePhase() {
  document.getElementById('phase-announce').style.display = 'block';
  document.getElementById('phase-result').style.display = 'none';

  const r = Game.currentRoundData();
  const order = Game.getAnnounceOrder();
  const players = Game.state.players;
  const tbody = document.getElementById('announce-tbody');
  tbody.innerHTML = '';

  order.forEach((pi) => {
    const tr = document.createElement('tr');
    tr.dataset.playerIdx = pi;
    const prefill = r.announcements[pi].announced;
    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="avatar" style="width:28px;height:28px;font-size:11px;">${players[pi].name[0].toUpperCase()}</div>
          <span>${players[pi].name}</span>
        </div>
      </td>
      <td><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${r.cards}" id="ann-${pi}" placeholder="0" value="${prefill ?? ''}" oninput="checkAnnounceSum()"></td>`;
    tbody.appendChild(tr);
  });
  checkAnnounceSum();
}

function getAnnounceVal(pi) {
  const raw = document.getElementById('ann-' + pi)?.value.trim();
  return (raw === '' || raw === undefined) ? 0 : parseInt(raw);
}

function checkAnnounceSum() {
  const r = Game.currentRoundData();
  const order = Game.getAnnounceOrder();
  const vals = order.map(pi => {
    const raw = document.getElementById('ann-' + pi)?.value.trim();
    return (raw === '' || raw === undefined) ? 0 : parseInt(raw);
  });
  const sum = vals.reduce((s, v) => s + (isNaN(v) ? 0 : v), 0);
  const warn = document.getElementById('warn-announce');

  if (sum === r.cards) {
    warn.textContent = `⚠ Somme des annonces (${sum}) = nombre de plis (${r.cards}), interdit ! Modifiez au moins une annonce.`;
    warn.classList.add('visible');
  } else {
    warn.classList.remove('visible');
  }
}

function validateAnnouncements() {
  const r = Game.currentRoundData();
  const order = Game.getAnnounceOrder();
  const announced = new Array(Game.state.players.length).fill(0);
  let valid = true;
  order.forEach(pi => {
    const v = getAnnounceVal(pi);
    if (isNaN(v) || v < 0 || v > r.cards) { valid = false; return; }
    announced[pi] = v;
  });
  if (!valid) { showToast('Valeurs invalides'); return; }
  const sum = announced.reduce((s, v) => s + v, 0);
  if (sum === r.cards) { showToast('Somme interdite ! Modifiez une annonce'); return; }
  Game.setAnnouncements(announced);
  renderResultPhase();
}

function renderResultPhase() {
  document.getElementById('phase-announce').style.display = 'none';
  document.getElementById('phase-result').style.display = 'block';

  const r = Game.currentRoundData();
  const players = Game.state.players;
  const tbody = document.getElementById('result-tbody');
  tbody.innerHTML = '';

  players.forEach((p, pi) => {
    const ann = r.announcements[pi].announced;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="avatar" style="width:28px;height:28px;font-size:11px;">${p.name[0].toUpperCase()}</div>
          <span>${p.name}</span>
        </div>
      </td>
      <td><span class="badge badge-neutral">${ann}</span></td>
      <td><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${r.cards}" id="res-${pi}" placeholder="0" oninput="previewPoints(${pi})"></td>
      <td id="pts-preview-${pi}" style="font-size:13px;color:var(--text3);">—</td>`;
    tbody.appendChild(tr);
  });
}

function pointsFor(announced, got) {
  return announced === got
    ? Game.settings.pointsOnSuccess + got * Game.settings.pointsPerTrick
    : Game.settings.pointsOnFailure;
}

function pointsBadge(announced, got) {
  const pts = pointsFor(announced, got);
  const ok = announced === got;
  return `<span class="badge ${ok ? 'badge-green' : 'badge-red'}">${pts > 0 ? '+' : ''}${pts}</span>`;
}

function previewPoints(pi) {
  const r = Game.currentRoundData();
  const ann = r.announcements[pi].announced;
  const raw = document.getElementById('res-' + pi)?.value.trim();
  const v = (raw === '' || raw === undefined) ? 0 : parseInt(raw);
  const el = document.getElementById('pts-preview-' + pi);
  if (isNaN(v)) { el.innerHTML = '—'; return; }
  el.innerHTML = pointsBadge(ann, v);
}

function validateResults() {
  const r = Game.currentRoundData();
  const players = Game.state.players;
  const results = [];
  players.forEach((_, pi) => {
    const raw = document.getElementById('res-' + pi)?.value.trim();
    const v = (raw === '' || raw === undefined) ? 0 : parseInt(raw);
    if (isNaN(v) || v < 0 || v > r.cards) { results.push(null); return; }
    results.push(v);
  });
  if (results.includes(null)) { showToast('Valeurs invalides'); return; }
  const sum = results.reduce((s, v) => s + v, 0);
  if (sum !== r.cards) { showToast(`Total des plis = ${sum}, attendu ${r.cards}`); return; }

  Game.setResults(results);
  syncCloud();

  if (Game.state.phase === 'finished') {
    showScreen('scores');
    renderFinished();
  } else {
    showScreen('game');
    showToast(`Manche ${Game.state.currentRound} validée ✓`);
  }
}

function renderFinished() {
  document.getElementById('phase-announce').style.display = 'none';
  document.getElementById('phase-result').style.display = 'none';
  document.getElementById('round-header-area').style.display = 'none';
  const sorted = Game.getSortedPlayers();
  const winner = sorted[0];
  document.getElementById('finished-area').style.display = 'block';
  document.getElementById('winner-name').textContent = winner.name;
  document.getElementById('winner-pts').textContent = winner.total + ' pts';
}

function confirmEndGame() {
  if (!confirm('Terminer la partie ? La partie en cours sera supprimée.')) return;
  Storage.clearGame();
  resetGame();
}

function resetGame() {
  // Reset game state
  setupPlayers = [];
  Game.state = {
    id: null, players: [], rounds: [], currentRound: 0,
    phase: 'setup', totalRounds: 0, roundSequence: [],
    descending: false, peakReached: false,
  };
  // Reset UI
  document.getElementById('nav-game').disabled = true;
  document.getElementById('nav-scores').disabled = true;
  document.getElementById('btn-end-setup').style.display = 'none';
  // Reset game screen
  document.getElementById('finished-area').style.display = 'none';
  document.getElementById('round-header-area').style.display = 'block';
  document.getElementById('phase-announce').style.display = 'block';
  document.getElementById('phase-result').style.display = 'none';
  document.body.classList.remove('split');
  // Reset settings display
  renderSettings();
  renderSetup();
  showScreen('setup');
  showToast('Partie terminée');
}

// ─── Correcting a settled round ───────────────────────────────────
let editingRound = null;

function openRoundPicker() {
  const done = Game.completedRounds();
  if (done === 0) { showToast('Aucune manche terminée'); return; }
  const list = document.getElementById('picker-list');
  list.innerHTML = '';
  for (let m = 0; m < done; m++) {
    const pill = document.createElement('button');
    pill.className = 'seq-pill done pill-btn';
    pill.textContent = `M${m + 1} · ${Game.state.rounds[m].cards}c`;
    pill.onclick = () => { closeRoundPicker(); openEditRound(m); };
    list.appendChild(pill);
  }
  document.getElementById('picker-modal').style.display = 'flex';
}

function closeRoundPicker() {
  document.getElementById('picker-modal').style.display = 'none';
}

function onPickerBackdrop(e) {
  if (e.target.id === 'picker-modal') closeRoundPicker();
}

function openEditRound(idx) {
  if (!Game.isRoundEditable(idx)) { showToast('Cette manche n\'est pas encore terminée'); return; }
  editingRound = idx;
  const r = Game.state.rounds[idx];
  const players = Game.state.players;
  const order = players.map((_, i) => (r.firstPlayer + i) % players.length);

  document.getElementById('edit-title').textContent = `Corriger la manche ${idx + 1}`;
  document.getElementById('edit-sub').textContent =
    `${r.cards} carte${r.cards > 1 ? 's' : ''} · dealer ${players[r.dealer].name} · total des plis attendu : ${r.cards}`;

  const tbody = document.getElementById('edit-tbody');
  tbody.innerHTML = '';
  order.forEach(pi => {
    const a = r.announcements[pi];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="avatar" style="width:28px;height:28px;font-size:11px;">${players[pi].name[0].toUpperCase()}</div>
          <span>${players[pi].name}</span>
        </div>
      </td>
      <td><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${r.cards}" id="edit-ann-${pi}" value="${a.announced ?? 0}" oninput="refreshEditPreview()"></td>
      <td><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${r.cards}" id="edit-got-${pi}" value="${a.got ?? 0}" oninput="refreshEditPreview()"></td>
      <td id="edit-pts-${pi}" style="font-size:13px;color:var(--text3);">—</td>`;
    tbody.appendChild(tr);
  });

  refreshEditPreview();
  document.getElementById('edit-modal').style.display = 'flex';
}

function readEditInputs() {
  const n = Game.state.players.length;
  const announced = [];
  const got = [];
  for (let pi = 0; pi < n; pi++) {
    const a = parseInt(document.getElementById('edit-ann-' + pi).value);
    const g = parseInt(document.getElementById('edit-got-' + pi).value);
    announced.push(isNaN(a) ? 0 : a);
    got.push(isNaN(g) ? 0 : g);
  }
  return { announced, got };
}

function refreshEditPreview() {
  if (editingRound === null) return;
  const { announced, got } = readEditInputs();
  Game.state.players.forEach((_, pi) => {
    document.getElementById('edit-pts-' + pi).innerHTML = pointsBadge(announced[pi], got[pi]);
  });
  const warn = document.getElementById('edit-warn');
  const err = Game.checkRoundInput(editingRound, announced, got);
  if (err) {
    warn.textContent = '⚠ ' + err;
    warn.classList.add('visible');
  } else {
    warn.classList.remove('visible');
  }
}

function saveEditRound() {
  if (editingRound === null) return;
  const { announced, got } = readEditInputs();
  const err = Game.updateRound(editingRound, announced, got);
  if (err) { showToast(err); refreshEditPreview(); return; }
  const label = editingRound + 1;
  closeEditRound();
  syncCloud();
  renderScores();
  renderGameScreen();
  showToast(`Manche ${label} corrigée ✓`);
}

function closeEditRound() {
  editingRound = null;
  document.getElementById('edit-modal').style.display = 'none';
}

function onModalBackdrop(e) {
  if (e.target.id === 'edit-modal') closeEditRound();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeEditRound();
  closeRoundPicker();
});

// ─── Compte screen ────────────────────────────────────────────────
function renderCompte() {
  // Auth state is managed by firebase.js via onAuthStateChanged
  if (window.currentUser && window.loadHistorique) window.loadHistorique();
}

// Called by firebase.js when the user picks a game from the cloud history.
window.applyCloudGame = function (data) {
  if (!data || !data.etatJson) { showToast('Partie illisible'); return; }
  let parsed;
  try { parsed = JSON.parse(data.etatJson); } catch (e) { showToast('Partie illisible'); return; }
  if (!Game.restore(parsed)) { showToast('Partie illisible'); return; }
  persistLocal();
  enableGameNav();
  renderSettings();
  showScreen(Game.state.phase === 'finished' ? 'scores' : 'game');
  showToast('Partie chargée ✓');
};

// ─── Scores ───────────────────────────────────────────────────────
function renderScores() {
  const state = Game.state;
  if (!state.players.length) return;

  const completedRounds = Game.completedRounds();
  const thead = document.getElementById('score-thead');
  const tbody = document.getElementById('score-tbody');

  let headRow = '<th>Joueur</th>';
  for (let m = 0; m < completedRounds; m++) {
    headRow += `<th class="editable round-cell" onclick="openEditRound(${m})" title="Corriger la manche ${m + 1}">M${m + 1}</th>`;
  }
  headRow += '<th>Total</th>';
  thead.innerHTML = headRow;

  const sorted = Game.getSortedPlayers();
  tbody.innerHTML = '';
  sorted.forEach((p, rank) => {
    const tr = document.createElement('tr');
    if (rank === 0) tr.classList.add('leader');
    let row = `<td><div style="display:flex;align-items:center;gap:8px;">
      <div class="avatar" style="width:24px;height:24px;font-size:10px;">${p.name[0].toUpperCase()}</div>
      ${rank === 0 ? `<strong>${p.name}</strong>` : p.name}</div></td>`;
    for (let m = 0; m < completedRounds; m++) {
      const pts = p.scores[m];
      if (pts === undefined || pts === null) { row += '<td class="round-cell">—</td>'; continue; }
      const ann = state.rounds[m]?.announcements[p.idx];
      const ok = ann && ann.announced === ann.got;
      row += `<td class="editable round-cell" onclick="openEditRound(${m})" title="Corriger la manche ${m + 1}">
        <span class="badge ${ok ? 'badge-green' : 'badge-red'}" style="font-size:11px;">${pts > 0 ? '+' : ''}${pts}</span></td>`;
    }
    row += `<td style="font-family:'Kreon',serif;font-weight:700;font-size:16px;">${p.total}</td>`;
    tr.innerHTML = row;
    tbody.appendChild(tr);
  });

  const hint = document.getElementById('score-hint');
  if (hint) hint.style.display = completedRounds > 0 ? 'block' : 'none';

  // 25 to 51 rounds never fit: show the most recent ones, which are the ones
  // being played. Skipped while a correction modal is open so the user keeps
  // their place in the table.
  const wrap = document.querySelector('.score-wrap');
  if (wrap && editingRound === null) wrap.scrollLeft = wrap.scrollWidth;
}

// ─── Settings ─────────────────────────────────────────────────────
function renderSettings() {
  document.getElementById('set-success').value = Game.settings.pointsOnSuccess;
  document.getElementById('set-trick').value = Game.settings.pointsPerTrick;
  document.getElementById('set-failure').value = Game.settings.pointsOnFailure;
}

function saveSettings() {
  const s = parseInt(document.getElementById('set-success').value);
  const t = parseInt(document.getElementById('set-trick').value);
  const f = parseInt(document.getElementById('set-failure').value);
  if (isNaN(s) || isNaN(t) || isNaN(f)) { showToast('Valeurs invalides'); return; }
  Game.settings.pointsOnSuccess = s;
  Game.settings.pointsPerTrick = t;
  Game.settings.pointsOnFailure = f;
  Storage.saveSettings(Game.settings);
  persistLocal();
  showToast('Paramètres sauvegardés ✓');
}

// ─── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedSettings = Storage.loadSettings();
  if (savedSettings) Object.assign(Game.settings, savedSettings);

  document.getElementById('player-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPlayer();
  });
  renderSetup();
  renderSettings();
  refreshResumeCard();

  if (!Storage.available()) {
    showToast('Sauvegarde locale indisponible sur ce navigateur');
  }
});

// Last-chance save when the app is backgrounded or closed.
window.addEventListener('pagehide', persistLocal);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistLocal();
});
