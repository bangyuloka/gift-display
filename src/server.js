// server.js
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

// Path ke file liga.json untuk menyimpan data tim dan pertandingan
const ligaFile = path.join(__dirname, '../data/liga.json');
let currentUsername = null;
let matchAktif = null;

// Middleware untuk parsing JSON dan menyajikan file statis
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Handle event gift dari TikTok, dan broadcast ke semua klien via WebSocket
onGift((giftData) => {
  broadcastWS({ type: 'gift', data: giftData });
});

// Fungsi untuk mengirim pesan WebSocket ke semua klien
function broadcastWS(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

// Endpoint untuk menyimpan username TikTok dan mulai koneksi ke TikTok
app.post('/set-username', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ message: 'Username diperlukan' });
  currentUsername = username;
  connect(username);
  res.json({ message: `Terkoneksi dengan ${username}` });
});

// menampilkan menyembunyikan klasemen
io.on('connection', (socket) => {
  socket.on('showKlasemen', () => {
    io.emit('showKlasemen');
  });
  socket.on('hideKlasemen', () => {
    io.emit('hideKlasemen');
  });
});

// Saat klien socket.io terhubung, kirimkan match aktif jika ada
io.on('connection', (socket) => {
  if (matchAktif) {
    socket.emit('matchAktif', matchAktif);
  }
});

// Buat file liga.json jika belum ada
if (!fs.existsSync(ligaFile)) {
  fs.writeFileSync(ligaFile, JSON.stringify({ teams: [], matches: [] }, null, 2));
}

// Tambah tim baru ke dalam liga
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

// Ambil daftar tim
app.get('/liga/tim', (_, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  res.json({ teams: liga.teams || [] });
});

// Buat jadwal pertandingan dengan jeda antar tim
app.post('/liga/jadwal', (req, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  const teams = liga.teams;
  if (!teams || teams.length < 2) {
    return res.status(400).json({ message: 'Minimal 2 tim diperlukan' });
  }

  // Buat semua kombinasi match unik (round-robin)
  const allMatches = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      allMatches.push({ teamA: teams[i], teamB: teams[j] });
    }
  }

  const jadwal = [];
  const recentlyPlayed = new Set();

  while (allMatches.length > 0) {
    let found = false;
    for (let i = 0; i < allMatches.length; i++) {
      const match = allMatches[i];
      if (!recentlyPlayed.has(match.teamA) && !recentlyPlayed.has(match.teamB)) {
        jadwal.push(match);
        recentlyPlayed.clear();
        recentlyPlayed.add(match.teamA);
        recentlyPlayed.add(match.teamB);
        allMatches.splice(i, 1);
        found = true;
        break;
      }
    }
    if (!found) {
      recentlyPlayed.clear();
    }
  }

  liga.matches = jadwal;
  fs.writeFileSync(ligaFile, JSON.stringify(liga, null, 2));
  io.emit('updateKlasemen'); // ✅ Emit update ke klasemen setelah jadwal dibuat
  res.json({ message: 'Jadwal dengan jeda berhasil dibuat', matches: jadwal });
});

// Ambil semua jadwal match
app.get('/liga/jadwal', (_, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  res.json({ matches: liga.matches || [] });
});

// Reset semua tim dan jadwal
app.post('/liga/reset', (_, res) => {
  const kosong = { teams: [], matches: [] };
  fs.writeFileSync(ligaFile, JSON.stringify(kosong, null, 2));
  matchAktif = null;
  res.json({ message: 'Daftar tim & jadwal direset' });
  io.emit('updateKlasemen'); // Pemicu update klasemen di klien
});

// Atur pertandingan aktif (dipilih oleh admin)
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

// Ambil pertandingan yang sedang aktif
app.get('/liga/match-aktif', (_, res) => {
  res.json({ matchAktif });
});

// Update skor pertandingan aktif
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

// Tandai pertandingan aktif sebagai selesai dan update klasemen
app.post('/liga/selesai', (_, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  const index = liga.matches?.findIndex(m => matchAktif && m.teamA === matchAktif.teamA && m.teamB === matchAktif.teamB);
  if (index === -1 || index === undefined) return res.status(404).json({ message: 'Match tidak ditemukan' });

  liga.matches[index].done = true;
  matchAktif = null;

  fs.writeFileSync(ligaFile, JSON.stringify(liga, null, 2));
  io.emit('matchAktif', null);
  io.emit('updateKlasemen'); // Pemicu update klasemen di klien
  res.json({ message: 'Match ditandai selesai' });
});

// Hitung dan ambil klasemen (akumulasi skor dari match yang selesai)
app.get('/liga/klasemen', (_, res) => {
  const liga = JSON.parse(fs.readFileSync(ligaFile));
  const totalSkor = {};

  // Inisialisasi semua tim dengan skor 0
  (liga.teams || []).forEach(nama => {
    totalSkor[nama] = 0;
  });

  // Tambahkan skor dari pertandingan yang sudah selesai
  (liga.matches || []).forEach(match => {
    if (match.done) {
      totalSkor[match.teamA] += match.scoreA || 0;
      totalSkor[match.teamB] += match.scoreB || 0;
    }
  });

  // Ubah ke array dan urutkan dari skor tertinggi
  const klasemen = Object.entries(totalSkor).map(([tim, totalSkor]) => ({
    tim, totalSkor
  })).sort((a, b) => b.totalSkor - a.totalSkor);

  res.json({ klasemen });
});

// Jalankan server di port 3000
const PORT = 3000;
server.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
