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

### F-03 Page Statistiques depuis Settings
- Priorite: P1
- Estimation: M
- Dependances: E-04, F-02
- Description: ajouter un acces a une page Statistiques depuis Settings pour afficher l'evolution des poids, les machines utilisees et filtrer les graphes par machine.
- Critere d'acceptation:
  - un acces "Statistiques" est visible et actionnable depuis Settings
  - la page affiche un graphe d'evolution des poids dans le temps a partir des seances terminees
  - la page affiche un graphe des machines ou exercices les plus utilises
  - un filtre par machine permet de mettre a jour les graphes de maniere coherente
  - un etat vide est affiche si aucune seance terminee n'est disponible
  - un message explicite est affiche si le filtre selectionne ne retourne aucune donnee
  - le rendu reste lisible sur mobile et desktop

#### F-03a Ajouter l'entree Statistiques dans Settings
- Priorite: P1
- Estimation: XS
- Dependances: F-03
- Description: ajouter dans Settings une action permettant d'ouvrir la page ou le panneau Statistiques.
- Critere d'acceptation:
  - un bouton ou lien "Statistiques" est visible dans Settings
  - un clic ouvre l'ecran de statistiques
  - la fermeture et le retour vers l'ecran precedent fonctionnent correctement

#### F-03b Construire les donnees statistiques depuis l'historique
- Priorite: P1
- Estimation: S
- Dependances: E-04, F-03
- Description: transformer les seances terminees en donnees exploitables pour les graphes de progression et d'usage.
- Critere d'acceptation:
  - seules les seances terminees sont prises en compte
  - les poids reels saisis dans les sets sont utilises
  - les donnees sont regroupees par exercice ou machine selon le modele disponible
  - les cas sans donnees sont geres sans erreur

#### F-03c Afficher le graphe d'evolution des poids
- Priorite: P1
- Estimation: S
- Dependances: F-03a, F-03b
- Description: afficher un graphique chronologique montrant l'evolution des poids a partir de l'historique.
- Critere d'acceptation:
  - le graphe affiche une evolution lisible dans le temps
  - les valeurs correspondent aux donnees historiques
  - l'affichage reste lisible sur mobile et desktop

#### F-03d Afficher le graphe des machines ou exercices les plus utilises
- Priorite: P1
- Estimation: S
- Dependances: F-03a, F-03b
- Description: afficher un graphique de frequence d'utilisation par machine ou exercice.
- Critere d'acceptation:
  - le classement ou l'histogramme affiche les usages correctement
  - l'utilisateur identifie rapidement les machines les plus utilisees
  - le composant reste robuste meme avec peu d'historique

#### F-03e Ajouter le filtre par machine
- Priorite: P1
- Estimation: S
- Dependances: F-03c, F-03d
- Description: permettre a l'utilisateur de filtrer les statistiques par machine ou exercice et propager ce filtre a tous les graphes.
- Critere d'acceptation:
  - la liste des machines disponibles est proposee
  - la selection d'un filtre met a jour tous les graphes
  - un message explicite s'affiche si aucun resultat ne correspond

#### F-03f Gerer les etats UX de la page Statistiques
- Priorite: P1
- Estimation: XS
- Dependances: F-03c, F-03d, F-03e
- Description: traiter les etats vides, sans resultat et les messages de feedback de la page Statistiques.
- Critere d'acceptation:
  - un etat vide est affiche si aucune seance terminee n'existe
  - un etat "aucun resultat" est affiche si le filtre ne retourne rien
  - les messages sont comprehensibles et coherents avec le reste de l'application

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

## EPIC I - Auth Google + Sauvegarde Drive depuis Settings (P1)

### I-01 Bouton "Se connecter avec Google" dans Settings
- Priorite: P1
- Estimation: S
- Dependances: A-01
- Description: ajouter dans l'ecran Settings un bouton de connexion Google via OAuth 2.0.
- Critere d'acceptation:
  - bouton visible et actionnable dans Settings
  - popup Google fonctionnelle
  - gestion des erreurs utilisateur (annulation/refus)

### I-02 Recuperer nom et prenom utilisateur
- Priorite: P1
- Estimation: S
- Dependances: I-01
- Description: apres authentification, recuperer nom/prenom (et email optionnel) et l'afficher dans Settings.
- Critere d'acceptation:
  - prenom et nom affiches apres connexion
  - etat "deconnecte" visible quand aucun compte n'est lie

### I-03 Push templates/sessions vers Google Drive (appData)
- Priorite: P1
- Estimation: M
- Dependances: I-01, I-02
- Description: appeler l'API Google Drive pour sauvegarder les templates et les seances de l'utilisateur.
- Critere d'acceptation:
  - un fichier templates et un fichier sessions sont crees/mis a jour dans appDataFolder
  - action manuelle "synchroniser" disponible dans Settings
  - message de succes/erreur affiche a l'utilisateur

### I-04 Base de synchro future (pull et conflits)
- Priorite: P2
- Estimation: M
- Dependances: I-03
- Description: poser les bases pour lecture Drive (pull) et detection de conflits par updatedAt.
- Critere d'acceptation:
  - format JSON versionne
  - horodatage updatedAt present dans les payloads

## EPIC H - Ameliorations interface (P1)

### H-01 Onglet Templates: liste d'abord + bouton ajout
- Priorite: P1
- Estimation: M
- Dependances: D-01, D-02
- Description: afficher d'abord les templates existants, puis ouvrir l'editeur via un bouton +.
- Critere d'acceptation:
  - la liste des templates est visible en premier dans l'onglet Templates
  - un bouton + ouvre l'editeur existant en mode creation
  - l'edition d'un template existant est accessible depuis la liste

### H-02 Onglet Seances: demarrage depuis templates existants
- Priorite: P1
- Estimation: S
- Dependances: D-03, E-01
- Description: proposer l'ecran de lancement d'une seance a partir des templates quand aucune seance n'est active.
- Critere d'acceptation:
  - l'onglet Seances affiche les templates demarrables si aucune seance n'est active
  - le bouton Demarrer lance la seance sur snapshot du template

### H-03 Onglet Seance: image de l'exercice courant
- Priorite: P1
- Estimation: S
- Dependances: C-01, E-01
- Description: afficher l'image locale de l'exercice actif dans l'ecran de seance.
- Critere d'acceptation:
  - l'image de l'exercice courant est visible pendant la seance
  - fallback visuel en cas d'image manquante
  - rendu responsive mobile/desktop

### H-04 Onglet Seance: barre sticky de navigation entre exercices
- Priorite: P1
- Estimation: M
- Dependances: E-01
- Description: ajouter une liste sticky en haut de l'onglet Seance pour basculer rapidement d'un exercice a l'autre.
- Critere d'acceptation:
  - la barre reste visible au scroll
  - un clic sur un exercice change le focus de l'ecran
  - l'exercice actif est clairement mis en evidence

### H-05 Onglet Historique: ecran split gauche/droite
- Priorite: P1
- Estimation: S
- Dependances: E-04
- Description: separer l'ecran historique en deux zones: liste des seances a gauche, detail a droite.
- Critere d'acceptation:
  - en desktop, layout 2 colonnes stable (liste/detail)
  - en mobile, layout adapte sans perte d'information
  - la selection d'une seance met a jour le detail sans rechargement

### H-06 Branding: logo plus serieux avec altere
- Priorite: P1
- Estimation: XS
- Dependances: A-02
- Description: remplacer le logo par une version plus sobre et professionnelle avec symbole d'altere.
- Critere d'acceptation:
  - nouveau logo visible dans le header
  - bonne lisibilite sur mobile et desktop

## EPIC I - Passe mobile templates et historique (P1)

### I-01 Historique mobile: detail immediat au clic
- Priorite: P1
- Estimation: M
- Dependances: E-04, H-05
- Description: sur mobile, ouvrir le detail d'une seance en overlay/sheet au clic pour eviter d'aller scroller sous la liste.
- Critere d'acceptation:
  - un clic sur une seance affiche son detail sans scroll vertical supplementaire
  - fermeture simple du detail mobile
  - le layout desktop liste/detail reste conserve

### I-02 Templates mobile: cartes et actions compactes
- Priorite: P1
- Estimation: M
- Dependances: H-01, D-02
- Description: reduire la taille des boutons et densifier les cartes templates et l'editeur sur mobile.
- Critere d'acceptation:
  - boutons de cartes plus compacts sur mobile
  - actions principales clairement hierarchisees
  - edition des sets plus lisible sans blocs trop hauts

### I-03 Densite mobile globale et interactions
- Priorite: P1
- Estimation: S
- Dependances: I-01, I-02
- Description: harmoniser paddings, chips, actions et feedbacks des zones hors seance pour une meilleure vue d'ensemble mobile.
- Critere d'acceptation:
  - densite visuelle plus compacte en mobile
  - pas de zone importante cachee hors ecran sans feedback clair
  - interactions principales visibles en un coup d'oeil
  - aucun decalage de layout

## EPIC J - Maintenance des donnees locales (P1)

### J-01 Purge complete des donnees locales
- Priorite: P1
- Estimation: S
- Dependances: B-02, E-04
- Description: ajouter une action explicite permettant de supprimer toutes les donnees stockees en local (templates, seances, preferences locales) avec confirmation utilisateur.
- Critere d'acceptation:
  - une action "Supprimer toutes les donnees locales" est visible dans Settings
  - une confirmation explicite est requise avant execution
  - apres confirmation, templates, historique de seances et etat de seance en cours sont vides
  - l'application revient a un etat initial coherent sans erreur

### J-02 Edition d'une seance passee
- Priorite: P1
- Estimation: L
- Dependances: E-04, H-05
- Description: permettre l'edition d'une seance historique: renommage de la seance, edition des sets existants (repetitions et poids), suppression et ajout de serie.
- Critere d'acceptation:
  - depuis l'historique, l'utilisateur peut ouvrir un mode edition pour une seance terminee
  - le nom de la seance est modifiable et persiste
  - pour chaque set, reps et poids sont modifiables avec validation minimale
  - l'utilisateur peut supprimer une serie et en ajouter une nouvelle
  - les modifications sont sauvegardees localement et visibles dans les statistiques/export

### J-03 Recharger les templates par defaut
- Priorite: P1
- Estimation: S
- Dependances: D-01
- Description: ajouter une action permettant de recharger les templates par defaut fournis par l'application.
- Critere d'acceptation:
  - une action "Recharger les templates par defaut" est disponible dans Settings
  - l'action propose les modes "remplacer" et "fusionner"
  - en mode remplacer, les templates existants sont remplaces par les templates par defaut
  - en mode fusionner, seuls les templates manquants sont ajoutes sans dupliquer les ids existants
  - un message de resultat indique le nombre de templates ajoutes/remplaces

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
5. H-01, H-02, H-03, H-04, H-05, H-06
6. J-01, J-02, J-03
7. F-01, F-02
8. G-01, G-02, G-03
