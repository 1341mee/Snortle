const MIN_PASSWORD_LENGTH = 7;
const DISALLOWED_PASSWORD_WORDS = ['password', 'pasword'];

function getPasswordError(password, username = '') {
  if (typeof password !== 'string') {
    return 'Password must be at least 7 characters.';
  }

  const normalizedPassword = password.toLowerCase();
  const passwordCharacters = Array.from(normalizedPassword);
  const normalizedUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';

  if (passwordCharacters.length < MIN_PASSWORD_LENGTH) {
    return 'Password must be at least 7 characters.';
  }

  if (passwordCharacters.every((character) => character === passwordCharacters[0])) {
    return 'Password cannot be made from one repeated character.';
  }

  const firstCharacterCode = passwordCharacters[0].codePointAt(0);
  const step = passwordCharacters.length > 1
    ? passwordCharacters[1].codePointAt(0) - firstCharacterCode
    : 0;
  if ((step === 1 || step === -1) && passwordCharacters.every((character, index) => (
    index === 0 || character.codePointAt(0) - passwordCharacters[index - 1].codePointAt(0) === step
  ))) {
    return 'Password cannot be a counting-up or counting-down sequence.';
  }

  if (DISALLOWED_PASSWORD_WORDS.some((word) => normalizedPassword.includes(word))) {
    return 'Password cannot contain "password" or "pasword".';
  }

  if (normalizedUsername && normalizedPassword === normalizedUsername) {
    return 'Password cannot be the same as your username.';
  }

  return null;
}

const passwordRules = { MIN_PASSWORD_LENGTH, getPasswordError };

if (typeof module === 'object' && module.exports) {
  module.exports = passwordRules;
}

if (typeof window !== 'undefined') {
  window.PasswordRules = passwordRules;
}
