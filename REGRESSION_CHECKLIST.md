# Checklist visuelle anti-regression

Objectif: valider rapidement les zones UI les plus sensibles apres chaque build.

## Preparation

1. Lancer l'application en local.
2. Ouvrir une seance avec au moins 1 exercice contenant des sets.
3. Verifier en viewport desktop puis mobile.

## Viewports de reference

- Desktop: 1440 x 900
- Tablet: 768 x 1024
- Mobile: 390 x 844

## Controle prioritaire (P0)

1. Menu haut sur une seule ligne
- Le menu principal affiche 3 boutons alignes sur la meme ligne.
- Les libelles restent visibles et ne se superposent pas.
- Aucun retour a la ligne non souhaite sur desktop/tablet.

2. Chrono a cote de l'exercice
- Dans la vue Seance, le widget de repos est visible dans l'entete de l'exercice.
- Le widget affiche bien le label, la valeur en secondes et le hint.
- En declenchant une fin de set, la valeur evolue correctement pendant le decompte.

3. Menu Settings visible
- Le bouton settings ouvre un panneau lateral/overlay.
- Le bloc Theme est present.
- Le selecteur Theme actif est visible et interactif.
- Les chips de preview theme sont visibles et selectionnables.

## Controle secondaire (P1)

1. Top menu sticky
- Le menu haut reste sticky au scroll.
- Il ne chevauche pas de maniere bloquante les contenus interactifs.

2. Responsive session header
- En mobile, le bloc exercice + widget chrono reste lisible.
- Le widget chrono ne sort pas du conteneur.

3. Overlay settings en mobile
- Le panneau settings reste centré et scrollable.
- Le bouton Fermer est toujours accessible.

## Micro-scenarios de validation

1. Changement de theme
- Ouvrir Settings.
- Changer le theme via le select.
- Fermer puis reouvrir Settings.
- Verifier que le theme selectionne est conserve.

2. Chrono actif
- Valider un set avec repos > 0.
- Verifier l'etat visuel actif du widget chrono.
- Laisser finir le chrono et verifier le popup de fin de repos.

3. Navigation top menu
- Passer de Seance vers Templates puis Historique.
- Revenir sur Seance.
- Verifier que la barre reste sur une ligne et active l'onglet courant.

## Critere de sortie

- Aucun point P0 en echec.
- Au maximum 1 point P1 en echec (avec ticket cree immediatement).

## Log rapide recommande

Apres validation, noter dans le PR ou le changelog:
- Date
- Build/commit
- Device(s) testes
- Resultat P0/P1
- Eventuels ecarts observes
