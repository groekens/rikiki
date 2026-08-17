# Rikiki 🃏

Application PWA pour compter les points au jeu de cartes Rikiki.

## Fonctionnalités

- Saisie des joueurs dans l'ordre (sens des aiguilles d'une montre)
- Calcul automatique des manches (montée + descente selon nb de joueurs)
- Gestion des annonces avec détection de la somme interdite
- Suivi des plis réalisés et calcul automatique des points
- Tableau des scores en direct
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
- Mode hors-ligne (Service Worker)
- Installable sur mobile (PWA)

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
| Points si échec | 0 pts |

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
