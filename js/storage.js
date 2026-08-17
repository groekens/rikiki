// Local persistence. Keeps the running game alive across reloads, app closes
// and crashes, without requiring an account or a network connection.
const Storage = {
  KEY_GAME: 'rikiki.game.v1',
  KEY_SETTINGS: 'rikiki.settings.v1',

  _ok: null,
  available() {
    if (this._ok !== null) return this._ok;
    try {
      const probe = '__rikiki_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      this._ok = true;
    } catch (e) {
      // Private browsing on iOS, or storage disabled.
      this._ok = false;
    }
    return this._ok;
  },

  saveGame(payload) {
    if (!this.available()) return false;
    try {
      localStorage.setItem(this.KEY_GAME, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error('Sauvegarde locale impossible', e);
      return false;
    }
  },

  loadGame() {
    if (!this.available()) return null;
    try {
      const raw = localStorage.getItem(this.KEY_GAME);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Ignore a game that was already finished and saved.
      if (!data || !data.state) return null;
      return data;
    } catch (e) {
      console.error('Lecture de la sauvegarde impossible', e);
      return null;
    }
  },

  clearGame() {
    if (!this.available()) return;
    try { localStorage.removeItem(this.KEY_GAME); } catch (e) { /* noop */ }
  },

  saveSettings(settings) {
    if (!this.available()) return;
    try { localStorage.setItem(this.KEY_SETTINGS, JSON.stringify(settings)); } catch (e) { /* noop */ }
  },

  loadSettings() {
    if (!this.available()) return null;
    try {
      const raw = localStorage.getItem(this.KEY_SETTINGS);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },
};
