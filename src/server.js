const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { onGift, connect } = require('./tiktok');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const io = socketIo(server);

const ligaFile = path.join(__dirname, '../data/liga.json');
let currentUsername = null;
let matchAktif = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

onGift((giftData) => {
  broadcastWS({ type: 'gift', data: giftData });
});

function broadcastWS(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

app.post('/set-username', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ message: 'Username diperlukan' });
  currentUsername = username;
  connect(username);
  res.json({ message: `Terkoneksi dengan ${username}` });
});

wss.on('connection', ws => {
  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'showKlasemen') {
        broadcastWS({ type: 'showKlasemen' });
      }
    } catch (_) {}
  });
});

io.on('connection', (socket) => {
  if (matchAktif) {
    socket.emit('matchAktif', matchAktif);
  }
});

if (!fs.existsSync(ligaFile)) {
  fs.writeFileSync(ligaFile, JSON.stringify({ teams: [], matches: [] }, null, 2));
}

app.post('/liga/tim', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Nama tim diperlukan' });

  const liga = JSON.parse(fs.readFileSync(ligaFile));
  if (liga.teams.includes(name)) {
    return res.status(400).json({ message: 'Nama tim sudah ada' });
  }

  liga.teams.push(name);
  fs.writeFileSync(ligaFile, JSON.stringify(liga, null, 2));
  res.json({ message: 'Tim ditambahkan', teams: liga.teams });
});

app.get('/liga/tim', (_, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  res.json({ teams: liga.teams || [] });
});

app.post('/liga/jadwal', (req, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  const teams = liga.teams;
  if (!teams || teams.length < 2) {
    return res.status(400).json({ message: 'Minimal 2 tim diperlukan' });
  }

  const matches = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matches.push({ teamA: teams[i], teamB: teams[j] });
    }
  }

  liga.matches = matches;
  fs.writeFileSync(ligaFile, JSON.stringify(liga, null, 2));
  res.json({ message: 'Jadwal berhasil dibuat', matches });
});

app.get('/liga/jadwal', (_, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  res.json({ matches: liga.matches || [] });
});

app.post('/liga/reset', (_, res) => {
  const kosong = { teams: [], matches: [] };
  fs.writeFileSync(ligaFile, JSON.stringify(kosong, null, 2));
  matchAktif = null;
  res.json({ message: 'Daftar tim & jadwal direset' });
});

app.post('/liga/match-aktif', (req, res) => {
  const { index } = req.body;
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  if (!liga.matches || !liga.matches[index]) {
    return res.status(400).json({ message: 'Match tidak ditemukan' });
  }

  matchAktif = liga.matches[index];
  io.emit('matchAktif', matchAktif);
  res.json({ message: 'Match aktif diperbarui', matchAktif });
});

app.get('/liga/match-aktif', (_, res) => {
  res.json({ matchAktif });
});

app.post('/liga/update-skor', (req, res) => {
  const { scoreA, scoreB } = req.body;
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  const index = liga.matches?.findIndex(m => matchAktif && m.teamA === matchAktif.teamA && m.teamB === matchAktif.teamB);

  if (index === -1 || index === undefined) return res.status(404).json({ message: 'Match aktif tidak ditemukan' });

  liga.matches[index].scoreA = scoreA;
  liga.matches[index].scoreB = scoreB;
  matchAktif = liga.matches[index];

  fs.writeFileSync(ligaFile, JSON.stringify(liga, null, 2));
  io.emit('matchAktif', matchAktif);
  res.json({ message: 'Skor diperbarui', match: matchAktif });
});

app.post('/liga/selesai', (_, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  const index = liga.matches?.findIndex(m => matchAktif && m.teamA === matchAktif.teamA && m.teamB === matchAktif.teamB);
  if (index === -1 || index === undefined) return res.status(404).json({ message: 'Match tidak ditemukan' });

  liga.matches[index].done = true;
  matchAktif = null;

  fs.writeFileSync(ligaFile, JSON.stringify(liga, null, 2));
  io.emit('matchAktif', null);
  io.emit('updateKlasemen'); // ✅ PENTING: KODE INI HARUS ADA
  res.json({ message: 'Match ditandai selesai' });
});

app.get('/liga/klasemen', (_, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  const totalSkor = {};

  // Inisialisasi semua tim dengan skor 0
  (liga.teams || []).forEach(nama => {
    totalSkor[nama] = 0;
  });

  // Akumulasi skor dari match yang sudah selesai
  (liga.matches || []).forEach(match => {
    if (match.done) {
      totalSkor[match.teamA] += match.scoreA || 0;
      totalSkor[match.teamB] += match.scoreB || 0;
    }
  });

  // Ubah ke array dan urutkan
  const klasemen = Object.entries(totalSkor).map(([tim, totalSkor]) => ({
    tim, totalSkor
  })).sort((a, b) => b.totalSkor - a.totalSkor);

  res.json({ klasemen });
});



const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));