require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const TikTokConnector = require('./tiktok');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

let currentUsername = process.env.TIKTOK_USERNAME || null;

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
});

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  });
}

TikTokConnector.onGift((user) => {
  console.log('🎁 Gift from:', user);
  broadcast({ type: 'gift', user });
});

async function connectTikTok(username) {
  try {
    if (TikTokConnector.disconnect) await TikTokConnector.disconnect();
    await TikTokConnector.connect(username);
    console.log('✅ Connected to TikTok Live:', username);
    return true;
  } catch (err) {
    console.error('❌ Failed to connect:', err.message);
    return false;
  }
}

if (currentUsername) connectTikTok(currentUsername);

app.post('/set-username', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ message: 'Username tidak boleh kosong' });

  const success = await connectTikTok(username);
  if (success) {
    currentUsername = username;
    res.json({ message: `Terhubung ke TikTok: ${username}` });
  } else {
    res.status(500).json({ message: 'Gagal menghubungkan ke TikTok Live' });
  }
});

server.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});
