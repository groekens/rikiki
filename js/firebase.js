import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, orderBy, query, limit, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9EtNjgbjJZVx8N2mfpN2q9RL0Bv4XfvM",
  authDomain: "rikiki-the-game.firebaseapp.com",
  projectId: "rikiki-the-game",
  storageBucket: "rikiki-the-game.firebasestorage.app",
  messagingSenderId: "506174480119",
  appId: "1:506174480119:web:f56f8921e246812b8e3df2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const toast = msg => { if (window.showToast) window.showToast(msg); };

// ─── Auth ──────────────────────────────────────────────────────────
window.currentUser = null;

// Safari blocks popups when the PWA runs in standalone mode, so a redirect
// is the only flow that works once the app is installed on the home screen.
function prefersRedirect() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return standalone || iOS;
}

function explainAuthError(e) {
  const code = (e && e.code) || '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return `Domaine non autorisé (${location.hostname}). Ajoutez-le dans Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/popup-blocked':
      return 'Popup bloquée par le navigateur';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Connexion annulée';
    case 'auth/network-request-failed':
      return 'Pas de connexion réseau';
    case 'auth/operation-not-allowed':
      return 'Connexion Google non activée dans Firebase';
    default:
      return code ? `Connexion échouée (${code})` : 'Connexion échouée';
  }
}

// Errors are surfaced to the user, not just logged: the domain problem above
// is invisible otherwise.
window.signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    if (prefersRedirect()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Connexion échouée', e);
    const code = (e && e.code) || '';
    // A blocked or unsupported popup is recoverable via redirect.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (e2) {
        console.error('Redirection échouée', e2);
        toast(explainAuthError(e2));
        return;
      }
    }
    toast(explainAuthError(e));
  }
};

getRedirectResult(auth).catch(e => {
  console.error('Retour de connexion échoué', e);
  toast(explainAuthError(e));
});

window.signOutUser = async () => {
  await signOut(auth);
  toast('Déconnecté');
};

onAuthStateChanged(auth, user => {
  window.currentUser = user;
  updateAuthUI(user);
  // Push the running game as soon as the user is known.
  if (user && window.syncCloudNow) window.syncCloudNow();
});

function updateAuthUI(user) {
  const loggedout = document.getElementById('compte-loggedout');
  const loggedin = document.getElementById('compte-loggedin');
  if (!loggedout || !loggedin) return;

  if (user) {
    loggedout.style.display = 'none';
    loggedin.style.display = 'block';
    document.getElementById('user-name').textContent = user.displayName || 'Joueur';
    document.getElementById('user-email').textContent = user.email || '';
    const photo = document.getElementById('user-photo');
    if (user.photoURL) { photo.src = user.photoURL; photo.style.display = 'block'; }
    else { photo.style.display = 'none'; }
    loadHistorique(user.uid);
  } else {
    loggedout.style.display = 'block';
    loggedin.style.display = 'none';
  }
}

// ─── Firestore ─────────────────────────────────────────────────────
// One document per game, keyed by the game id, so a game in progress is
// updated in place instead of piling up a new doc per round.
const seenGames = new Set();

window.saveGameState = async (data) => {
  if (!window.currentUser || !data || !data.gameId) return false;
  try {
    const ref = doc(db, 'users', window.currentUser.uid, 'parties', data.gameId);
    const payload = { ...data, updatedAt: serverTimestamp() };
    if (!seenGames.has(data.gameId)) {
      payload.createdAt = serverTimestamp();
      seenGames.add(data.gameId);
    }
    await setDoc(ref, payload, { merge: true });
    return true;
  } catch (e) {
    console.error('Sauvegarde cloud échouée', e);
    if (e && e.code === 'permission-denied') {
      toast('Sauvegarde cloud refusée (règles Firestore)');
    }
    return false;
  }
};

window.deleteCloudGame = async (gameId) => {
  if (!window.currentUser || !gameId) return;
  if (!confirm('Supprimer cette partie du cloud ?')) return;
  try {
    await deleteDoc(doc(db, 'users', window.currentUser.uid, 'parties', gameId));
    toast('Partie supprimée');
    loadHistorique(window.currentUser.uid);
  } catch (e) {
    console.error('Suppression échouée', e);
    toast('Suppression échouée');
  }
};

// Cache of the raw docs so a resume click can hand the state back to app.js.
const gameCache = new Map();

window.resumeCloudGame = (gameId) => {
  const data = gameCache.get(gameId);
  if (!data) { toast('Partie introuvable'); return; }
  if (window.applyCloudGame) window.applyCloudGame(data);
};

function fmtDate(ts) {
  return ts && ts.toDate
    ? ts.toDate().toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
}

function cardEnCours(id, d) {
  const joueurs = (d.joueurs || []).join(' · ');
  const progress = d.mancheCourante != null && d.manches
    ? `Manche ${Math.min(d.mancheCourante + 1, d.manches)} sur ${d.manches}`
    : 'En cours';
  return `
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:600;">⏸ ${progress}</span>
        <span style="font-size:11px;color:var(--text3);">${fmtDate(d.updatedAt || d.createdAt)}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">${joueurs}</div>
      <div style="display:flex;gap:8px;">
        <button class="btn-sm" onclick="resumeCloudGame('${id}')">Reprendre →</button>
        <button class="btn-sm danger" onclick="deleteCloudGame('${id}')">Supprimer</button>
      </div>
    </div>`;
}

function cardTerminee(id, d) {
  const joueurs = (d.joueurs || []).join(', ');
  const scores = (d.joueurs || []).map((j, i) => `${j} : ${d.scores?.[i] ?? 0} pts`).join(' · ');
  const canReopen = !!d.etatJson;
  return `
    <div class="card" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:600;">🏆 ${d.gagnant || '—'}</span>
        <span style="font-size:11px;color:var(--text3);">${fmtDate(d.createdAt || d.updatedAt)}</span>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">${joueurs}</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:${canReopen ? '10px' : '0'};">${scores}</div>
      ${canReopen ? `<button class="btn-sm" onclick="resumeCloudGame('${id}')">Revoir le détail</button>` : ''}
    </div>`;
}

async function loadHistorique(uid) {
  const enCoursEl = document.getElementById('encours-list');
  const histoEl = document.getElementById('historique-list');
  if (!histoEl) return;

  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'parties'),
      orderBy('createdAt', 'desc'),
      limit(50)
    ));

    gameCache.clear();
    const enCours = [];
    const terminees = [];
    snap.docs.forEach(docSnap => {
      const d = docSnap.data();
      gameCache.set(docSnap.id, d);
      // Docs written before this version have no statut: they are finished games.
      if ((d.statut || 'terminee') === 'en_cours') enCours.push([docSnap.id, d]);
      else terminees.push([docSnap.id, d]);
    });

    if (enCoursEl) {
      enCoursEl.innerHTML = enCours.length
        ? enCours.map(([id, d]) => cardEnCours(id, d)).join('')
        : '<div class="historique-empty">Aucune partie en cours</div>';
    }
    histoEl.innerHTML = terminees.length
      ? terminees.map(([id, d]) => cardTerminee(id, d)).join('')
      : '<div class="historique-empty">Aucune partie sauvegardée</div>';
  } catch (e) {
    console.error('Chargement historique échoué', e);
    const msg = e && e.code === 'permission-denied'
      ? 'Accès refusé (règles Firestore)'
      : 'Erreur de chargement';
    histoEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red);font-size:13px;">${msg}</div>`;
    if (enCoursEl) enCoursEl.innerHTML = '';
  }
}

// Exposed so app.js can reload after saving
window.loadHistorique = () => {
  if (window.currentUser) loadHistorique(window.currentUser.uid);
};
