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
  if (id !== activeScreen) window.scrollTo(0, 0);
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
  updateWakeLock();
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

// ─── Animations ───────────────────────────────────────────────────
// Relance une animation CSS sur un élément déjà affiché : retirer la classe,
// forcer un reflow, la remettre.
function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function shake(el) { replay(el, 'shake'); }

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Pluie de couleurs de cartes sur l'écran du vainqueur.
function suitBurst() {
  if (reducedMotion()) return;
  const host = document.getElementById('finished-area');
  const suits = ['♠', '♥', '♣', '♦'];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('span');
    const suit = suits[i % 4];
    s.className = 'confetti' + (suit === '♥' || suit === '♦' ? ' r' : '');
    s.textContent = suit;
    s.style.left = (Math.random() * 100) + '%';
    s.style.animationDelay = (Math.random() * 0.6) + 's';
    s.style.animationDuration = (1.6 + Math.random() * 1.2) + 's';
    s.style.setProperty('--drift', ((Math.random() - 0.5) * 80) + 'px');
    s.style.setProperty('--spin', ((Math.random() - 0.5) * 540) + 'deg');
    s.style.fontSize = (14 + Math.random() * 14) + 'px';
    host.appendChild(s);
    setTimeout(() => s.remove(), 3200);
  }
}

// ─── Player identity ──────────────────────────────────────────────
// Une couleur par siège, la même partout (setup, manche, scores) : on repère
// un joueur d'un coup d'oeil au lieu de relire les noms à chaque manche.
const PLAYER_COLORS = 8;

function avatar(name, idx, size) {
  const cls = size === 'sm' ? 'avatar avatar-sm' : 'avatar';
  return `<div class="${cls} p${idx % PLAYER_COLORS}">${escapeHtml(name[0].toUpperCase())}</div>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Setup screen ─────────────────────────────────────────────────
let setupPlayers = [];
let justAdded = -1;

function renderSetup() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  setupPlayers.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'player-row' + (i === justAdded ? ' enter' : '');
    row.innerHTML = `
      ${avatar(name, i)}
      <span class="player-name">${escapeHtml(name)}</span>
      ${i === 0 ? '<span class="badge badge-accent">1er donneur</span>' : ''}
      <button class="icon-btn" onclick="removePlayer(${i})" aria-label="Retirer ${escapeHtml(name)}">✕</button>`;
    list.appendChild(row);
  });
  justAdded = -1;
  renderRecentPlayers();
  updateRoundPreview();
}

function updateRoundPreview() {
  const n = setupPlayers.length;
  const el = document.getElementById('round-preview');
  if (n < 2) { el.innerHTML = '<p class="muted">Ajoutez au moins 2 joueurs</p>'; return; }
  const maxCards = Math.floor(52 / n);
  const total = maxCards * 2 - 1;
  el.innerHTML = `
    <div class="stat-row">
      <div class="stat"><span class="stat-value">${n}</span><span class="stat-label">joueurs</span></div>
      <div class="stat"><span class="stat-value">${total}</span><span class="stat-label">manches</span></div>
      <div class="stat"><span class="stat-value">${maxCards}</span><span class="stat-label">cartes max</span></div>
    </div>`;
}

function addPlayer() {
  const inp = document.getElementById('player-input');
  const name = inp.value.trim();
  if (!name) return;
  if (setupPlayers.length >= 8) { showToast('Maximum 8 joueurs'); return; }
  if (setupPlayers.map(p => p.toLowerCase()).includes(name.toLowerCase())) { showToast('Nom déjà utilisé'); shake(inp); return; }
  setupPlayers.push(name);
  justAdded = setupPlayers.length - 1;
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

  rememberPlayers(setupPlayers);
  Game.init([...setupPlayers]);
  enableGameNav();
  syncCloud();
  showScreen('game');
}

// ─── Game screen ──────────────────────────────────────────────────
let lastDealtRound = null;

function renderGameScreen() {
  if (!Game.hasActiveGame()) return;
  if (Game.state.phase === 'finished') { renderFinished(); return; }

  document.getElementById('finished-area').style.display = 'none';
  document.getElementById('round-header-area').style.display = 'block';

  const r = Game.currentRoundData();
  const ri = Game.state.currentRound;
  const total = Game.state.totalRounds;
  const players = Game.state.players;

  // Round header. La nouvelle manche "se distribue" : seulement quand elle
  // change, pas à chaque retour sur l'écran.
  if (lastDealtRound !== `${Game.state.id}:${ri}`) {
    lastDealtRound = `${Game.state.id}:${ri}`;
    replay(document.querySelector('.round-header'), 'deal');
  }
  document.getElementById('round-title').textContent = `Manche ${ri + 1}`;
  document.getElementById('round-sub').textContent = `${r.cards} carte${r.cards > 1 ? 's' : ''}`;
  document.getElementById('round-badge').textContent = `${ri + 1} / ${total}`;
  document.getElementById('round-progress').style.width = `${(ri / total) * 100}%`;

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
  document.getElementById('info-dealer').innerHTML =
    `${avatar(players[r.dealer].name, r.dealer, 'sm')}<span>${escapeHtml(players[r.dealer].name)}</span>`;
  document.getElementById('info-first').innerHTML =
    `${avatar(players[r.firstPlayer].name, r.firstPlayer, 'sm')}<span>${escapeHtml(players[r.firstPlayer].name)}</span>`;

  renderStandingsStrip();

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
  document.getElementById('round-progress').style.width = `${(Game.state.currentRound / Game.state.totalRounds) * 100}%`;
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
  const list = document.getElementById('announce-tbody');
  list.innerHTML = '';

  order.forEach((pi, pos) => {
    const prefill = r.announcements[pi].announced;
    const row = document.createElement('div');
    row.className = 'pick-row';
    row.id = 'row-ann-' + pi;
    row.innerHTML = `
      <div class="pick-head">
        ${playerCell(players[pi].name, pi)}
        <span class="pick-meta">${pos === 0 ? 'parle en premier' : pos === order.length - 1 ? 'parle en dernier' : ''}</span>
      </div>
      ${chipsHtml('ann', pi, r.cards)}
      <input type="hidden" id="ann-${pi}" value="${prefill ?? ''}">`;
    list.appendChild(row);
    syncChips('ann', pi);
  });
  // Toucher la rangée du dernier suffit à faire apparaître l'indice.
  const lastRow = document.getElementById('row-ann-' + order[order.length - 1]);
  lastRow.addEventListener('pointerdown', () => { if (!lastInputFocused) { lastInputFocused = true; checkAnnounceSum(); } });
  lastInputFocused = false;
  checkAnnounceSum();
}

// ─── Pastilles de saisie ──────────────────────────────────────────
// Un tap par joueur au lieu du clavier numérique, qui masquait la moitié
// de l'écran. La valeur vit dans un input caché : la validation n'a pas
// eu à changer.
function chipsHtml(prefix, pi, cards) {
  // La pastille choisie prend la couleur du joueur.
  let h = `<div class="chips p${pi % PLAYER_COLORS}" role="radiogroup">`;
  for (let v = 0; v <= cards; v++) {
    h += `<button type="button" class="chip" role="radio" data-v="${v}" onclick="pickChip('${prefix}', ${pi}, ${v})">${v}</button>`;
  }
  return h + '</div>';
}

function syncChips(prefix, pi) {
  const input = document.getElementById(prefix + '-' + pi);
  const row = document.getElementById('row-' + prefix + '-' + pi);
  if (!input || !row) return;
  row.querySelectorAll('.chip').forEach(c => {
    const on = c.dataset.v === input.value;
    c.classList.toggle('selected', on);
    c.setAttribute('aria-checked', on ? 'true' : 'false');
    if (on) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

function pickChip(prefix, pi, v) {
  const input = document.getElementById(prefix + '-' + pi);
  const chip = document.querySelector(`#row-${prefix}-${pi} .chip[data-v="${v}"]`);
  if (chip && chip.classList.contains('forbidden')) {
    shake(chip);
    showToast(`${Game.state.players[pi].name} ne peut pas annoncer ${v}`);
    return;
  }
  input.value = String(v);
  syncChips(prefix, pi);
  replay(chip, 'pop');
  if (prefix === 'ann') checkAnnounceSum();
  else onResultPicked(pi);
}

function playerCell(name, idx) {
  return `<div class="player-cell">${avatar(name, idx, 'sm')}<span>${escapeHtml(name)}</span></div>`;
}

function getAnnounceVal(pi) {
  const raw = document.getElementById('ann-' + pi)?.value.trim();
  return (raw === '' || raw === undefined) ? 0 : parseInt(raw);
}

// La règle "la somme ne peut pas égaler le nombre de plis" ne contraint que
// le dernier à parler. Plutôt que d'expliquer la règle, on lui donne
// directement le nombre qu'il n'a pas le droit de dire.
let lastInputFocused = false;

function forbiddenForLast() {
  const r = Game.currentRoundData();
  const order = Game.getAnnounceOrder();
  const others = order.slice(0, -1).reduce((s, pi) => s + (getAnnounceVal(pi) || 0), 0);
  return r.cards - others;
}

function checkAnnounceSum() {
  const order = Game.getAnnounceOrder();
  const lastPi = order[order.length - 1];
  const lastName = Game.state.players[lastPi].name;
  const othersFilled = order.slice(0, -1).every(pi => document.getElementById('ann-' + pi)?.value.trim() !== '');
  const hint = document.getElementById('last-hint');
  const lastInput = document.getElementById('ann-' + lastPi);

  const lastChips = document.querySelectorAll(`#row-ann-${lastPi} .chip`);
  lastChips.forEach(c => c.classList.remove('forbidden'));

  if (!othersFilled && !lastInputFocused) {
    hint.classList.remove('visible', 'blocked');
    lastInput.classList.remove('is-forbidden');
    return;
  }

  const forbidden = forbiddenForLast();
  lastChips.forEach(c => c.classList.toggle('forbidden', parseInt(c.dataset.v) === forbidden));
  const lastRaw = lastInput.value.trim();
  const blocked = forbidden >= 0 && lastRaw !== '' && parseInt(lastRaw) === forbidden;
  const text = forbidden < 0
    ? `<strong>${escapeHtml(lastName)}</strong> peut annoncer n'importe quel nombre`
    : `<strong>${escapeHtml(lastName)}</strong> ne peut pas annoncer <span class="hint-num">${forbidden}</span>`;

  // Ne réécrire que si le contenu change : sinon l'animation du chiffre
  // repartirait à chaque frappe.
  if (hint.dataset.text !== text) {
    hint.innerHTML = `${avatar(lastName, lastPi, 'sm')}<span>${text}</span>`;
    hint.dataset.text = text;
  }
  hint.classList.add('visible');
  hint.classList.toggle('blocked', blocked);
  lastInput.classList.toggle('is-forbidden', blocked);
  document.getElementById('row-ann-' + lastPi).classList.toggle('is-forbidden', blocked);
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
  if (sum === r.cards) {
    const order2 = Game.getAnnounceOrder();
    const lastPi = order2[order2.length - 1];
    showToast(`${Game.state.players[lastPi].name} ne peut pas annoncer ${forbiddenForLast()}`);
    shake(document.getElementById('row-ann-' + lastPi));
    return;
  }
  Game.setAnnouncements(announced);
  renderResultPhase();
}

let manualResults = new Set();

function renderResultPhase() {
  document.getElementById('phase-announce').style.display = 'none';
  document.getElementById('phase-result').style.display = 'block';

  const r = Game.currentRoundData();
  const players = Game.state.players;
  const list = document.getElementById('result-tbody');
  list.innerHTML = '';
  manualResults = new Set();

  Game.getAnnounceOrder().forEach(pi => {
    const ann = r.announcements[pi].announced;
    const row = document.createElement('div');
    row.className = 'pick-row';
    row.id = 'row-res-' + pi;
    row.innerHTML = `
      <div class="pick-head">
        ${playerCell(players[pi].name, pi)}
        <span class="pick-meta">annonce <strong>${ann}</strong></span>
        <span class="auto-tag">auto</span>
        <span class="pts-cell" id="pts-preview-${pi}">·</span>
      </div>
      ${chipsHtml('res', pi, r.cards)}
      <input type="hidden" id="res-${pi}" value="">`;
    list.appendChild(row);
  });
  refreshResults();
}

// Quand tous les joueurs sauf un ont saisi leurs plis, le dernier se déduit
// du total. Il reste modifiable : le toucher le fait passer en manuel.
function onResultPicked(pi) {
  manualResults.add(pi);
  refreshResults();
}

function refreshResults() {
  const r = Game.currentRoundData();
  const n = Game.state.players.length;
  const all = Game.state.players.map((_, i) => i);

  all.forEach(pi => {
    if (!manualResults.has(pi)) document.getElementById('res-' + pi).value = '';
    document.getElementById('row-res-' + pi).classList.remove('auto');
  });

  if (manualResults.size === n - 1) {
    const missing = all.find(pi => !manualResults.has(pi));
    const sum = [...manualResults].reduce((s, pi) => s + parseInt(document.getElementById('res-' + pi).value), 0);
    const rest = r.cards - sum;
    if (rest >= 0) {
      document.getElementById('res-' + missing).value = String(rest);
      replay(document.getElementById('row-res-' + missing), 'auto');
    }
  }

  all.forEach(pi => { syncChips('res', pi); previewPoints(pi); });

  const filled = all.filter(pi => document.getElementById('res-' + pi).value !== '');
  const total = filled.reduce((s, pi) => s + parseInt(document.getElementById('res-' + pi).value), 0);
  const el = document.getElementById('results-total');
  const ok = filled.length === n && total === r.cards;
  el.className = 'results-total' + (filled.length === n ? (ok ? ' ok' : ' ko') : '');
  el.textContent = filled.length === n && !ok
    ? `Total : ${total} plis sur ${r.cards}, il y a une erreur`
    : `Total : ${total} / ${r.cards} plis`;
}

function formatPts(pts) {
  // Vrai signe moins : le trait d'union paraît chétif à côté du +.
  return pts > 0 ? `+${pts}` : pts < 0 ? `\u2212${-pts}` : '0';
}

function pointsBadge(announced, got) {
  const pts = Game.pointsFor(announced, got);
  const ok = announced === got;
  return `<span class="badge ${ok ? 'badge-green' : 'badge-red'}">${formatPts(pts)}</span>`;
}

function previewPoints(pi) {
  const r = Game.currentRoundData();
  const ann = r.announcements[pi].announced;
  const raw = document.getElementById('res-' + pi)?.value.trim();
  const el = document.getElementById('pts-preview-' + pi);
  if (el.dataset.v === raw) return;
  el.dataset.v = raw;
  if (raw === '' || raw === undefined) { el.innerHTML = '·'; return; }
  el.innerHTML = pointsBadge(ann, parseInt(raw));
  replay(el.firstElementChild, 'pop');
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
  const missing = players.findIndex((_, pi) => document.getElementById('res-' + pi).value === '');
  if (missing !== -1) {
    showToast(`Plis de ${players[missing].name} à saisir`);
    shake(document.getElementById('row-res-' + missing));
    return;
  }
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

let celebratedGame = null;

function renderFinished() {
  document.getElementById('phase-announce').style.display = 'none';
  document.getElementById('phase-result').style.display = 'none';
  document.getElementById('round-header-area').style.display = 'none';
  const sorted = Game.getSortedPlayers();
  const winner = sorted[0];
  document.getElementById('finished-area').style.display = 'block';
  document.getElementById('winner-name').textContent = winner.name;
  document.getElementById('winner-pts').textContent = winner.total + ' pts';
  if (celebratedGame !== Game.state.id) {
    celebratedGame = Game.state.id;
    suitBurst();
  }
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
      <td>${playerCell(players[pi].name, pi)}</td>
      <td><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${r.cards}" id="edit-ann-${pi}" value="${a.announced ?? 0}" oninput="refreshEditPreview()"></td>
      <td><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${r.cards}" id="edit-got-${pi}" value="${a.got ?? 0}" oninput="refreshEditPreview()"></td>
      <td id="edit-pts-${pi}" class="pts-cell">·</td>`;
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
    warn.textContent = err;
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
  renderThemePicker();
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
let lastScoredRounds = null;

// ─── Classement ───────────────────────────────────────────────────
// Le tableau répond à "combien X a marqué à la manche 5", le classement à
// "qui gagne". Le tableau garde l'ordre de la table (on y corrige les
// manches), le classement se réordonne à chaque manche.
let lastStandingsAnim = null;

// Mouvement depuis la manche précédente, en places gagnées (positif) ou perdues.
function standingsMoves(done) {
  if (done < 2) return {};
  const before = {};
  Game.getStandings(done - 1).forEach(r => { before[r.idx] = r.rank; });
  const moves = {};
  Game.getStandings(done).forEach(r => { moves[r.idx] = before[r.idx] - r.rank; });
  return moves;
}

function renderStandings() {
  const card = document.getElementById('standings-card');
  const done = Game.completedRounds();
  if (done === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  const rows = Game.getStandings(done);
  const moves = standingsMoves(done);
  const leader = rows[0].total;
  // Les flèches ne s'animent qu'une fois, quand une nouvelle manche arrive.
  const animate = lastStandingsAnim !== null && lastStandingsAnim.id === Game.state.id && done > lastStandingsAnim.done;
  lastStandingsAnim = { id: Game.state.id, done };

  document.getElementById('standings').innerHTML = rows.map(r => {
    const mv = moves[r.idx] || 0;
    const move = mv > 0 ? `<span class="st-move up">▲${mv}</span>`
      : mv < 0 ? `<span class="st-move down">▼${-mv}</span>`
      : '<span class="st-move"></span>';
    const gap = r.total < leader ? `<span class="st-gap">à ${leader - r.total}</span>` : '<span class="st-gap"></span>';
    const cls = ['st-row', r.rank === 1 ? 'first' : '', animate && mv > 0 ? 'climb' : ''].join(' ');
    return `<li class="${cls}">
      <span class="st-rank">${r.rank}</span>
      ${avatar(r.name, r.idx, 'sm')}
      <span class="st-name">${escapeHtml(r.name)}</span>
      ${move}
      ${gap}
      <span class="st-pts">${r.total}<small> pts</small></span>
    </li>`;
  }).join('');
}

// Bandeau de l'écran de jeu : le podium d'un coup d'oeil, sans changer d'écran.
function renderStandingsStrip() {
  const strip = document.getElementById('standings-strip');
  const done = Game.completedRounds();
  if (done === 0) { strip.style.display = 'none'; return; }
  const rows = Game.getStandings(done);
  const top = rows.slice(0, 3);
  const rest = rows.length - top.length;
  strip.innerHTML = `
    <span class="ss-trophy">🏆</span>
    ${top.map(r => `<span class="ss-item p${r.idx % PLAYER_COLORS}">
      <span class="ss-rank">${r.rank}</span>
      <span class="ss-name">${escapeHtml(r.name)}</span>
      <span class="ss-pts">${r.total}</span>
    </span>`).join('')}
    ${rest > 0 ? `<span class="ss-more">+${rest}</span>` : ''}
    <span class="ss-chev">›</span>`;
  // Chaque nom prend sa largeur naturelle tant que ça tient ; sinon la place
  // est partagée à parts égales, au lieu d'écraser le nom le plus court.
  strip.style.gridTemplateColumns =
    `auto repeat(${top.length}, minmax(0, max-content))${rest > 0 ? ' auto' : ''} 1fr`;
  strip.style.display = 'grid';
}

function renderScores() {
  const state = Game.state;
  if (!state.players.length) return;

  renderStandings();

  const done = Game.completedRounds();
  const players = state.players;
  const totals = players.map((_, i) => Game.getTotal(i));
  const best = totals.length ? Math.max.apply(null, totals) : 0;

  const thead = document.getElementById('score-thead');
  const tbody = document.getElementById('score-tbody');
  // Au-dela de 4 joueurs, 7 colonnes ne tiennent plus sur un telephone:
  // on resserre plutot que d'imposer un defilement lateral.
  const table = thead.closest('table');
  if (table) table.classList.toggle('dense', players.length >= 5);

  // Colonnes = joueurs (2 a 8, borne), lignes = manches (jusqu'a 51). Le total
  // vit dans l'en-tete, qui reste colle en haut pendant le defilement.
  let head = '<th class="col-round">Manche</th>';
  players.forEach((p, i) => {
    const leads = done > 0 && totals[i] === best;
    head += `<th class="col-player p${i % PLAYER_COLORS}${leads ? ' leads' : ''}">
      <span class="ph-name">${escapeHtml(p.name)}</span>
      <span class="ph-total">${formatPts(totals[i]).replace('+', '')}</span>
    </th>`;
  });
  thead.innerHTML = head;

  tbody.innerHTML = '';
  const hint = document.getElementById('score-hint');

  if (done === 0) {
    tbody.innerHTML = `<tr><td class="score-empty" colspan="${players.length + 1}">Aucune manche terminée pour l'instant</td></tr>`;
    if (hint) hint.style.display = 'none';
    return;
  }

  // La manche qui vient d'être validée s'illumine une fois.
  const fresh = lastScoredRounds !== null && lastScoredRounds.id === state.id && done > lastScoredRounds.done ? done - 1 : -1;
  lastScoredRounds = { id: state.id, done };

  for (let m = 0; m < done; m++) {
    const r = state.rounds[m];
    const tr = document.createElement('tr');
    tr.className = 'round-row' + (m === fresh ? ' fresh' : '');
    tr.title = `Corriger la manche ${m + 1}`;
    tr.setAttribute('onclick', `openEditRound(${m})`);

    let row = `<td class="col-round"><span class="rn">M${m + 1}</span><span class="rc">${r.cards}c</span></td>`;
    players.forEach((p, i) => {
      const pts = p.scores[m];
      if (pts === undefined || pts === null) { row += '<td class="pts-cell">·</td>'; return; }
      const a = r.announcements[i];
      const ok = a && a.announced === a.got;
      row += `<td><span class="badge ${ok ? 'badge-green' : 'badge-red'}">${formatPts(pts)}</span></td>`;
    });
    tr.innerHTML = row;
    tbody.appendChild(tr);
  }

  if (hint) hint.style.display = 'block';
}

// ─── Settings ─────────────────────────────────────────────────────
function renderSettings() {
  document.getElementById('set-success').value = Game.settings.pointsOnSuccess;
  document.getElementById('set-trick').value = Game.settings.pointsPerTrick;
  document.getElementById('set-penalty').value = Game.settings.penaltyPerTrick;
  renderSettingsExamples();
}

// Les exemples suivent les valeurs saisies : c'est ce qui lève le doute
// "faut-il taper 2 ou -2 ?" mieux que n'importe quelle explication.
function renderSettingsExamples() {
  const s = parseInt(document.getElementById('set-success').value) || 0;
  const t = parseInt(document.getElementById('set-trick').value) || 0;
  const p = Math.abs(parseInt(document.getElementById('set-penalty').value) || 0);
  document.getElementById('ex-success').textContent =
    `Annonce 3, fait 3 : ${s} + 3 × ${t} = ${formatPts(s + 3 * t)} pts`;
  document.getElementById('ex-penalty').textContent = p === 0
    ? 'Pas de pénalité : une annonce ratée rapporte 0 pt'
    : `Annonce 4, fait 1 : 3 plis d'écart × ${p} = ${formatPts(-3 * p)} pts`;
}

function saveSettings() {
  const s = parseInt(document.getElementById('set-success').value);
  const t = parseInt(document.getElementById('set-trick').value);
  const p = parseInt(document.getElementById('set-penalty').value);
  if (isNaN(s) || isNaN(t) || isNaN(p) || s < 0 || t < 0) { showToast('Valeurs invalides'); renderSettings(); return; }
  Game.settings.pointsOnSuccess = s;
  Game.settings.pointsPerTrick = t;
  Game.settings.penaltyPerTrick = Math.abs(p);
  Storage.saveSettings(Game.settings);
  persistLocal();
  renderSettings();
  showToast('Paramètres enregistrés ✓');
}

// Aucun champ numérique de l'app n'attend de signe, de décimale ni
// d'exposant : on bloque ces touches plutôt que de corriger après coup.
document.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input[type=number]') && ['-', '+', 'e', 'E', '.', ','].includes(e.key)) {
    e.preventDefault();
  }
});
// Filet pour le collage et les claviers qui contournent keydown.
document.addEventListener('input', e => {
  const el = e.target;
  if (el.matches && el.matches('input[type=number]') && el.value !== '' && parseInt(el.value) < 0) {
    el.value = Math.abs(parseInt(el.value));
  }
}, true);

// ─── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const savedSettings = Storage.loadSettings();
  if (savedSettings) {
    // L'ancien réglage "points si échec" n'a pas d'équivalent : l'échec se
    // compte désormais au pli d'écart, avec la valeur par défaut.
    delete savedSettings.pointsOnFailure;
    Object.assign(Game.settings, savedSettings);
  }
  ['set-success', 'set-trick', 'set-penalty'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', renderSettingsExamples);
    el.addEventListener('change', saveSettings);
  });

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

// ─── PWA install prompt ───────────────────────────────────────────
// Repris de trashometre : bannière discrète sur mobile tant que l'app n'est
// pas installée, masquée 30 jours après un refus.
const INSTALL_DISMISS_KEY = 'rikiki.install.dismissedUntil';
let deferredInstallPrompt = null;  // rempli par `beforeinstallprompt` (Chrome Android)

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isBannerDismissed() {
  try {
    return Date.now() < parseInt(localStorage.getItem(INSTALL_DISMISS_KEY) || '0', 10);
  } catch (e) {
    return false;
  }
}

function rememberDismissal(ms) {
  try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now() + ms)); } catch (e) { /* noop */ }
}

function maybeShowInstallBanner() {
  if (isStandalone() || isBannerDismissed()) return;
  const isMobile = isIOS() || /Android/i.test(navigator.userAgent);
  if (!isMobile) return;
  setTimeout(() => document.body.classList.add('show-install-banner'), 1200);
}

function dismissInstallBanner() {
  document.body.classList.remove('show-install-banner');
  rememberDismissal(30 * 24 * 60 * 60 * 1000);
}

function openInstallGuide() {
  const ios = isIOS();
  document.getElementById('install-ios').style.display = ios ? 'block' : 'none';
  document.getElementById('install-android').style.display = ios ? 'none' : 'block';
  document.getElementById('native-install-btn').style.display = (!ios && deferredInstallPrompt) ? 'block' : 'none';
  document.getElementById('install-modal').style.display = 'flex';
  document.body.classList.remove('show-install-banner');
}

function closeInstallGuide() {
  document.getElementById('install-modal').style.display = 'none';
}

function onInstallBackdrop(e) {
  if (e.target.id === 'install-modal') closeInstallGuide();
}

async function triggerNativeInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try {
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      closeInstallGuide();
      rememberDismissal(10 * 365 * 24 * 60 * 60 * 1000);
    }
  } catch (e) { /* noop */ }
  deferredInstallPrompt = null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeInstallGuide();
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

window.addEventListener('appinstalled', () => {
  document.body.classList.remove('show-install-banner');
  deferredInstallPrompt = null;
});

document.addEventListener('DOMContentLoaded', maybeShowInstallBanner);

// ─── Écran allumé pendant la partie ───────────────────────────────
// Le téléphone posé sur la table ne doit pas se verrouiller entre deux
// manches. Le navigateur relâche le verrou quand l'app passe en arrière-plan,
// d'où la nouvelle demande au retour.
let wakeLock = null;

async function updateWakeLock() {
  if (!('wakeLock' in navigator)) return;
  const want = Game.hasActiveGame() && Game.state.phase !== 'finished' && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', updateWakeLock);

// ─── Joueurs de la partie précédente ──────────────────────────────
// On ne garde que la dernière table, dans son ordre : la liste reste courte
// (8 noms au plus) et l'ordre, qui décide de qui distribue, est conservé.
const KEY_LAST_TABLE = 'rikiki.lastTable.v1';

function loadLastTable() {
  try { return JSON.parse(localStorage.getItem(KEY_LAST_TABLE) || '[]'); } catch (e) { return []; }
}

function rememberPlayers(names) {
  try { localStorage.setItem(KEY_LAST_TABLE, JSON.stringify(names)); } catch (e) { /* noop */ }
}

function renderRecentPlayers() {
  const el = document.getElementById('recent-players');
  if (!el) return;
  const taken = new Set(setupPlayers.map(n => n.toLowerCase()));
  const left = loadLastTable().filter(n => !taken.has(n.toLowerCase()));
  if (!left.length || setupPlayers.length >= 8) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="recent-head">
      <span class="recent-label">Partie précédente</span>
      ${left.length > 1 ? `<button type="button" class="recent-all" onclick="addLastTable()">Tous les ajouter</button>` : ''}
    </div>
    <div class="recent-chips">${left.map(n =>
      `<button type="button" class="recent-chip" onclick="addRecentPlayer(this.dataset.name)" data-name="${escapeHtml(n)}">+ ${escapeHtml(n)}</button>`
    ).join('')}</div>`;
}

function addRecentPlayer(name) {
  document.getElementById('player-input').value = name;
  addPlayer();
  document.getElementById('player-input').blur();
}

function addLastTable() {
  const taken = new Set(setupPlayers.map(n => n.toLowerCase()));
  loadLastTable().forEach(n => {
    if (!taken.has(n.toLowerCase()) && setupPlayers.length < 8) setupPlayers.push(n);
  });
  renderSetup();
}

// ─── Partage du résultat ──────────────────────────────────────────
// Une image à envoyer dans le groupe de la soirée : c'est le seul moment où
// l'app sort de la table, donc le seul où elle peut se faire connaître.
const PLAYER_HEX = ['#ef5a46', '#1a9a96', '#7a5bd6', '#d98a10', '#3a78dd', '#3d974d', '#d14a8c', '#5c6b7a'];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function buildResultImage() {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  try { await Promise.all([document.fonts.load('700 64px Kreon'), document.fonts.load('400 32px "DM Sans"')]); } catch (e) { /* noop */ }

  ctx.fillStyle = '#fbf7f2';
  ctx.fillRect(0, 0, W, H);

  // Bandeau corail en haut, comme celui de la manche.
  const grad = ctx.createLinearGradient(0, 0, W, 380);
  grad.addColorStop(0, '#f37a43');
  grad.addColorStop(1, '#e8403c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 380);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '260px serif';
  ctx.fillText('♠♥', 640, 420);

  const sorted = Game.getSortedPlayers();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '700 48px Kreon';
  ctx.fillText('🏆', W / 2, 110);
  ctx.font = '700 92px Kreon';
  ctx.fillText(sorted[0].name, W / 2, 230);
  ctx.font = '400 36px "DM Sans"';
  ctx.fillText(`remporte la partie avec ${sorted[0].total} pts`, W / 2, 295);
  ctx.font = '400 28px "DM Sans"';
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${Game.completedRounds()} manches · ${new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}`, W / 2, 345);
  ctx.globalAlpha = 1;

  // Classement
  // Bloc centré entre le bandeau et le logo, quel que soit le nombre de joueurs.
  const rowH = Math.min(120, 620 / sorted.length);
  const top = 420 + (640 - rowH * sorted.length) / 2;
  ctx.textAlign = 'left';
  sorted.forEach((p, rank) => {
    const y = top + rank * rowH;
    if (rank === 0) {
      ctx.fillStyle = '#fde8e3';
      roundRect(ctx, 70, y - 8, W - 140, rowH - 8, 24);
      ctx.fill();
    }
    ctx.fillStyle = '#9b909f';
    ctx.font = '700 36px Kreon';
    ctx.fillText(String(rank + 1), 110, y + rowH / 2 + 4);
    const color = PLAYER_HEX[p.idx % PLAYER_HEX.length];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(200, y + rowH / 2 - 8, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 28px Kreon';
    ctx.fillText(p.name[0].toUpperCase(), 200, y + rowH / 2 + 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2b2130';
    ctx.font = '500 40px "DM Sans"';
    ctx.fillText(p.name, 250, y + rowH / 2 + 6);
    ctx.textAlign = 'right';
    ctx.font = '700 44px Kreon';
    ctx.fillStyle = rank === 0 ? '#d4412f' : '#2b2130';
    ctx.fillText(`${p.total}`, W - 110, y + rowH / 2 + 6);
    ctx.textAlign = 'left';
  });

  // Pied : logo + adresse
  try {
    const logo = await loadImage('logo.png');
    const lw = 300, lh = lw * logo.height / logo.width;
    ctx.drawImage(logo, (W - lw) / 2, H - 230, lw, lh);
  } catch (e) { /* noop */ }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5f5367';
  ctx.font = '400 30px "DM Sans"';
  ctx.fillText('Compte tes points sur rikiki.nuxo.be', W / 2, H - 90);
  ctx.fillStyle = '#9b909f';
  ctx.font = '400 24px "DM Sans"';
  ctx.fillText('Powered by Nuxo', W / 2, H - 50);

  return new Promise(resolve => c.toBlob(resolve, 'image/png'));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function shareResult() {
  const blob = await buildResultImage();
  const file = new File([blob], 'rikiki-resultat.png', { type: 'image/png' });
  const winner = Game.getSortedPlayers()[0];
  const text = `${winner.name} remporte la partie de Rikiki avec ${winner.total} pts ! https://rikiki.nuxo.be`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); } catch (e) { /* partage annulé */ }
    return;
  }
  // Ordinateur ou navigateur sans partage de fichier : on télécharge l'image.
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  showToast('Image téléchargée ✓');
}

// ─── Thème ────────────────────────────────────────────────────────
const KEY_THEME = 'rikiki.theme';

function currentThemeChoice() {
  try { return localStorage.getItem(KEY_THEME) || 'auto'; } catch (e) { return 'auto'; }
}

function setTheme(choice) {
  try { localStorage.setItem(KEY_THEME, choice); } catch (e) { /* noop */ }
  applyTheme();
  renderThemePicker();
}

function applyTheme() {
  const choice = currentThemeChoice();
  const root = document.documentElement;
  if (choice === 'auto') delete root.dataset.theme;
  else root.dataset.theme = choice;
  const dark = choice === 'dark' || (choice === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').setAttribute('content', dark ? '#1c1720' : '#fbf7f2');
}

function renderThemePicker() {
  const choice = currentThemeChoice();
  document.querySelectorAll('[data-theme-choice]').forEach(b => {
    const on = b.dataset.themeChoice === choice;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
document.addEventListener('DOMContentLoaded', applyTheme);
