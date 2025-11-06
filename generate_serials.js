require('dotenv').config();
const { MongoClient } = require('mongodb');

function randomStr(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function genSerial() {
  return `${randomStr(6)}-${randomStr(8)}-${randomStr(7)}`;
}

(async () => {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db(process.env.DB_NAME || 'gvsxlicenses');
  const col = db.collection('serials');

  const serials = Array.from({ length: 50 }, () => ({
    serial: genSerial(),
    hwid: null,
    activatedAt: null,
    createdAt: new Date()
  }));

  await col.insertMany(serials);
  console.log('Gerados 50 seriais GVSX.');
  await client.close();
})();