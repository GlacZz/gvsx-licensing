// server.js – GVSX Licensing atualizado (com nome e e-mail)
require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(helmet());
app.use(express.json());
app.use(cors({ origin: ['https://gvsxmod.com.br'] }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use(limiter);

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'gvsxlicenses';
const client = new MongoClient(uri);

let db;
client.connect().then(() => {
  db = client.db(dbName);
  db.collection('serials').createIndex({ serial: 1 }, { unique: true });
  console.log('✅ Conectado ao MongoDB Atlas');
});

// --- [ POST /api/activate ] ---
// Ativa o serial e salva nome, email e hwid
app.post('/api/activate', async (req, res) => {
  const { name, email, serial, hwid } = req.body;
  if (!serial || !hwid)
    return res.status(400).json({ status: 'error', message: 'Campos obrigatórios ausentes.' });

  try {
    const col = db.collection('serials');
    const doc = await col.findOne({ serial });

    if (!doc)
      return res.status(404).json({ status: 'error', message: 'Serial inválido.' });

    // Primeira ativação
    if (!doc.hwid) {
      await col.updateOne(
        { serial },
        {
          $set: {
            hwid,
            name: name || 'Desconhecido',
            email: email || 'não informado',
            activatedAt: new Date(),
          },
        }
      );
      return res.json({ status: 'ok', message: 'Ativado com sucesso.' });
    }

    // Já ativado neste PC
    if (doc.hwid === hwid) {
      return res.json({
        status: 'ok',
        message: 'Serial já ativado neste computador.',
      });
    }

    // Ativado em outro PC
    return res.status(403).json({
      status: 'error',
      message: 'Serial vinculado a outro computador.',
    });
  } catch (error) {
    console.error('Erro de ativação:', error);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// --- [ GET /api/serial/:serial ] ---
// Consulta serial com informações de cliente (sem dados sensíveis)
app.get('/api/serial/:serial', async (req, res) => {
  try {
    const serial = req.params.serial;
    const doc = await db
      .collection('serials')
      .findOne(
        { serial },
        {
          projection: {
            serial: 1,
            hwid: 1,
            name: 1,
            email: 1,
            activatedAt: 1,
            createdAt: 1,
          },
        }
      );

    if (!doc)
      return res.status(404).json({ status: 'error', message: 'Não encontrado.' });

    res.json({ status: 'ok', data: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Erro interno.' });
  }
});

// --- Inicia servidor ---
app.listen(process.env.PORT || 3000, () =>
  console.log('🚀 Servidor GVSX Licensing em execução')
);
