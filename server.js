const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const PDFDocument = require('pdfkit');
const cors = require('cors');

const app = express();
const dbFile = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbFile);

app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.set('bypass-tunnel-reminder', 'true');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chantier TEXT NOT NULL,
    date TEXT NOT NULL,
    hours REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS chantiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`);
  // Try to add user_id column to entries (ignore error if exists)
  db.run('ALTER TABLE entries ADD COLUMN user_id INTEGER', (err) => {});
  // Seed default users if they do not exist
  const defaultUsers = ['Luca','Stéphane','Joel','Frank','admin'];
  defaultUsers.forEach((n) => {
    db.run('INSERT OR IGNORE INTO users (name) VALUES (?)', [n]);
  });
});

app.post('/api/entries', (req, res) => {
  const { chantier, chantierId, date, hours, userId } = req.body;
  if ((!chantier && !chantierId) || !date || hours == null || !userId) return res.status(400).json({ error: 'Missing fields' });

  function insertWithName(name, uid) {
    const stmt = db.prepare('INSERT INTO entries (chantier, date, hours, user_id) VALUES (?, ?, ?, ?)');
    stmt.run(name, date, hours, uid, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
    stmt.finalize();
  }

  if (chantierId) {
    db.get('SELECT name FROM chantiers WHERE id = ?', [chantierId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(400).json({ error: 'chantierId not found' });
      insertWithName(row.name, userId);
    });
  } else {
    insertWithName(chantier, userId);
  }
});

// Chantiers endpoints
app.get('/api/chantiers', (req, res) => {
  db.all('SELECT * FROM chantiers ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/chantiers', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const stmt = db.prepare('INSERT INTO chantiers (name) VALUES (?)');
  stmt.run(name, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name });
  });
  stmt.finalize();
});

app.delete('/api/chantiers/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM chantiers WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  });
});

// Users endpoints
app.get('/api/users', (req, res) => {
  db.all('SELECT * FROM users ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// List users with count of entries for each user
app.get('/api/users_with_counts', (req, res) => {
  const q = `SELECT u.id, u.name, COUNT(e.id) AS entries_count
             FROM users u
             LEFT JOIN entries e ON e.user_id = u.id
             GROUP BY u.id, u.name
             ORDER BY u.name ASC`;
  db.all(q, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/users', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
  stmt.run(name, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name });
  });
  stmt.finalize();
});

app.delete('/api/users/:id', (req, res) => {
  const id = req.params.id;
  // Prevent deletion if user has entries
  db.get('SELECT COUNT(*) AS c FROM entries WHERE user_id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row && row.c > 0) return res.status(400).json({ error: 'User has entries and cannot be deleted' });
    db.run('DELETE FROM users WHERE id = ?', [id], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ deleted: true });
    });
  });
});

// Rename a user
app.put('/api/users/:id', (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  db.run('UPDATE users SET name = ? WHERE id = ?', [name, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ updated: true });
  });
});

// List entries, optionally filtered by month (YYYY-MM)
app.get('/api/entries', (req, res) => {
  const month = req.query.month; // YYYY-MM
  const userId = req.query.userId;
  const params = [];
  let where = '';
  if (month) {
    where += (where ? ' AND ' : ' WHERE ') + 'date LIKE ?';
    params.push(month + '%');
  }
  if (userId) {
    where += (where ? ' AND ' : ' WHERE ') + 'user_id = ?';
    params.push(userId);
  }
  const q = `SELECT * FROM entries ${where} ORDER BY date ASC`;
  db.all(q, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Update an entry
app.put('/api/entries/:id', (req, res) => {
  const id = req.params.id;
  const { chantier, date, hours, userId } = req.body;
  if (!chantier || !date || hours == null || !userId) return res.status(400).json({ error: 'Missing fields' });
  db.run('UPDATE entries SET chantier = ?, date = ?, hours = ?, user_id = ? WHERE id = ?', [chantier, date, hours, userId, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ updated: true });
  });
});

// Delete an entry
app.delete('/api/entries/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM entries WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  });
});

// Export monthly recap as PDF
app.get('/api/export', (req, res) => {
  const month = req.query.month; // YYYY-MM
  if (!month) return res.status(400).send('month query param required (YYYY-MM)');
  const like = month + '%';
  db.all('SELECT * FROM entries WHERE date LIKE ? ORDER BY date ASC', [like], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-disposition', `attachment; filename=recap-${month}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(18).text(`Récapitulatif des heures - ${month}`, { align: 'center' });
    doc.moveDown();

    let total = 0;
    doc.fontSize(12);
    if (rows.length === 0) {
      doc.text('Aucune entrée pour ce mois.');
    } else {
      const weekdays = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
      rows.forEach((r) => {
        const d = new Date(r.date + 'T00:00:00');
        let dateLabel = r.date;
        if (!isNaN(d)){
          const day = String(d.getDate()).padStart(2,'0');
          const monthNum = String(d.getMonth()+1).padStart(2,'0');
          const weekday = weekdays[d.getDay()];
          dateLabel = `${day}/${monthNum} (${weekday})`;
        }
        doc.text(`${dateLabel} — ${r.chantier} — ${r.hours} h`);
        total += parseFloat(r.hours);
      });
      doc.moveDown();
      doc.fontSize(14).text(`Total: ${total.toFixed(2)} h`);
    }

    doc.end();
  });
});

const port = process.env.PORT || 3000;
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
app.listen(port, host, () => console.log(`Server started on http://${host}:${port}`));
