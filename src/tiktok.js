const { WebcastPushConnection } = require('tiktok-live-connector');
const { filterGift } = require('./anti-spam');

let tiktok = null;
let giftCallback = () => {};

function onGift(callback) {
  giftCallback = callback;
}

async function connect(username) {
  if (tiktok) {
    try {
      await tiktok.disconnect();
    } catch (_) {}
  }

  tiktok = new WebcastPushConnection(username);

  tiktok.on('gift', data => {
    console.log("🎁 Gift received:", JSON.stringify(data, null, 2));

    if (data.giftType === 1 && !data.repeatEnd) return;
    if (!filterGift(data)) return;

    giftCallback({
      uniqueId: data.uniqueId || 'unknown',
      nickname: data.nickname || 'anonymous',
      profilePictureUrl:
        data.profilePictureUrl ||
        (Array.isArray(data.userDetails?.profilePictureUrls)
          ? data.userDetails.profilePictureUrls.find(url => url.endsWith('.jpeg'))
          : ''),
      gift_id: data.gift?.gift_id || data.giftId || 0,
      giftName: data.giftName || data.gift?.name || 'Unknown',
      diamondCount: data.diamondCount || 1,
      repeat_count: data.repeatCount || 1,
      repeat_end: data.repeatEnd || false,
      timestamp: data.timestamp || Date.now()
    });
  });

  await tiktok.connect();
}

module.exports = { onGift, connect };
