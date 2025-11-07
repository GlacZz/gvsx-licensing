// ===============================
//  GVSX Licensing Server (v1.3)
// ===============================
// by Vinícius Cajazeira
// Licenciamento seguro para instaladores GVSX
// ===============================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');

const app = express();

// ✅ Corrige uso de proxies reversos (Render, Vercel, etc)
app.set('trust proxy', 1);

// Middlewares essenciais
app.use(express.json());
app.use(helmet());

// ✅ CORS restrito ao seu domínio
app.use(cors({
  origin: [
    'https://gvsxmod.com.br',
    'http://localhost:3000'
  ],
  optionsSuccessStatus: 200
}));

// ✅ Limite de requisições — evita spam de ativação
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60, // 60 requisições por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Muitas requisições. Tente novamente em 1 minuto."
  }
});
app.use(limiter);

// Conexão com o MongoDB Atlas
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'gvsxlicenses';
const client = new MongoClient(uri);

let db;
async function connectDB() {
  try {
    await client.connect();
    db = client.db(dbName);

    // Cria índices únicos para evitar duplicações
    await db.collection('serials_pending').createIndex({ serial: 1 }, { unique: true });
    await db.collection('serials_active').createIndex({ serial: 1 }, { unique: true });

    console.log('✅ Conectado ao MongoDB Atlas');
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco:', err);
    process.exit(1);
  }
}

// ===============================
//  ROTAS
// ===============================

// Status básico do servidor
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor GVSX Licensing ativo.' });
});

// ===============================
//  Verificação de Serial (GET)
// ===============================
app.get('/api/serial/:serial', async (req, res) => {
  try {
    const serialInput = req.params.serial.trim().replace(/\s+/g, '').toUpperCase();

    const pendingSerial = await db.collection('serials_pending').findOne({
      serial: { $regex: `^${serialInput}$`, $options: 'i' }
    });

    const activeSerial = await db.collection('serials_active').findOne({
      serial: { $regex: `^${serialInput}$`, $options: 'i' }
    });

    if (activeSerial) {
      return res.json({
        status: "active",
        message: "Serial já ativado.",
        data: {
          hwid: activeSerial.hwid,
          name: activeSerial.name,
          email: activeSerial.email
        }
      });
    }

    if (pendingSerial) {
      return res.json({
        status: "pending",
        message: "Serial válido e disponível para ativação."
      });
    }

    return res.status(404).json({
      status: "error",
      message: "Serial inválido."
    });
  } catch (err) {
    console.error("❌ Erro na verificação:", err);
    res.status(500).json({
      status: "error",
      message: "Erro interno do servidor."
    });
  }
});

// ===============================
//  Ativação de Serial (POST)
// ===============================
app.post('/api/activate', async (req, res) => {
  try {
    const { name, email, serial, hwid } = req.body;

    console.log('=== Requisição recebida ===');
    console.log('Nome:', name);
    console.log('Email:', email);
    console.log('Serial:', serial);
    console.log('HWID:', hwid);
    console.log('===========================');

    if (!name || !email || !serial || !hwid) {
      return res.status(400).json({
        status: "error",
        message: "Campos obrigatórios ausentes."
      });
    }

    const serialInput = serial.trim().replace(/\s+/g, '').toUpperCase();

    const activeSerial = await db.collection('serials_active').findOne({
      serial: { $regex: `^${serialInput}$`, $options: 'i' }
    });

    // 🔹 Caso já esteja ativo
    if (activeSerial) {
      if (activeSerial.hwid === hwid) {
        console.log('Licença já vinculada a este computador.');
        return res.json({ status: "ok", message: "Licença já ativada nesta máquina." });
      } else {
        console.log('Tentativa de ativação em outro PC.');
        return res.json({ status: "error", message: "Licença já ativada em outro computador." });
      }
    }

    const pendingSerial = await db.collection('serials_pending').findOne({
      serial: { $regex: `^${serialInput}$`, $options: 'i' }
    });

    if (!pendingSerial) {
      console.log('❌ Serial não encontrado.');
      return res.status(404).json({
        status: "error",
        message: "Serial inválido."
      });
    }

    // ✅ Move o serial para a coleção de ativos
    await db.collection('serials_active').insertOne({
      serial: pendingSerial.serial,
      name,
      email,
      hwid,
      activatedAt: new Date(),
      createdAt: pendingSerial.createdAt || new Date()
    });

    await db.collection('serials_pending').deleteOne({ _id: pendingSerial._id });

    console.log(`✅ Serial ativado: ${serialInput} por ${name} (${email}) [${hwid}]`);

    res.json({
      status: "ok",
      message: "Licença validada e ativada com sucesso."
    });
  } catch (err) {
    console.error("❌ Erro ao ativar serial:", err);
    res.status(500).json({
      status: "error",
      message: "Erro interno do servidor."
    });
  }
});

// ===============================
//  Inicialização do Servidor
// ===============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await connectDB();
  console.log(`🚀 Servidor GVSX Licensing rodando na porta ${PORT}`);
});
