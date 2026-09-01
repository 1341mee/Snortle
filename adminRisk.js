function getRiskLevel(freeCoins, planId, chatCount) {
  const coinLimit = { free: 50, plus: 100, pro: 500 };
  const planLimit = coinLimit[planId] ?? 50;
  const coinOverage = Number(freeCoins || 0) - planLimit;
  const suspiciousChatVolume = Number(chatCount || 0) > 10;

  if (coinOverage > 0 || suspiciousChatVolume) {
    return 'high';
  }

  if (Number(freeCoins || 0) > planLimit * 0.8) {
    return 'medium';
  }

  return 'low';
}

function summarizeUsers(users = []) {
  return users.map((user) => {
    const chats = Array.isArray(user.chats) ? user.chats : [];
    const riskLevel = getRiskLevel(user.freeSnortzCoins || 0, user.planId || 'free', chats.length);

    return {
      username: user.username,
      planId: user.planId || 'free',
      freeSnortzCoins: Number(user.freeSnortzCoins || 0),
      purchasedSnortzCoins: Number(user.purchasedSnortzCoins || 0),
      chatCount: chats.length,
      riskLevel,
      createdAt: user.createdAt || null,
      suspicious: riskLevel === 'high'
    };
  });
}

module.exports = {
  getRiskLevel,
  summarizeUsers
};
