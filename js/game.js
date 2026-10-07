// Game state
const Game = {
  settings: {
    pointsOnSuccess: 10,
    pointsPerTrick: 1,
    // Retiré pour chaque pli d'écart entre l'annonce et le résultat.
    // Toujours stocké en positif : annoncer 4 et faire 1 coûte 3 × 2 = 6 pts.
    penaltyPerTrick: 2,
  },

  state: {
    id: null,
    players: [],       // [{name, scores:[]}]
    rounds: [],        // [{cards, dealer, firstPlayer, announcements:[{announced,got}]}]
    currentRound: 0,
    phase: 'setup',    // setup | announce | result | finished
    totalRounds: 0,
    roundSequence: [], // [1,2,3,...,max,...,3,2,1]
  },

  // Called after every state mutation so the app can persist it.
  onChange: null,
  _touch() {
    if (typeof this.onChange === 'function') {
      try { this.onChange(); } catch (e) { console.error('Sauvegarde locale échouée', e); }
    }
  },

  newId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  init(playerNames) {
    const n = playerNames.length;
    const maxCards = Math.floor(52 / n);
    const seq = [];
    for (let i = 1; i <= maxCards; i++) seq.push(i);
    for (let i = maxCards - 1; i >= 1; i--) seq.push(i);

    this.state = {
      id: this.newId(),
      startedAt: Date.now(),
      players: playerNames.map(name => ({ name, scores: [] })),
      rounds: [],
      currentRound: 0,
      phase: 'announce',
      totalRounds: seq.length,
      roundSequence: seq,
      descending: false,
      peakReached: false,
    };
    this.startRound(0);
  },

  hasActiveGame() {
    return this.state.players.length > 0 && this.state.phase !== 'setup';
  },

  // Called when user wants to start descending now (before natural peak)
  triggerDescend() {
    const ri = this.state.currentRound;
    const currentCards = this.state.roundSequence[ri];
    // Rebuild sequence: keep played rounds, then descend from current cards - 1 down to 1
    const newSeq = [...this.state.roundSequence.slice(0, ri + 1)];
    for (let i = currentCards - 1; i >= 1; i--) newSeq.push(i);
    this.state.roundSequence = newSeq;
    this.state.totalRounds = newSeq.length;
    this.state.descending = true;
    this._touch();
  },

  isAtPeak() {
    const ri = this.state.currentRound;
    const seq = this.state.roundSequence;
    // We're at peak if current cards >= next cards (or last)
    return ri >= seq.length - 1 || seq[ri] >= seq[ri + 1];
  },

  startRound(idx) {
    const n = this.state.players.length;
    const dealer = idx % n;
    const firstPlayer = (dealer + 1) % n;
    this.state.rounds[idx] = {
      cards: this.state.roundSequence[idx],
      dealer,
      firstPlayer,
      announcements: this.state.players.map(() => ({ announced: null, got: null })),
    };
    this.state.currentRound = idx;
    this.state.phase = 'announce';
    this._touch();
  },

  getAnnounceOrder() {
    const r = this.currentRoundData();
    const n = this.state.players.length;
    const order = [];
    for (let i = 0; i < n; i++) {
      order.push((r.firstPlayer + i) % n);
    }
    return order;
  },

  currentRoundData() {
    return this.state.rounds[this.state.currentRound];
  },

  setAnnouncements(announcements) {
    // announcements: array indexed by player, [{announced}]
    const r = this.currentRoundData();
    announcements.forEach((a, i) => { r.announcements[i].announced = a; });
    this.state.phase = 'result';
    this._touch();
  },

  setResults(results) {
    // results: array indexed by player, [{got}]
    const r = this.currentRoundData();
    results.forEach((res, i) => { r.announcements[i].got = res; });
    this.computeScores(this.state.currentRound);
    if (this.state.currentRound + 1 >= this.state.totalRounds) {
      this.state.phase = 'finished';
      this.state.finishedAt = Date.now();
      this._touch();
    } else {
      this.startRound(this.state.currentRound + 1);
    }
  },

  pointsFor(announced, got) {
    if (announced === got) {
      return this.settings.pointsOnSuccess + got * this.settings.pointsPerTrick;
    }
    const penalty = Math.abs(announced - got) * this.settings.penaltyPerTrick;
    return penalty ? -penalty : 0;
  },

  computeScores(roundIdx) {
    const r = this.state.rounds[roundIdx];
    r.announcements.forEach((a, i) => {
      this.state.players[i].scores[roundIdx] = this.pointsFor(a.announced, a.got);
    });
  },

  // ─── Editing a past round ───────────────────────────────────────
  // Number of rounds whose results are locked in. In `finished` the last
  // round is played too, so currentRound alone would miss it.
  completedRounds() {
    return this.state.phase === 'finished' ? this.state.totalRounds : this.state.currentRound;
  },

  isRoundEditable(idx) {
    return Number.isInteger(idx) && idx >= 0 && idx < this.completedRounds();
  },

  // Returns an error message, or null when the round is valid.
  checkRoundInput(idx, announced, got) {
    const r = this.state.rounds[idx];
    if (!r) return 'Manche introuvable';
    const n = this.state.players.length;
    if (announced.length !== n || got.length !== n) return 'Données incomplètes';
    for (const v of announced.concat(got)) {
      if (!Number.isInteger(v) || v < 0 || v > r.cards) {
        return `Chaque valeur doit être un nombre entre 0 et ${r.cards}`;
      }
    }
    if (announced.reduce((s, v) => s + v, 0) === r.cards) {
      return `Somme des annonces = ${r.cards} plis, interdit. Modifiez au moins une annonce.`;
    }
    const sumGot = got.reduce((s, v) => s + v, 0);
    if (sumGot !== r.cards) {
      return `Total des plis réalisés = ${sumGot}, attendu ${r.cards}.`;
    }
    return null;
  },

  updateRound(idx, announced, got) {
    const err = this.checkRoundInput(idx, announced, got);
    if (err) return err;
    const r = this.state.rounds[idx];
    r.announcements.forEach((a, i) => { a.announced = announced[i]; a.got = got[i]; });
    this.computeScores(idx);
    this._touch();
    return null;
  },

  getTotal(playerIdx) {
    return this.state.players[playerIdx].scores.reduce((s, v) => s + (v || 0), 0);
  },

  // Classement après les `n` premières manches, rang "à la foot" : deux
  // joueurs à égalité partagent la place (1, 1, 3). Calculé depuis les scores
  // de chaque manche, donc rien à stocker et les anciennes parties en profitent.
  getStandings(n = this.completedRounds()) {
    const rows = this.state.players.map((p, i) => ({
      name: p.name,
      idx: i,
      total: p.scores.slice(0, n).reduce((s, v) => s + (v || 0), 0),
    }));
    rows.sort((a, b) => b.total - a.total || a.idx - b.idx);
    rows.forEach((r, k) => {
      r.rank = k > 0 && r.total === rows[k - 1].total ? rows[k - 1].rank : k + 1;
    });
    return rows;
  },

  getSortedPlayers() {
    return this.state.players
      .map((p, i) => ({ ...p, idx: i, total: this.getTotal(i) }))
      .sort((a, b) => b.total - a.total);
  },

  isForbiddenSum(announcements) {
    const r = this.currentRoundData();
    const sum = announcements.reduce((s, v) => s + (v ?? 0), 0);
    return sum === r.cards;
  },

  getSumLeft(currentAnnouncements) {
    const r = this.currentRoundData();
    const sum = currentAnnouncements.reduce((s, v) => s + (v ?? 0), 0);
    return r.cards - sum;
  },

  // ─── Persistence ────────────────────────────────────────────────
  serialize() {
    return {
      v: 1,
      settings: { ...this.settings },
      state: this.state,
      savedAt: Date.now(),
    };
  },

  restore(data) {
    const st = data && data.state;
    if (!st || !Array.isArray(st.players) || st.players.length < 2) return false;
    if (!Array.isArray(st.rounds) || !Array.isArray(st.roundSequence)) return false;
    if (data.settings) {
      const saved = { ...data.settings };
      // Partie commencée avant la pénalité par pli d'écart : elle a été jouée
      // avec un échec à 0, on garde cette règle pour que corriger une ancienne
      // manche ne mélange pas deux barèmes dans la même partie.
      if (saved.penaltyPerTrick === undefined && 'pointsOnFailure' in saved) saved.penaltyPerTrick = 0;
      delete saved.pointsOnFailure;
      this.settings = { ...this.settings, ...saved };
    }
    this.state = st;
    if (!this.state.id) this.state.id = this.newId();
    return true;
  },

  // Short human summary used by the resume banner and the history list.
  describe() {
    const st = this.state;
    const done = this.completedRounds();
    return {
      players: st.players.map(p => p.name).join(', '),
      progress: `Manche ${Math.min(done + 1, st.totalRounds)} / ${st.totalRounds}`,
      finished: st.phase === 'finished',
    };
  },
};
