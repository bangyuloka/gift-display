
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

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

const username = process.env.TIKTOK_USERNAME || 'sibulepiarang';
TikTokConnector.connect(username)
  .then(() => console.log('✅ Connected to TikTok Live:', username))
  .catch((err) => console.error('❌ Failed to connect:', err.message));

server.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});
