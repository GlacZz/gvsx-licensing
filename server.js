// ===============================
//  GVSX Licensing Server (v1.3)
// ===============================
//  Bloqueia serial em uso indevido entre PCs
// ===============================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');

const app = express();

app.set('trust proxy', 1);
app.use(express.json());
app.use(helmet());

app.use(cors({
  origin: ['https://gvsxmod.com.br', 'http://localhost:3000'],
  optionsSuccessStatus: 200
}));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Muitas requisições. Tente novamente em 1 minuto.' }
});
app.use(limiter);

// ====== MONGODB CONNECTION ======
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'gvsxlicenses';
const client = new MongoClient(uri);

let db;
async function connectDB() {
  await client.connect();
  db = client.db(dbName);
  await db.collection('serials_pending').createIndex({ serial: 1 }, { unique: true });
  await db.collection('serials_active').createIndex({ serial: 1 }, { unique: true });
  await db.collection('serials_blocked').createIndex({ serial: 1 }, { unique: true });
  console.log('✅ Conectado ao MongoDB Atlas');
}

// ====== API STATUS ======
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor GVSX Licensing ativo.' });
});

// ====== CONSULTA SERIAL ======
app.get('/api/serial/:serial', async (req, res) => {
  const serialInput = req.params.serial.trim().toUpperCase();

  const active = await db.collection('serials_active').findOne({ serial: serialInput });
  const pending = await db.collection('serials_pending').findOne({ serial: serialInput });
  const blocked = await db.collection('serials_blocked').findOne({ serial: serialInput });

  if (blocked) {
    return res.json({ status: 'blocked', message: 'Serial bloqueado.' });
  }

  if (active) {
    return res.json({ status: 'active', message: 'Serial já ativado.', data: active });
  }

  if (pending) {
    return res.json({ status: 'pending', message: 'Serial disponível para ativação.' });
  }

  return res.status(404).json({ status: 'error', message: 'Serial inválido.' });
});

// ====== ATIVAÇÃO DE SERIAL ======
app.post('/api/activate', async (req, res) => {
  const { name, email, serial, hwid } = req.body;
  if (!name || !email || !serial || !hwid)
    return res.status(400).json({ status: 'error', message: 'Campos obrigatórios ausentes.' });

  const serialInput = serial.trim().toUpperCase();

  const blocked = await db.collection('serials_blocked').findOne({ serial: serialInput });
  if (blocked)
    return res.json({ status: 'blocked', message: 'Este serial foi bloqueado por uso indevido.' });

  const active = await db.collection('serials_active').findOne({ serial: serialInput });
  const pending = await db.collection('serials_pending').findOne({ serial: serialInput });

  // ✅ Caso o serial ainda esteja pendente — primeira ativação
  if (pending && !active) {
    await db.collection('serials_active').insertOne({
      serial: serialInput,
      name,
      email,
      hwid,
      activatedAt: new Date(),
      createdAt: pending.createdAt
    });
    await db.collection('serials_pending').deleteOne({ serial: serialInput });
    console.log(`✅ Serial ativado: ${serialInput} (${hwid})`);
    return res.json({ status: 'ok', message: 'Licença validada com sucesso.' });
  }

  // ⚠️ Se já estiver ativo e o HWID for diferente → BLOQUEIA
  if (active && active.hwid !== hwid) {
    await db.collection('serials_blocked').insertOne({
      serial: serialInput,
      blockedAt: new Date(),
      reason: 'HWID diferente detectado',
      previousHWID: active.hwid,
      attemptedHWID: hwid,
      name,
      email
    });

    await db.collection('serials_active').deleteOne({ serial: serialInput });
    console.warn(`🚫 Serial ${serialInput} bloqueado por tentativa em outro HWID!`);

    return res.json({
      status: 'blocked',
      message: 'Este serial foi bloqueado automaticamente por uso em outro computador.'
    });
  }

  // ✅ Se for o mesmo HWID, permite reinstalar normalmente
  if (active && active.hwid === hwid) {
    return res.json({
      status: 'ok',
      message: 'Licença validada (reinstalação no mesmo PC).'
    });
  }

  // ❌ Caso o serial não exista
  return res.status(404).json({
    status: 'error',
    message: 'Serial inválido.'
  });
});

// ====== INICIALIZAÇÃO ======
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await connectDB();
  console.log(`🚀 Servidor GVSX Licensing rodando na porta ${PORT}`);
});
