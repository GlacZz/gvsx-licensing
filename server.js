// ===============================
//  GVSX Licensing Server (v1.4)
// ===============================
//  Bloqueia serial em uso indevido entre PCs
//  Logs aprimorados com nome, e-mail e status detalhado
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
  console.log('\x1b[32m✅ Conectado ao MongoDB Atlas\x1b[0m');
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
    console.warn(`\x1b[31m🚫 Consulta: Serial bloqueado → ${serialInput}\x1b[0m`);
    return res.json({ status: 'blocked', message: 'Serial bloqueado.' });
  }

  if (active) {
    console.log(`\x1b[33mℹ️ Consulta: Serial ativo → ${serialInput} | Cliente: ${active.name} <${active.email}>\x1b[0m`);
    return res.json({ status: 'active', message: 'Serial já ativado.', data: active });
  }

  if (pending) {
    console.log(`\x1b[36m🕓 Consulta: Serial pendente → ${serialInput}\x1b[0m`);
    return res.json({ status: 'pending', message: 'Serial disponível para ativação.' });
  }

  console.warn(`\x1b[31m❌ Consulta: Serial inválido → ${serialInput}\x1b[0m`);
  return res.status(404).json({ status: 'error', message: 'Serial inválido.' });
});

// ====== ATIVAÇÃO DE SERIAL ======
app.post('/api/activate', async (req, res) => {
  const { name, email, serial, hwid } = req.body;
  if (!name || !email || !serial || !hwid)
    return res.status(400).json({ status: 'error', message: 'Campos obrigatórios ausentes.' });

  const serialInput = serial.trim().toUpperCase();

  const blocked = await db.collection('serials_blocked').findOne({ serial: serialInput });
  if (blocked) {
    console.warn(`\x1b[31m🚫 BLOQUEADO: Tentativa de uso de serial bloqueado → ${serialInput} | Cliente: ${name} <${email}>\x1b[0m`);
    return res.json({ status: 'blocked', message: 'Este serial foi bloqueado por uso indevido.' });
  }

  const active = await db.collection('serials_active').findOne({ serial: serialInput });
  const pending = await db.collection('serials_pending').findOne({ serial: serialInput });

  // ✅ Primeira ativação (serial pendente)
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

    console.log(`\x1b[32m✅ NOVA ATIVAÇÃO → Serial: ${serialInput} | Cliente: ${name} <${email}> | HWID: ${hwid}\x1b[0m`);
    return res.json({ status: 'ok', message: 'Licença validada com sucesso.' });
  }

  // ⚠️ Ativo, mas HWID diferente → Bloqueia
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

    console.warn(`\x1b[31m🚫 BLOQUEIO AUTOMÁTICO → Serial: ${serialInput} | Cliente: ${name} <${email}> | HWID antigo: ${active.hwid} | Novo HWID: ${hwid}\x1b[0m`);

    return res.json({
      status: 'blocked',
      message: 'Este serial foi bloqueado automaticamente por uso em outro computador.'
    });
  }

  // ✅ Mesmo HWID → Reinstalação
  if (active && active.hwid === hwid) {
    console.log(`\x1b[34m🔁 REINSTALAÇÃO → Serial: ${serialInput} | Cliente: ${name} <${email}> | HWID: ${hwid}\x1b[0m`);
    return res.json({
      status: 'ok',
      message: 'Licença validada (reinstalação no mesmo PC).'
    });
  }

  // ❌ Serial inexistente
  console.warn(`\x1b[31m❌ ERRO → Serial inválido: ${serialInput} | Cliente: ${name} <${email}>\x1b[0m`);
  return res.status(404).json({
    status: 'error',
    message: 'Serial inválido.'
  });
});

// ====== INICIALIZAÇÃO ======
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await connectDB();
  console.log(`\x1b[35m🚀 Servidor GVSX Licensing rodando na porta ${PORT}\x1b[0m`);
});
