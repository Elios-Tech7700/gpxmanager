# Changelog

## [Non publié]

### Changé — pivot planification (rupture)
- **Le vent affiché n'est plus celui du jour d'enregistrement du GPX, mais le vent actuel/prévu pour une sortie à venir.** Le fichier GPX ne sert plus qu'à fournir le tracé (géométrie + cadence relative) ; la date/heure réelle est choisie par l'utilisateur
- API météo : remplacement de l'API archive (`archive-api.open-meteo.com`, historique) par l'API prévisions (`api.open-meteo.com/v1/forecast`, couvre ~92 jours passés à 16 jours futurs)
- Nouveau `src/lib/schedule.ts` — `shiftActivityStart()` recale tous les timestamps des points sur une nouvelle date de départ choisie, en conservant la cadence/vitesse relative du tracé d'origine
- À l'import GPX, la sortie est automatiquement calée sur « maintenant » (`DropZone.tsx`)
- Sélecteur date/heure de départ (`<input type="datetime-local">`) toujours visible sous la carte, borné à [maintenant, +15 jours] ; bouton « Charger le vent » / « Recalculer » selon l'état
- Bouton « Inverser le sens du parcours » (icône flèches circulaires, en haut à droite) — `reverseActivity()` dans `gpx-parser.ts` : inverse l'ordre des points, recalcule bearing/vitesse/dénivelé pour le nouveau sens en conservant la cadence relative d'origine, réinitialise le vent (face/dos change avec le sens)

### Ajouté
- Bouton de bascule mode sombre / mode clair (CARTO Dark Matter ↔ CARTO Positron), préférence persistée en localStorage
- Couleur du casing du tracé adaptée au thème actif (blanc translucide en sombre, noir translucide en clair)
- Légende « tracé (vent non chargé) » sous le tracé indigo tant que le vent n'est pas chargé — la couleur seule n'était pas explicite (retour utilisateur : « c'est pas intuitif »)

### Corrigé
- Casing du tracé passé de noir à blanc translucide (`#ffffff`, opacité 0.25) — le noir sur le fond CARTO Dark Matter rendait le tracé illisible
- Marqueurs départ/arrivée dupliqués à chaque redessin du tracé (changement d'activité ou de thème) — nettoyage des marqueurs précédents avant recréation
- Trous dans le tracé coloré par vent (segments manquants, visibles comme du gris) — la source `route-wind` (~3600 mini-segments) était simplifiée par MapLibre au dézoom ; ajout de `tolerance: 0` sur la source pour désactiver la simplification
- Frise chronologique : le glissé du curseur ne mettait rien à jour en temps réel (seul un clic ponctuel fonctionnait, `onClick` uniquement) — remplacé par des Pointer Events (`onPointerDown`/`onPointerMove` + capture) pour un scrub continu

## [0.4.0] — Contrôles avancés

### Ajouté
- Sélecteur de vitesse de lecture : 1×, 2×, 5×, 10×
- Raccourcis clavier : Espace (play/pause), ←/→ (±5%), Home (début)
- Clic sur le tracé pour se déplacer dans la timeline (seek)
- Curseur crosshair au survol du tracé
- Correction du bug "rejouer repart de 0" — reprend depuis la position courante

## [0.3.0] — Améliorations UX

### Ajouté
- Carte sombre CARTO Dark Matter (cohérente avec le UI dark, tuiles fiables)
- Profil d'élévation en arrière-plan de la timeline (toujours visible)
- Légende couleurs vent dans le badge résumé (rouge/vert/ambre)
- Timecode central masqué quand progress=0 (évite le doublon 09:00)

### Corrigé
- Badge "vent ✓" repositionné dans la ligne stats (plus de chevauchement)

## [0.2.0] — Coloriage du tracé par vent

### Ajouté
- Tracé coloré par type de vent relatif : rouge = face, vert = dos, ambre = travers
- `buildWindSegments()` : découpe le tracé en segments GeoJSON avec propriété `windClass`
- Expression MapLibre `match` pour colorer chaque segment individuellement
- Bascule automatique violet → couleurs vent quand `windFetched` passe à `true`

## [0.1.0] — MVP initial

### Ajouté
- Import GPX par drag & drop (Strava / Komoot / Garmin, avec timestamps)
- Carte interactive MapLibre GL + OpenFreeMap (dark mode, tuiles libres)
- Tracé de route avec marqueur départ (vert) et arrivée (rouge)
- Données vent historiques via Open-Meteo Archive API (gratuit, sans clé)
- Calcul du vent relatif : face / dos / travers gauche / droite
- WindIndicator : compass rotatif, vitesse, classe, vitesse effective
- Badge résumé vent (% face / dos / travers, moy. km/h)
- Timeline avec scrubber click-to-seek + sparkline vent
- Lecture/pause avec animation RAF (50ms par seconde de sortie)
- Marqueur position actuelle sur la carte (suit la lecture)
- Persistance IndexedDB via `idb` (activités rechargées au redémarrage)
- Sidebar avec liste d'activités, stats (distance, durée, dénivelé), suppression
- Badge "Vent ✓" sur les activités enrichies
