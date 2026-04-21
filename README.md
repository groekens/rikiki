# Rikiki 🃏

Application PWA pour compter les points au jeu de cartes Rikiki.

## Fonctionnalités

- Saisie des joueurs dans l'ordre (sens des aiguilles d'une montre)
- Calcul automatique des manches (montée + descente selon nb de joueurs)
- Gestion des annonces avec détection de la somme interdite
- Suivi des plis réalisés et calcul automatique des points
- Tableau des scores en direct
- Rotation automatique du dealer et du premier à parler
- Sélecteur d'atout par manche
- Règles du jeu intégrées
- Paramètres de score personnalisables
- Mode hors-ligne (Service Worker)
- Installable sur mobile (PWA)

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
