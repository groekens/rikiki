// ─── Screen routing ───────────────────────────────────────────────
const SCREENS = ['setup', 'game', 'scores', 'rules'];
let activeScreen = 'setup';

function showScreen(id) {
  if (!SCREENS.includes(id)) return;
  activeScreen = id;
  SCREENS.forEach(s => {
    document.getElementById('screen-' + s).classList.toggle('active', s === id);
    const btn = document.getElementById('nav-' + s);
    if (btn) btn.classList.toggle('active', s === id);
  });
}

// ─── Toast ────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
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
  Game.init([...setupPlayers]);
  document.getElementById('nav-game').disabled = false;
  document.getElementById('nav-scores').disabled = false;
  renderGameScreen();
  showScreen('game');
}

// ─── Game screen ──────────────────────────────────────────────────
function renderGameScreen() {
  if (Game.state.phase === 'finished') { renderFinished(); return; }
  const r = Game.currentRoundData();
  const ri = Game.state.currentRound;
  const total = Game.state.totalRounds;
  const players = Game.state.players;

  // Progress
  document.getElementById('progress-fill').style.width = ((ri / total) * 100) + '%';

  // Round header
  document.getElementById('round-title').textContent = `Manche ${ri + 1}`;
  document.getElementById('round-sub').textContent = `${r.cards} carte${r.cards > 1 ? 's' : ''}`;
  document.getElementById('round-badge').textContent = `${ri + 1} / ${total}`;

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

function backToAnnounce() {
  // Reset announcements for current round
  const r = Game.currentRoundData();
  r.announcements.forEach(a => { a.announced = null; });
  Game.state.phase = 'announce';
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

  order.forEach((pi, orderIdx) => {
    const tr = document.createElement('tr');
    tr.dataset.playerIdx = pi;
    tr.innerHTML = `
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="avatar" style="width:28px;height:28px;font-size:11px;">${players[pi].name[0].toUpperCase()}</div>
          <span>${players[pi].name}</span>
        </div>
      </td>
      <td><input type="number" min="0" max="${r.cards}" id="ann-${pi}" placeholder="0" oninput="checkAnnounceSum()"></td>`;
    tbody.appendChild(tr);
  });
  checkAnnounceSum();
}

function checkAnnounceSum() {
  const r = Game.currentRoundData();
  const order = Game.getAnnounceOrder();
  const n = order.length;
  const vals = order.map(pi => {
    const v = parseInt(document.getElementById('ann-' + pi)?.value);
    return isNaN(v) ? null : v;
  });
  const filled = vals.filter(v => v !== null);
  const sum = filled.reduce((s, v) => s + v, 0);
  const warn = document.getElementById('warn-announce');

  if (filled.length === n) {
    if (sum === r.cards) {
      warn.textContent = `⚠ Somme des annonces (${sum}) = nombre de plis (${r.cards}) — interdit ! Modifiez au moins une annonce.`;
      warn.classList.add('visible');
    } else {
      warn.classList.remove('visible');
    }
  } else if (filled.length === n - 1 && filled.length > 0) {
    const remaining = r.cards - sum;
    const lastIdx = order[order.findIndex((pi, i) => vals[i] === null)];
    const lastInp = document.getElementById('ann-' + lastIdx);
    if (lastInp) {
      const forbidden = remaining;
      warn.textContent = `ℹ Le dernier joueur ne peut pas annoncer ${forbidden >= 0 ? forbidden : '—'}.`;
      warn.classList.add('visible');
    }
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
    const v = parseInt(document.getElementById('ann-' + pi)?.value);
    if (isNaN(v) || v < 0 || v > r.cards) { valid = false; return; }
    announced[pi] = v;
  });
  if (!valid) { showToast('Remplissez toutes les annonces'); return; }
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
      <td><input type="number" min="0" max="${r.cards}" id="res-${pi}" placeholder="0" oninput="previewPoints(${pi})"></td>
      <td id="pts-preview-${pi}" style="font-size:13px;color:var(--text3);">—</td>`;
    tbody.appendChild(tr);
  });
}

function previewPoints(pi) {
  const r = Game.currentRoundData();
  const ann = r.announcements[pi].announced;
  const inp = document.getElementById('res-' + pi);
  const raw = inp?.value.trim();
  const v = (raw === '' || raw === undefined) ? 0 : parseInt(raw);
  const el = document.getElementById('pts-preview-' + pi);
  if (isNaN(v)) { el.innerHTML = '—'; return; }
  let pts;
  if (v === ann) {
    pts = Game.settings.pointsOnSuccess + v * Game.settings.pointsPerTrick;
    el.innerHTML = `<span class="badge badge-green">+${pts}</span>`;
  } else {
    pts = Game.settings.pointsOnFailure;
    el.innerHTML = pts === 0
      ? `<span class="badge badge-red">0</span>`
      : `<span class="badge badge-red">${pts}</span>`;
  }
}

function validateResults() {
  const r = Game.currentRoundData();
  const players = Game.state.players;
  const results = [];
  players.forEach((_, pi) => {
    const inp = document.getElementById('res-' + pi);
    const raw = inp?.value.trim();
    const v = (raw === '' || raw === undefined) ? 0 : parseInt(raw);
    if (isNaN(v) || v < 0 || v > r.cards) { results.push(null); return; }
    results.push(v);
  });
  if (results.includes(null)) { showToast('Valeurs invalides'); return; }
  const sum = results.reduce((s, v) => s + v, 0);
  if (sum !== r.cards) { showToast(`Total des plis = ${sum}, attendu ${r.cards}`); return; }
  Game.setResults(results);
  renderScores();
  if (Game.state.phase === 'finished') {
    renderFinished();
  } else {
    renderGameScreen();
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
  renderScores();
  showScreen('scores');
}

// ─── Scores screen ────────────────────────────────────────────────
function renderScores() {
  const state = Game.state;
  if (!state.players.length) return;

  const sorted = Game.getSortedPlayers();
  const leader = sorted[0];

  document.getElementById('score-leader-name').textContent = leader.name;
  document.getElementById('score-leader-pts').textContent = leader.total;
  document.getElementById('score-round-val').textContent =
    state.phase === 'finished' ? 'Fin !' : `${state.currentRound + 1} / ${state.totalRounds}`;
  document.getElementById('score-round-sub').textContent =
    state.phase === 'finished' ? 'Partie terminée' :
    `${state.roundSequence[state.currentRound]} cartes`;

  const thead = document.getElementById('score-thead');
  const tbody = document.getElementById('score-tbody');

  const cols = Math.min(state.currentRound + (state.phase === 'announce' ? 0 : 1), state.currentRound);
  let headRow = '<th>Joueur</th>';
  for (let m = 0; m < cols; m++) {
    headRow += `<th>M${m + 1}</th>`;
  }
  headRow += '<th>Total</th>';
  thead.innerHTML = headRow;

  tbody.innerHTML = '';
  sorted.forEach((p, rank) => {
    const tr = document.createElement('tr');
    if (rank === 0) tr.classList.add('leader');
    let row = `<td><div style="display:flex;align-items:center;gap:8px;">
      <div class="avatar" style="width:24px;height:24px;font-size:10px;">${p.name[0].toUpperCase()}</div>
      ${p.name}</div></td>`;
    for (let m = 0; m < cols; m++) {
      const pts = p.scores[m];
      if (pts === undefined || pts === null) { row += '<td>—</td>'; continue; }
      const r = state.rounds[m];
      const ann = r?.announcements[p.idx];
      const ok = ann && ann.announced === ann.got;
      row += `<td><span class="badge ${ok ? 'badge-green' : 'badge-red'}" style="font-size:11px;">${pts > 0 ? '+' : ''}${pts}</span></td>`;
    }
    row += `<td style="font-family:'Syne',sans-serif;font-weight:700;font-size:16px;">${p.total}</td>`;
    tr.innerHTML = row;
    tbody.appendChild(tr);
  });
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
  showToast('Paramètres sauvegardés ✓');
}

// ─── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Enter on player input
  document.getElementById('player-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPlayer();
  });
  renderSetup();
  renderSettings();
});
