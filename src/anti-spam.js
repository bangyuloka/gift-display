// anti-spam.js

const giftState = new Map();
const RESET_INTERVAL_MS = 2 * 60 * 1000; // 2 menit

function filterGift(gift) {
  const { uniqueId, diamondCount } = gift;
  if (!uniqueId || typeof diamondCount !== 'number') return false;

  const state = giftState.get(uniqueId) || { count: 0, lastCoin: 0 };
  state.count += 1;
  state.lastCoin = diamondCount;
  giftState.set(uniqueId, state);

  // Rule 1: gift < 5 coin → hanya pemberian pertama diterima
  if (diamondCount < 5) {
    return state.count === 1;
  }

  // Rule 2: gift >= 5 coin → pemberian 1 & 2 diterima, selanjutnya tolak
  if (diamondCount >= 5) {
    return state.count <= 2;
  }

  return false;
}

// Reset spam state setiap 2 menit
setInterval(() => {
  giftState.clear();
  console.log("♻️ Reset gift anti-spam state");
}, RESET_INTERVAL_MS);

module.exports = { filterGift };
