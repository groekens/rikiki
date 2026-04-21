// Game state
const Game = {
  settings: {
    pointsOnSuccess: 10,
    pointsPerTrick: 1,
    pointsOnFailure: 0,
  },

  state: {
    players: [],       // [{name, scores:[]}]
    rounds: [],        // [{cards, dealer, firstPlayer, announcements:[{announced,got}]}]
    currentRound: 0,
    phase: 'setup',    // setup | announce | result | finished
    totalRounds: 0,
    roundSequence: [], // [1,2,3,...,max,...,3,2,1]
  },

  init(playerNames) {
    const n = playerNames.length;
    const maxCards = Math.floor(52 / n);
    const seq = [];
    for (let i = 1; i <= maxCards; i++) seq.push(i);
    for (let i = maxCards - 1; i >= 1; i--) seq.push(i);

    this.state = {
      players: playerNames.map(name => ({ name, scores: [] })),
      rounds: [],
      currentRound: 0,
      phase: 'announce',
      totalRounds: seq.length,
      roundSequence: seq,
    };
    this.startRound(0);
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
  },

  setResults(results) {
    // results: array indexed by player, [{got}]
    const r = this.currentRoundData();
    results.forEach((res, i) => { r.announcements[i].got = res; });
    this.computeScores(this.state.currentRound);
    if (this.state.currentRound + 1 >= this.state.totalRounds) {
      this.state.phase = 'finished';
    } else {
      this.startRound(this.state.currentRound + 1);
    }
  },

  computeScores(roundIdx) {
    const r = this.state.rounds[roundIdx];
    r.announcements.forEach((a, i) => {
      let pts;
      if (a.announced === a.got) {
        pts = this.settings.pointsOnSuccess + a.got * this.settings.pointsPerTrick;
      } else {
        pts = this.settings.pointsOnFailure;
      }
      this.state.players[i].scores[roundIdx] = pts;
    });
  },

  getTotal(playerIdx) {
    return this.state.players[playerIdx].scores.reduce((s, v) => s + (v || 0), 0);
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
};
