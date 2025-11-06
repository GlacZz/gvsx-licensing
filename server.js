require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: ['https://www.gvsxmod.com.br'] }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'gvsxlicenses';
const client = new MongoClient(uri);

let db;
client.connect().then(() => {
  db = client.db(dbName);
  db.collection('serials').createIndex({ serial: 1 }, { unique: true });
  console.log('Conectado ao MongoDB');
});

app.post('/api/activate', async (req, res) => {
  const { name, email, serial, hwid } = req.body;
  if (!serial || !hwid)
    return res.status(400).json({ status: 'error', message: 'Campos obrigatórios ausentes.' });

  const col = db.collection('serials');
  const doc = await col.findOne({ serial });
  if (!doc) return res.status(404).json({ status: 'error', message: 'Serial inválido.' });

  if (!doc.hwid) {
    await col.updateOne({ serial }, { $set: { hwid, name, email, activatedAt: new Date() } });
    return res.json({ status: 'ok', message: 'Ativado com sucesso.' });
  }

  if (doc.hwid === hwid)
    return res.json({ status: 'ok', message: 'Serial já ativado neste computador.' });

  return res.status(403).json({ status: 'error', message: 'Serial vinculado a outro PC.' });
});

app.get('/api/serial/:serial', async (req, res) => {
  const doc = await db.collection('serials').findOne({ serial: req.params.serial });
  if (!doc) return res.status(404).json({ status: 'error', message: 'Não encontrado.' });
  res.json({ status: 'ok', data: doc });
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor GVSX ativo.'));