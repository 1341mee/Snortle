function countUserMessages(messages) {
  return Array.isArray(messages)
    ? messages.filter((message) => message && message.role === 'user').length
    : 0;
}

function getTotalMessagesSent(user) {
  const persistedTotal = Number(user.totalMessagesSent);
  if (Number.isFinite(persistedTotal) && persistedTotal >= 0) {
    return Math.floor(persistedTotal);
  }

  const chats = Array.isArray(user.chats) ? user.chats : [];
  return chats.reduce((total, chat) => total + countUserMessages(chat.messages), 0);
}

function recordUserMessages(user, chat, messages) {
  const totalBeforeSave = getTotalMessagesSent(user);
  user.totalMessagesSent = totalBeforeSave;
  const countedBeforeSave = Number(chat.countedUserMessages);
  const previousChatCount = Number.isFinite(countedBeforeSave) && countedBeforeSave >= 0
    ? Math.floor(countedBeforeSave)
    : countUserMessages(chat.messages);
  const currentChatCount = countUserMessages(messages);
  const newlySentMessages = Math.max(0, currentChatCount - previousChatCount);

  user.totalMessagesSent = totalBeforeSave + newlySentMessages;
  chat.countedUserMessages = Math.max(previousChatCount, currentChatCount);
  return user.totalMessagesSent;
}

function getBadges(user) {
  const chats = Array.isArray(user.chats) ? user.chats : [];
  const sent = getTotalMessagesSent(user);
  const giftsSent = Number(user.giftsSent || 0);
  const early = !user.createdAt || new Date(user.createdAt) < new Date('2027-01-01');

  return [
    { id: 'early', icon: '🌱', name: 'Early adopter', description: 'Joined Snortle before 2027.', earned: early },
    { id: 'first-chat', icon: '💬', name: 'First chat', description: 'Started your first chat.', earned: chats.length >= 1 },
    { id: 'chatterbox', icon: '🗣️', name: 'Chatterbox', description: 'Sent 50 messages.', earned: sent >= 50, progress: Math.min(sent, 50) + ' / 50' },
    { id: 'regular', icon: '🔥', name: 'Regular', description: 'Sent 250 messages.', earned: sent >= 250, progress: Math.min(sent, 250) + ' / 250' },
    { id: 'supporter', icon: '⭐', name: 'Supporter', description: 'Has a Plus or Pro plan.', earned: (user.planId || 'free') !== 'free' },
    { id: 'generous', icon: '🎁', name: 'Generous', description: 'Gifted coins to another person.', earned: giftsSent >= 1 }
  ];
}

module.exports = { getBadges, getTotalMessagesSent, recordUserMessages };
