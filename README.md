# Rikiki 🃏

Application PWA pour compter les points au jeu de cartes Rikiki.

## Fonctionnalités

- Saisie des joueurs dans l'ordre (sens des aiguilles d'une montre), avec
  ajout rapide des joueurs de la partie précédente (un par un ou tous, ordre conservé)
- Calcul automatique des manches (montée + descente selon nb de joueurs)
- Saisie des annonces et des plis par pastilles (un tap, sans clavier)
- Le dernier à annoncer voit le nombre qu'il ne peut pas dire (pastille barrée)
- Plis du dernier joueur déduits automatiquement du total, toujours modifiables
- Calcul automatique des points
- Tableau des scores en direct, avec un **classement** au-dessus : rang partagé
  en cas d'égalité, places gagnées ou perdues depuis la manche précédente (▲▼),
  écart avec le leader. Calculé depuis les scores de chaque manche, rien à stocker
- Podium en bandeau sur l'écran de la manche (touche pour le classement complet),
  masqué en vue paysage où le classement est déjà affiché
- Rotation automatique du dealer et du premier à parler
- Règles du jeu intégrées
- Paramètres de score personnalisables
- **Pause et reprise** : la partie est sauvegardée en continu dans le navigateur.
  Fermer l'app, la recharger ou la faire planter ne perd plus rien.
- **Correction d'une manche passée** : touchez une case du tableau des scores
  (ou "Corriger une manche précédente") pour rectifier annonces et plis. Les
  points sont recalculés, les règles du jeu restent contrôlées.
- **Vue paysage tablette** : à partir de 840 px en paysage, l'écran se scinde,
  saisie de la manche à gauche et scores à droite.
- **Compte Google** : historique des parties terminées et reprise des parties
  en cours depuis un autre appareil.
- Partage du résultat en image (classement, lien rikiki.nuxo.be) via la feuille
  de partage du téléphone, téléchargement sur ordinateur
- Écran maintenu allumé pendant une partie en cours (Wake Lock API)
- Thème clair, sombre ou automatique (onglet Compte)
- Mode hors-ligne (Service Worker)
- Installable sur mobile (PWA), avec bannière d'invitation sur iOS et Android
  (masquée 30 jours après un refus, jamais affichée une fois l'app installée)

## Configuration Firebase requise

La connexion Google échoue avec `auth/unauthorized-domain` tant que le domaine
public n'est pas déclaré.

1. **Domaines autorisés** : Firebase Console → Authentication → Settings →
   Authorized domains → ajouter `rikiki.nuxo.be`.
   (`localhost` y est déjà, ce qui permet de tester en local.)
2. **Règles Firestore** : coller le contenu de `firestore.rules` dans
   Firestore Database → Rules → Publish.

## Stockage

| Où | Quoi | Quand |
|----|------|-------|
| `localStorage` | Partie en cours + paramètres de score | À chaque action |
| `localStorage` | Joueurs de la dernière partie, thème, refus de la bannière | Au lancement d'une partie / au choix |
| Firestore | Une fiche par partie (`users/{uid}/parties/{gameId}`) | À chaque fin de manche, si connecté |

L'état complet est sérialisé dans le champ `etatJson`, ce qui permet de
reprendre une partie exactement là où elle s'est arrêtée.

## Déploiement sur GitHub Pages

```bash
# 1. Créer un repo GitHub (ex: rikiki)
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TON_USERNAME/rikiki.git
git push -u origin main

# 2. Dans les settings GitHub du repo :
#    Settings → Pages → Source → Deploy from branch → main → / (root)

# L'app sera dispo sur : https://TON_USERNAME.github.io/rikiki/
```

## Paramètres de score (modifiables in-app)

| Situation | Par défaut |
|-----------|-----------|
| Points fixes si réussite | 10 pts |
| Points par pli réalisé (si réussite) | 1 pt/pli |
| Pénalité par pli d'écart (si échec) | 2 pts/pli |

L'échec coûte `|annoncé - réalisé| × pénalité` : annoncer 4 et en faire 1
donne -6, annoncer 7 et en faire 9 donne -4. La pénalité se saisit en positif
(un `-2` tapé est lu comme 2), 0 désactive la pénalité.

Les parties commencées avant cette règle (paramètre `pointsOnFailure`) sont
reprises avec une pénalité de 0, pour que corriger une ancienne manche ne
mélange pas deux barèmes. Les réglages par défaut enregistrés passent à 2.

## Structure

```
rikiki/
├── index.html          ← App principale
├── manifest.json       ← Config PWA
├── sw.js               ← Service Worker (offline)
├── .nojekyll           ← GitHub Pages
├── css/style.css       ← Styles
├── js/
│   ├── game.js         ← Moteur de jeu
│   └── app.js          ← Interface
└── icons/              ← Icônes PWA
```
