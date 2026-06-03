# Strong Simon - Application PWA Node.js pour suivi de musculation

## 1. Vision du produit
Construire une application PWA orientee mobile pour planifier et suivre des seances de musculation, avec un usage rapide pendant l'entrainement.

Objectifs principaux:
- creer des templates de routines (exercices + series + repos)
- demarrer une seance a partir d'un template
- enregistrer, modifier et valider les repetitions, poids et temps de repos pendant la seance
- notifier l'utilisateur a la fin du temps de repos
- rendre la saisie ultra rapide pendant l'effort (peu de clics)

## 2. Fonctionnalites essentielles (MVP)

### 2.1 Gestion des templates
- creer un template (ex: Push A, Pull B, Jambes)
- ajouter/supprimer/reordonner les exercices depuis une liste interne
- pour chaque exercice, definir:
	- nombre de series cible
	- repetitions cibles par serie
	- poids cible par serie (ou poids par defaut)
	- temps de repos (en secondes)

### 2.5 Catalogue d'exercices integre
- proposer une liste d'exercices pre-chargee dans l'application
- pour chaque exercice, stocker:
	- nom principal
	- noms alternatifs (alias machine/exercice) pour la recherche
	- image d'illustration
	- categorie (optionnel)
- permettre la recherche avec tolerance aux synonymes (ex: "leg press", "presse a cuisses")

### 2.2 Demarrage et suivi d'une seance
- demarrer une seance depuis un template
- afficher la liste des exercices de la seance
- pour chaque exercice, afficher les series pre-remplies depuis le template
- modifier rapidement repetitions et poids reel par serie
- demarrer un timer de repos apres une serie
- passer facilement a l'exercice suivant

### 2.3 Notifications de repos
- demander la permission de notifications web
- declencher une notification locale quand le repos est termine
- fallback visuel/sonore dans l'application si notification non disponible

### 2.4 UX de saisie rapide
- gros boutons + interface tactile
- edition inline des valeurs (poids/reps)
- actions rapides: +0.5 kg, +1 rep, dupliquer serie precedente
- minimiser le nombre de taps pour valider une serie

## 3. Fonctionnalites secondaires
- export CSV (templates, seances, historique)
- tableau de bord statistiques:
	- nombre d'entrainements par semaine
	- evolution de charge par exercice/machine
	- volume total (poids x reps x series)

## 4. Fonctionnalites futures
- module LLM:
	- analyse des entrainements
	- recommandations de progression
	- proposition de nouveaux templates
- sync cloud Google Drive:
	- sauvegarde/restauration templates + seances + catalogue personnalise
	- usage multi-appareils

## 5. Stack technique recommandee

### Frontend PWA
- React + Vite + TypeScript
- Workbox (service worker, offline cache)
- UI: shadcn/ui ou Mantine (mobile-first)
- Graphiques: Recharts

### Backend Node.js
- Node.js + Express
- API REST JSON (optionnelle pour evolutions futures)
- Auth (plus tard): JWT + OAuth Google

### Stockage des donnees (sans base de donnees)
- etape 1: stockage local navigateur (IndexedDB prioritaire, localStorage possible pour preferences)
- etape 2: sauvegarde/synchronisation de fichiers JSON sur Google Drive
- contrainte: aucune base SQL/NoSQL cote application

## 6. Modele de donnees (minimum)

### Exercise
- id
- name
- aliases[]
- imageUrl
- category (optionnel)

### ExerciseCatalog
- version
- exercises[]

### RoutineTemplate
- id
- name
- createdAt
- updatedAt

### TemplateExercise
- id
- image
- templateId
- exerciseId
- orderIndex

### TemplateSet
- id
- templateExerciseId
- setNumber
- targetReps
- targetWeight
- restSeconds

### WorkoutSession
- id
- templateId (nullable si seance libre)
- startedAt
- endedAt
- notes

### SessionExercise
- id
- sessionId
- exerciseId
- orderIndex

### SessionSet
- id
- sessionExerciseId
- setNumber
- targetReps
- targetWeight
- actualReps
- actualWeight
- restSeconds
- completedAt

## 7. Ecrans MVP
- Ecran 1: liste des templates
- Ecran 2: editeur de template
- Ecran 3: lancement de seance
- Ecran 4: ecran actif de seance (coeur de l'app)
- Ecran 5: historique des seances
- Ecran 6: detail d'une seance

## 8. API REST (exemple minimal)
- mode MVP local-first: pas d'API obligatoire pour templates/seances (tout est en local navigateur)
- endpoints optionnels (phase cloud):
	- POST /api/sync/push
	- POST /api/sync/pull
	- GET /api/export/csv

## 9. Regles metier importantes
- une seance copie les donnees du template au demarrage (snapshot), pour garder l'historique coherent
- les modifications pendant la seance ne modifient pas automatiquement le template source
- toutes les valeurs de poids sont en decimal (ex: 22.5)
- repos configurable par serie

## 10. Contraintes PWA
- doit fonctionner offline pour saisir la seance
- sync des donnees quand la connexion revient
- installable sur mobile (Android/iOS via navigateur compatible)
- notifications locales pour la fin de repos
- cache du catalogue d'exercices (noms + images) pour usage hors ligne

## 11. Plan de livraison

### Sprint 1 (MVP base)
- structure projet PWA (frontend) + couche Node.js optionnelle
- CRUD templates
- demarrage + suivi de seance
- persistence locale IndexedDB
- catalogue d'exercices avec images et alias

### Sprint 2 (MVP complet)
- timer repos + notifications
- historique seances
- ergonomie saisie rapide

### Sprint 3 (plus)
- export CSV
- dashboard stats

### Sprint 4 (roadmap)
- LLM coaching
- sync Google Drive

## 12. Criteres d'acceptation MVP
- je peux creer un template complet avec plusieurs exercices
- je peux choisir un exercice rapidement via recherche sur nom ou alias
- je vois l'image de l'exercice lors de la selection
- je peux lancer une seance depuis ce template
- je peux modifier reps/poids en live sans friction
- je recois une alerte quand le repos est termine
- je retrouve l'historique de mes seances

## 13. Prompt de generation (si utilise avec un agent code)
"Genere une application PWA de suivi de musculation en Node.js avec frontend React/Vite/TypeScript (mobile-first). Le MVP doit inclure: CRUD templates de routine, lancement de seance depuis template, suivi des series (reps/poids/rest), timer de repos avec notifications web, historique de seances, et un catalogue d'exercices avec image + alias pour recherche rapide. Contrainte forte: aucune base de donnees; stockage local dans le navigateur (IndexedDB) puis synchronisation de fichiers JSON sur Google Drive. Ajouter export CSV et dashboard stats (entrainements par semaine, progression de charge par exercice) comme fonctionnalites secondaires. Preparer une architecture evolutive pour futur module LLM et sync multi-appareils." 

## 14. Plan d'implementation detaille

### 14.1 Hypotheses de cadence
- equipe: 1 developpeur full-stack
- sprint: 1 semaine
- horizon MVP: 4 semaines

### 14.2 Phase 0 - Cadrage technique (2-3 jours)
Objectif: preparer une base solide avant de coder les features.

Livrables:
- architecture frontend local-first (sans base de donnees)
- schema JSON des entites (catalogue, templates, seances)
- conventions de code + structure dossiers
- definition des composants UI reutilisables

Taches:
- choisir la librairie IndexedDB (Dexie recommande)
- definir un DataAccessLayer unique (pas d'acces direct IndexedDB depuis les composants)
- definir format versionne des donnees exportables
- definir strategie cache images exercices

Definition of Done:
- application Vite demarre
- outillage qualite actif (lint + format + tests unitaires)
- premiers mocks de donnees charges depuis JSON

### 14.3 Phase 1 - Catalogue + Templates (Semaine 1)
Objectif: permettre de creer des routines viables rapidement.

Livrables:
- import catalogue d'exercices (JSON local)
- recherche exercice par nom principal + alias
- affichage image exercice dans le selecteur
- CRUD complet des templates

Taches:
- ecran catalogue/recherche reutilisable
- ecran liste templates
- ecran creation/edition template
- reordonnancement d'exercices dans un template

Tests cibles:
- recherche "presse" retourne "leg press"
- persistance template apres fermeture/reouverture app
- edition d'un template ne casse pas l'ordre des exercices

### 14.4 Phase 2 - Seance active (Semaine 2)
Objectif: coeur du produit en usage salle.

Livrables:
- demarrage seance depuis template (snapshot)
- ecran seance active mobile-first
- edition rapide reps/poids par serie
- navigation fluide exercice suivant/precedent

Taches:
- mecanisme snapshot template -> seance
- composants de saisie rapide (+0.5kg, +1 rep, dupliquer)
- etat de progression de la seance
- sauvegarde automatique apres chaque modification

Tests cibles:
- les changements seance ne modifient jamais le template source
- reprise d'une seance interrompue apres fermeture navigateur
- valeurs decimales de poids conservees sans perte

### 14.5 Phase 3 - Repos + Notifications + Historique (Semaine 3)
Objectif: finaliser la boucle complete d'entrainement.

Livrables:
- timer de repos par serie
- notifications de fin de repos
- fallback visuel/sonore in-app
- historique et detail des seances

Taches:
- composant timer robuste (pause/reprise/reset)
- gestion permission Notification API
- gestion des cas ou notifications bloquees
- ecrans historique + detail seance

Tests cibles:
- notification declenchee a la bonne seconde
- fallback visible si permission refusee
- historique coherent avec ordre exercices/series

### 14.6 Phase 4 - Fonctionnalites secondaires (Semaine 4)
Objectif: apporter de la valeur analytique.

Livrables:
- export CSV
- dashboard stats (frequence hebdo + progression charge)

Taches:
- generateur CSV cote client (Blob + download)
- agregations stats local-first
- graphiques progression par exercice/machine

Tests cibles:
- CSV ouvrable dans Excel/Google Sheets
- stats hebdo exactes sur jeu de donnees test

### 14.7 Phase 5 - Synchronisation Google Drive (Post-MVP)
Objectif: multi-appareils sans base de donnees centralisee.

Livrables:
- authentification Google OAuth
- push/pull JSON vers Drive
- strategie de resolution de conflits

Strategie recommandee:
- fichier principal versionne (app-data.json)
- merge base sur updatedAt + sourceDeviceId
- ecran de resolution manuelle en cas de conflit fort

### 14.8 Decoupage technique recommande (backlog de dev)
- Lot A: fondation app (routing, state, UI system)
- Lot B: stockage local (Dexie + repositories)
- Lot C: catalogue exercices (images + alias + recherche)
- Lot D: templates routines
- Lot E: seance active + timer repos
- Lot F: historique + stats + export CSV
- Lot G: sync Google Drive

### 14.9 Strategie de tests
- unitaires: logique metier (snapshot, calcul volume, recherche alias)
- integration: repositories IndexedDB
- end-to-end: parcours critique (creer template -> lancer seance -> valider series -> consulter historique)
- tests manuels mobile: Android Chrome + iOS Safari

### 14.10 Risques et mitigations
- risque: IndexedDB indisponible ou instable selon navigateur
	mitigation: fallback minimal localStorage pour preferences + message utilisateur
- risque: images catalogue lourdes hors ligne
	mitigation: compression WebP + lazy loading + cache strategique
- risque: notifications non fiables sur certains OS mobiles
	mitigation: timer visible permanent + alerte sonore in-app
- risque: conflits de sync Google Drive
	mitigation: versioning + journal de modifications + ecran de conflit

### 14.11 Jalons de validation produit
- Jalon 1: creation template complete avec recherche alias et image
- Jalon 2: seance complete realisable en salle sans friction
- Jalon 3: timer + notifications fiables
- Jalon 4: export CSV et stats operationnels
- Jalon 5: sync Drive beta