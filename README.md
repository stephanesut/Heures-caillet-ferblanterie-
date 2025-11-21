# Heures-caillet-ferblanterie-

Petit site pour enregistrer les heures de travail (chantier, date, temps) et exporter un récapitulatif mensuel en PDF.

Installation et démarrage

1. Installer les dépendances:

```bash
npm install
```

2. Démarrer le serveur:

```bash
npm start
```

3. Ouvrir dans le navigateur:

http://localhost:3000

Utilisation

- Ajouter une entrée: renseigner le nom du chantier, la date et le temps travaillé (heures).
- Choisir un mois et cliquer sur "Charger" pour afficher les entrées de ce mois.
- Cliquer sur "Exporter PDF" pour télécharger un récapitulatif du mois sélectionné.

Détails techniques

- Backend: `Express` + `sqlite3` (fichier `data.db` créé automatiquement).
- Export PDF: endpoint `/api/export?month=YYYY-MM` (utilise `pdfkit`).

Remarques

- Le fichier de base de données `data.db` sera créé à la racine du projet.
- Pour toute modification, redémarrer le serveur après édition.
