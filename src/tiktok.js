const { WebcastPushConnection } = require('tiktok-live-connector');

let tiktok = null;
let giftCallback = () => {};

function onGift(callback) {
  giftCallback = callback;
}

async function connect(username) {
  if (tiktok) await disconnect();
  tiktok = new WebcastPushConnection(username);

  tiktok.on('gift', (data) => {
    if (data.giftType === 1 && !data.repeatEnd) return;
    giftCallback({
      name: data.nickname,
      avatar: data.profilePictureUrl,
      uniqueId: data.uniqueId || '',
      coin: data.diamondCount || 1
    });
  });

  await tiktok.connect();
}

async function disconnect() {
  if (tiktok) {
    await tiktok.disconnect();
    console.log('🔌 TikTok disconnected');
    tiktok = null;
  }
}

module.exports = { onGift, connect, disconnect };
