import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, orderBy, query, serverTimestamp }
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

// ─── Auth ──────────────────────────────────────────────────────────
window.currentUser = null;

onAuthStateChanged(auth, user => {
  window.currentUser = user;
  updateAuthUI(user);
});

window.signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Connexion échouée', e);
    if (window.showToast) showToast('Connexion échouée');
  }
};

window.signOutUser = async () => {
  await signOut(auth);
  if (window.showToast) showToast('Déconnecté');
};

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
window.savePartie = async (data) => {
  if (!window.currentUser) return false;
  try {
    await addDoc(collection(db, 'users', window.currentUser.uid, 'parties'), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (e) {
    console.error('Sauvegarde échouée', e);
    return false;
  }
};

async function loadHistorique(uid) {
  const container = document.getElementById('historique-list');
  if (!container) return;
  try {
    const q = query(
      collection(db, 'users', uid, 'parties'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">Aucune partie sauvegardée</div>`;
      return;
    }
    container.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      const date = d.createdAt?.toDate
        ? d.createdAt.toDate().toLocaleDateString('fr-BE', { day:'numeric', month:'short', year:'numeric' })
        : '—';
      const joueurs = (d.joueurs || []).join(', ');
      const gagnant = d.gagnant || '—';
      const scores = (d.joueurs || []).map((j, i) => `${j} : ${d.scores?.[i] ?? 0} pts`).join(' · ');
      return `
        <div class="card" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
            <span style="font-size:13px;font-weight:600;">🏆 ${gagnant}</span>
            <span style="font-size:11px;color:var(--text3);">${date}</span>
          </div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:4px;">${joueurs}</div>
          <div style="font-size:12px;color:var(--text3);">${scores}</div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red);font-size:13px;">Erreur de chargement</div>`;
  }
}

// Exposed so app.js can reload after saving
window.loadHistorique = () => {
  if (window.currentUser) loadHistorique(window.currentUser.uid);
};
