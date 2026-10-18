const test = require('node:test');
const assert = require('node:assert/strict');
const { getBadges, getTotalMessagesSent, recordUserMessages } = require('../badgeProgress');

function badge(user, id) {
  return getBadges(user).find((entry) => entry.id === id);
}

test('counts newly saved user messages once, ignoring assistant messages', () => {
  const chat = { id: 'chat-1', messages: [] };
  const user = { chats: [chat] };
  const messages = [
    { role: 'user', content: 'First' },
    { role: 'assistant', content: 'Reply' },
    { role: 'user', content: 'Second' }
  ];

  recordUserMessages(user, chat, messages);
  recordUserMessages(user, chat, messages);

  assert.equal(user.totalMessagesSent, 2);
  assert.equal(getTotalMessagesSent(user), 2);
});

test('message badge progress survives deleting the chat', () => {
  const chat = { id: 'chat-1', messages: [] };
  const user = { chats: [chat] };
  const messages = Array.from({ length: 50 }, (_, index) => ({
    role: 'user',
    content: `Message ${index + 1}`
  }));

  recordUserMessages(user, chat, messages);
  chat.messages = messages;
  user.chats = [];

  assert.equal(user.totalMessagesSent, 50);
  assert.equal(badge(user, 'chatterbox').earned, true);
  assert.equal(badge(user, 'chatterbox').progress, '50 / 50');
});

test('existing users get a legacy count from messages still in their chats', () => {
  const user = {
    chats: [
      { messages: [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }] }
    ]
  };

  assert.equal(getTotalMessagesSent(user), 2);
});
