const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');
const PDFDocument = require('pdfkit');
const cors = require('cors');

const app = express();

// Configuration de la base de données
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set!');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.set('bypass-tunnel-reminder', 'true');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Initialisation des tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        chantier TEXT NOT NULL,
        date TEXT NOT NULL,
        hours REAL NOT NULL,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS chantiers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      )
    `);
    
    // Seed default users
    const defaultUsers = ['Luca', 'Stéphane', 'Joel', 'Frank', 'Admin'];
    for (const userName of defaultUsers) {
      await client.query(
        'INSERT INTO users (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [userName]
      );
    }
    
    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
}

initDatabase();

// Entries endpoints
app.post('/api/entries', async (req, res) => {
  const { chantier, chantierId, date, hours, userId } = req.body;
  if ((!chantier && !chantierId) || !date || hours == null || !userId) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    let chantierName = chantier;
    
    if (chantierId) {
      const result = await pool.query('SELECT name FROM chantiers WHERE id = $1', [chantierId]);
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'chantierId not found' });
      }
      chantierName = result.rows[0].name;
    }
    
    const result = await pool.query(
      'INSERT INTO entries (chantier, date, hours, user_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [chantierName, date, hours, userId]
    );
    
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/entries', async (req, res) => {
  const month = req.query.month;
  const userId = req.query.userId;
  
  try {
    let query = 'SELECT * FROM entries';
    const params = [];
    const conditions = [];
    
    if (month) {
      conditions.push(`date LIKE $${params.length + 1}`);
      params.push(month + '%');
    }
    
    if (userId) {
      conditions.push(`user_id = $${params.length + 1}`);
      params.push(userId);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY date ASC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/entries/:id', async (req, res) => {
  const id = req.params.id;
  const { chantier, date, hours, userId } = req.body;
  
  if (!chantier || !date || hours == null || !userId) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  
  try {
    const result = await pool.query(
      'UPDATE entries SET chantier = $1, date = $2, hours = $3, user_id = $4 WHERE id = $5',
      [chantier, date, hours, userId, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    const result = await pool.query('DELETE FROM entries WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chantiers endpoints
app.get('/api/chantiers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM chantiers ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chantiers', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  
  try {
    const result = await pool.query(
      'INSERT INTO chantiers (name) VALUES ($1) RETURNING id',
      [name]
    );
    res.json({ id: result.rows[0].id, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/chantiers/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    const result = await pool.query('DELETE FROM chantiers WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users endpoints
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users_with_counts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, COUNT(e.id) AS entries_count
      FROM users u
      LEFT JOIN entries e ON e.user_id = u.id
      GROUP BY u.id, u.name
      ORDER BY u.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  
  try {
    const result = await pool.query(
      'INSERT INTO users (name) VALUES ($1) RETURNING id',
      [name]
    );
    res.json({ id: result.rows[0].id, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    // Supprimer d'abord toutes les entrées de l'utilisateur
    await pool.query('DELETE FROM entries WHERE user_id = $1', [id]);
    
    // Puis supprimer l'utilisateur
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const id = req.params.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  
  try {
    const result = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2',
      [name, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    res.json({ updated: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export monthly recap as PDF
app.get('/api/export', async (req, res) => {
  const month = req.query.month;
  const userId = req.query.userId;
  if (!month) return res.status(400).send('month query param required (YYYY-MM)');
  
  try {
    let query = 'SELECT e.*, u.name as user_name FROM entries e LEFT JOIN users u ON e.user_id = u.id WHERE e.date LIKE $1';
    const params = [month + '%'];
    
    if (userId) {
      query += ' AND e.user_id = $2';
      params.push(userId);
    }
    
    query += ' ORDER BY e.date ASC';
    
    const result = await pool.query(query, params);
    
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-disposition', `attachment; filename=recap-${month}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    doc.fontSize(18).text(`Récapitulatif des heures - ${month}`, { align: 'center' });
    doc.moveDown();
    
    // Afficher le nom de l'utilisateur si filtré
    if (userId && result.rows.length > 0 && result.rows[0].user_name) {
      doc.fontSize(14).text(`Utilisateur: ${result.rows[0].user_name}`, { align: 'center' });
      doc.moveDown();
    }

    let total = 0;
    doc.fontSize(12);
    
    if (result.rows.length === 0) {
      doc.text('Aucune entrée pour ce mois.');
    } else {
      const weekdays = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      result.rows.forEach((r) => {
        const d = new Date(r.date + 'T00:00:00');
        let dateLabel = r.date;
        if (!isNaN(d)) {
          const day = String(d.getDate()).padStart(2, '0');
          const monthNum = String(d.getMonth() + 1).padStart(2, '0');
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
app.listen(port, host, () => console.log(`Server started on http://${host}:${port}`));
