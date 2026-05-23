# Strong Simon - Backlog d'implementation

## Regles de priorisation
- P0: indispensable MVP
- P1: important apres MVP coeur
- P2: post-MVP

## Convention d'estimation
- XS: < 0.5 jour
- S: 0.5-1 jour
- M: 1-2 jours
- L: 2-3 jours

## EPIC A - Fondations projet (P0)

### A-01 Initialiser application PWA React + TypeScript
- Priorite: P0
- Estimation: S
- Dependances: aucune
- Description: creer le projet frontend et configurer le mode PWA installable.
- Critere d'acceptation:
  - build et lancement local OK
  - manifeste web valide
  - service worker enregistre

### A-02 Mettre en place architecture de dossiers
- Priorite: P0
- Estimation: XS
- Dependances: A-01
- Description: structurer src par domaines (catalog, templates, sessions, stats, storage, ui).
- Critere d'acceptation:
  - arborescence claire
  - separation composants / logique / stockage

### A-03 Outillage qualite
- Priorite: P0
- Estimation: S
- Dependances: A-01
- Description: ESLint, Prettier, Vitest, scripts npm.
- Critere d'acceptation:
  - npm run lint OK
  - npm run test OK

## EPIC B - Stockage local-first (P0)

### B-01 Ajouter couche IndexedDB (Dexie)
- Priorite: P0
- Estimation: M
- Dependances: A-01
- Description: configurer une base locale avec tables templates, sessions, catalog metadata.
- Critere d'acceptation:
  - ecriture/lecture IndexedDB fonctionnelle
  - migration de schema versionnee

### B-02 Creer repositories de donnees
- Priorite: P0
- Estimation: M
- Dependances: B-01
- Description: abstraire l'acces donnees via repositories (pas d'acces direct dans UI).
- Critere d'acceptation:
  - CRUD templates fonctionnel via repository
  - tests unitaires repositories

### B-03 Auto-save et reprise etat
- Priorite: P0
- Estimation: M
- Dependances: B-02
- Description: sauvegarde automatique seance en cours + reprise au redemarrage.
- Critere d'acceptation:
  - fermeture/reouverture conserve l'etat
  - pas de perte de set valide

## EPIC C - Catalogue exercices (P0)

### C-01 Definir format catalogue JSON
- Priorite: P0
- Estimation: XS
- Dependances: A-02
- Description: schema exercise avec id, name, aliases, imageUrl, category.
- Critere d'acceptation:
  - fichier JSON valide
  - 20+ exercices de depart

### C-02 Ecran de recherche exercice
- Priorite: P0
- Estimation: M
- Dependances: C-01
- Description: composant de recherche avec match sur name et aliases.
- Critere d'acceptation:
  - recherche par alias retourne l'exercice attendu
  - image visible dans les resultats

### C-03 Selection exercice depuis editeur template
- Priorite: P0
- Estimation: S
- Dependances: C-02, D-02
- Description: liaison du selecteur de catalogue au formulaire template.
- Critere d'acceptation:
  - ajout d'exercice en 2-3 interactions max

## EPIC D - Templates routines (P0)

### D-01 Liste templates
- Priorite: P0
- Estimation: S
- Dependances: B-02
- Description: afficher templates existants + actions creer, dupliquer, supprimer.
- Critere d'acceptation:
  - navigation vers edition

### D-02 Editeur template
- Priorite: P0
- Estimation: L
- Dependances: D-01
- Description: creer/modifier nom, exercices, sets, reps, poids, repos.
- Critere d'acceptation:
  - reordonnancement exercice
  - validation de formulaire

### D-03 Snapshot template -> seance
- Priorite: P0
- Estimation: M
- Dependances: D-02, E-01
- Description: au lancement seance, copier le template pour figer l'historique.
- Critere d'acceptation:
  - edition seance n'impacte pas template source

## EPIC E - Seance active (P0)

### E-01 Ecran seance active mobile-first
- Priorite: P0
- Estimation: L
- Dependances: A-02, B-03
- Description: afficher exercice courant, sets, progression, navigation rapide.
- Critere d'acceptation:
  - utilisable a une main
  - actions +0.5 kg, +1 rep, dupliquer set

### E-02 Timer de repos
- Priorite: P0
- Estimation: M
- Dependances: E-01
- Description: timer configurable par set avec start/pause/restart.
- Critere d'acceptation:
  - precision acceptable (+/- 1s)

### E-03 Notifications fin de repos
- Priorite: P0
- Estimation: S
- Dependances: E-02
- Description: Notification API + fallback visuel/sonore.
- Critere d'acceptation:
  - alerte visible meme si permission refusee

### E-04 Finalisation seance et historique
- Priorite: P0
- Estimation: M
- Dependances: E-01
- Description: cloturer seance, stocker endedAt, afficher historique et details.
- Critere d'acceptation:
  - historique trie par date
  - detail avec toutes les series

## EPIC F - Export et stats (P1)

### F-01 Export CSV
- Priorite: P1
- Estimation: S
- Dependances: E-04
- Description: exporter templates + sessions en CSV.
- Critere d'acceptation:
  - ouverture OK dans Excel/Sheets

### F-02 Statistiques entrainement
- Priorite: P1
- Estimation: M
- Dependances: E-04
- Description: nombre entrainements/semaine, progression charge par exercice.
- Critere d'acceptation:
  - graphiques affiches sans erreur

## EPIC G - Sync Google Drive (P2)

### G-01 OAuth Google
- Priorite: P2
- Estimation: M
- Dependances: A-01
- Description: connexion Google pour permissions Drive.
- Critere d'acceptation:
  - token recupere et rafraichi

### G-02 Push/Pull JSON Drive
- Priorite: P2
- Estimation: L
- Dependances: G-01, B-02
- Description: upload/download fichier app-data.json.
- Critere d'acceptation:
  - sync manuelle fonctionne sur 2 appareils

### G-03 Resolution de conflits
- Priorite: P2
- Estimation: L
- Dependances: G-02
- Description: merge par updatedAt et outil de resolution manuelle.
- Critere d'acceptation:
  - aucun ecrasement silencieux de donnees

## Parcours de recette MVP
- creer un template depuis catalogue
- lancer une seance
- enregistrer au moins 2 exercices x 3 sets
- recevoir alerte de fin de repos
- fermer/reouvrir app et reprendre etat
- finaliser seance puis verifier historique

## Ordre d'implementation recommande
1. A-01, A-02, A-03
2. B-01, B-02, C-01
3. D-01, D-02, C-02, C-03
4. E-01, D-03, E-02, E-03, E-04
5. F-01, F-02
6. G-01, G-02, G-03
