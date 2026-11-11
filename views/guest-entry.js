export function initializeGuestEntry() {
    const overlay = document.getElementById('guest-auth-overlay');
    const authForm = document.getElementById('guest-auth-box');
    const authTitle = document.getElementById('guest-auth-title');
    const authSubtitle = document.getElementById('guest-auth-subtitle');
    const authSubmit = document.getElementById('guest-auth-submit');
    const authError = document.getElementById('guest-auth-error');
    const username = document.getElementById('guest-username');
    const password = document.getElementById('guest-password');
    const signupFields = document.getElementById('guest-signup-fields');
    const confirmPassword = document.getElementById('guest-confirm-password');
    const termsAgreement = document.getElementById('guest-terms-agreement');
    const botCheck = document.getElementById('guest-bot-check');
    const botCheckLabel = document.getElementById('guest-bot-check-label');
    const botCheckValue = document.getElementById('guest-bot-check-value');
    const guestCoins = document.getElementById('guest-coins');
    const transcript = document.getElementById('guest-chat-place');
    const welcome = document.getElementById('guest-chat-welcome');
    const spacer = document.getElementById('guest-spacer');
    const form = document.getElementById('guest-chat-form');
    const input = document.getElementById('guest-chat-input');
    const sendButton = document.getElementById('guest-send');
    const ended = document.getElementById('guest-ended');
    const endedCopy = document.getElementById('guest-ended-copy');
    const spentCoins = document.getElementById('guest-spent');
    const remainingCoinsLabel = document.getElementById('guest-remaining');
    const tokenLimitNote = document.getElementById('guest-token-note');
    const generationControls = document.getElementById('guest-generation-controls');
    const generationToggle = document.getElementById('guest-generation-toggle');
    const generationPanel = document.getElementById('guest-generation-panel');
    const generationBackdrop = document.getElementById('guest-generation-backdrop');
    const generationReset = document.getElementById('guest-generation-reset');
    const generationInputs = {
        randomness: document.getElementById('guest-randomness'),
        responseLength: document.getElementById('guest-length'),
        repetitionControl: document.getElementById('guest-repetition')
    };
    const generationOutputs = {
        randomness: document.getElementById('guest-randomness-value'),
        responseLength: document.getElementById('guest-length-value'),
        repetitionControl: document.getElementById('guest-repetition-value')
    };
    const generationCaptions = {
        randomness: document.getElementById('guest-randomness-technical'),
        responseLength: document.getElementById('guest-length-technical'),
        repetitionControl: document.getElementById('guest-repetition-technical')
    };
    const sidebar = document.getElementById('guest-sidebar');
    const chatShell = document.getElementById('guest-chat-shell');
    const sidebarToggle = document.getElementById('guest-sidebar-toggle');
    const MAX_CHARACTERS = 5000;
    const MAX_GUEST_TOKENS = 768;
    const GENERATION_SETTINGS_STORAGE_KEY = 'snortle-generation-settings';
    const { DEFAULT_PROFILE, LEVELS, normalizeProfile, toModelSettings } = window.GenerationProfiles;
    const countCharacters = window.countUserCharacters;

    let remainingCoins = 0;
    let ready = false;
    let busy = false;
    let exhausted = false;
    let authMode = 'login';
    let botCheckToken = '';
    let botCheckTarget = null;

    function readGenerationProfile() {
        const profile = Object.fromEntries(Object.entries(generationInputs).map(([key, control]) => [key, Number(control.value)]));
        profile.responseLength = Math.min(10, profile.responseLength);
        return profile;
    }

    function updateGenerationControls() {
        const profile = readGenerationProfile();
        const settings = toModelSettings(profile);
        const randomness = LEVELS.randomness[profile.randomness];
        const repetition = LEVELS.repetitionControl[profile.repetitionControl];
        Object.entries(profile).forEach(([key, value]) => {
            generationOutputs[key].textContent = `Level ${value}`;
        });
        generationCaptions.randomness.textContent = `Temperature ${randomness.temperature.toFixed(2)} · Top K ${randomness.top_k}`;
        generationCaptions.responseLength.textContent = `Up to ${Math.min(MAX_GUEST_TOKENS, settings.max_tokens)} tokens`;
        generationCaptions.repetitionControl.textContent = `Penalty ${repetition.repeat_penalty.toFixed(2)} · checks last ${repetition.repeat_window} tokens`;
    }

    function saveGenerationProfile() {
        try {
            localStorage.setItem(GENERATION_SETTINGS_STORAGE_KEY, JSON.stringify(readGenerationProfile()));
        } catch (error) {
            console.warn('Could not save generation settings.', error);
        }
    }

    function applyGenerationProfile(profile) {
        const normalized = normalizeProfile(profile);
        normalized.responseLength = Math.min(10, normalized.responseLength);
        Object.entries(generationInputs).forEach(([key, control]) => {
            control.value = String(normalized[key]);
        });
        updateGenerationControls();
    }

    function toggleGenerationControls(open = generationPanel.hidden) {
        generationPanel.hidden = !open;
        generationControls.classList.toggle('open', open);
        generationToggle.setAttribute('aria-expanded', String(open));
    }

    try {
        applyGenerationProfile(JSON.parse(localStorage.getItem(GENERATION_SETTINGS_STORAGE_KEY) || 'null') || { ...DEFAULT_PROFILE, responseLength: 8 });
    } catch (error) {
        applyGenerationProfile(DEFAULT_PROFILE);
    }
    generationToggle.addEventListener('click', () => toggleGenerationControls());
    generationBackdrop.addEventListener('click', () => toggleGenerationControls(false));
    generationReset.addEventListener('click', () => {
        applyGenerationProfile(DEFAULT_PROFILE);
        saveGenerationProfile();
    });
    Object.values(generationInputs).forEach((control) => control.addEventListener('input', () => {
        updateGenerationControls();
        saveGenerationProfile();
    }));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !generationPanel.hidden) toggleGenerationControls(false);
    });

    function updateControls() {
        const characterCount = countCharacters(input.value);
        const canType = ready && !busy && !exhausted;
        input.disabled = !canType;
        sendButton.disabled = !canType || characterCount > MAX_CHARACTERS || !input.value.trim();
    }

    function updateBalance(amount) {
        remainingCoins = Math.max(0, Number(amount) || 0);
        guestCoins.textContent = remainingCoins.toFixed(3);
        remainingCoinsLabel.textContent = remainingCoins.toFixed(3);
        spentCoins.textContent = Math.max(0, 3 - remainingCoins).toFixed(3);
        if (remainingCoins <= 0) endTryout();
    }

    function renderMarkdown(text) {
        const raw = window.marked.parse(text, { breaks: true, gfm: true });
        return window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    }

    function addCopyButtonsToCodeBlocks(container) {
        container.querySelectorAll('pre').forEach((pre) => {
            if (pre.parentElement.classList.contains('code-wrap')) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-wrap';
            wrapper.style.cssText = 'position:relative;';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'copy-code-btn';
            button.textContent = 'Copy';
            button.style.cssText = 'position:absolute;top:8px;right:8px;padding:4px 10px;font-size:11px;background:rgba(205,163,90,0.9);color:#181614;border:none;border-radius:4px;cursor:pointer;font-family:inherit;font-weight:700;z-index:2;';
            button.addEventListener('click', () => {
                const code = pre.querySelector('code');
                navigator.clipboard.writeText((code ? code.textContent : pre.textContent).trim()).then(() => {
                    button.textContent = 'Copied!';
                    setTimeout(() => { button.textContent = 'Copy'; }, 1500);
                });
            });
            wrapper.appendChild(button);
        });
    }

    function endTryout(message) {
        exhausted = true;
        busy = false;
        input.disabled = true;
        sendButton.disabled = true;
        endedCopy.textContent = message || 'Your guest tryout is used up. Create an account or log in to keep chatting.';
        ended.classList.add('visible');
    }

    function appendMessage(content, role, extraClass = '') {
        if (role === 'user') {
            const box = document.createElement('div');
            box.className = 'user-box';
            const message = document.createElement('div');
            message.className = 'user';
            message.textContent = content;
            box.appendChild(message);
            transcript.insertBefore(box, spacer);
            transcript.scrollTop = transcript.scrollHeight;
            return message;
        }

        const box = document.createElement('div');
        box.className = 'bot-box';
        const avatar = document.createElement('img');
        avatar.className = 'guest-bot-avatar';
        avatar.src = '/views/images/snortle.png';
        avatar.alt = '';
        const bot = document.createElement('div');
        bot.className = 'bot';
        const message = document.createElement('div');
        message.className = `bot-reply guest-bot-message${extraClass ? ` ${extraClass}` : ''}`;
        message.textContent = content;
        bot.appendChild(message);
        box.append(avatar, bot);
        transcript.insertBefore(box, spacer);
        transcript.scrollTop = transcript.scrollHeight;
        return message;
    }

    async function initializeTryout() {
        try {
            const response = await fetch('/api/tryout/session', { credentials: 'same-origin' });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Tryout is temporarily unavailable.');
            updateBalance(result.remainingCoins);
            ready = true;
            if (result.exhausted) {
                endTryout();
                return;
            }
            updateControls();
        } catch (error) {
            guestCoins.textContent = 'Unavailable';
            welcome.querySelector('p').textContent = error.message;
        }
    }

    async function sendMessage(prompt) {
        busy = true;
        welcome.hidden = true;
        appendMessage(prompt, 'user');
        const assistantMessage = appendMessage('Snortle is thinking', 'assistant', 'loading');
        updateControls();

        try {
            const response = await fetch('/api/tryout/generate', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, generationProfile: readGenerationProfile() })
            });
            if (!response.ok) {
                const error = await response.json();
                throw Object.assign(new Error(error.message || 'Tryout failed.'), { exhausted: !!error.exhausted });
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let pending = '';
            const handleEvent = (block) => {
                let eventName = 'message';
                const dataLines = [];
                block.split('\n').forEach((line) => {
                    if (line.startsWith('event:')) eventName = line.slice(6).trim();
                    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
                });
                if (!dataLines.length) return;
                const data = JSON.parse(dataLines.join('\n'));
                if (eventName === 'update' || eventName === 'complete') {
                    assistantMessage.classList.remove('loading');
                    assistantMessage.innerHTML = renderMarkdown(data.output || '');
                    addCopyButtonsToCodeBlocks(assistantMessage);
                    updateBalance(data.remainingCoins);
                    if (data.tokenLimitReached) tokenLimitNote.hidden = false;
                } else if (eventName === 'error') {
                    assistantMessage.classList.remove('loading');
                    assistantMessage.classList.add('error');
                    assistantMessage.textContent = data.message;
                    if (data.exhausted) endTryout(data.message);
                }
                transcript.scrollTop = transcript.scrollHeight;
            };

            while (true) {
                const { value, done } = await reader.read();
                pending += decoder.decode(value || new Uint8Array(), { stream: !done });
                const blocks = pending.split('\n\n');
                pending = blocks.pop() || '';
                blocks.forEach(handleEvent);
                if (done) break;
            }
            if (pending.trim()) handleEvent(pending);
        } catch (error) {
            assistantMessage.classList.remove('loading');
            assistantMessage.classList.add('error');
            assistantMessage.textContent = error.message;
            if (error.exhausted) endTryout(error.message);
        } finally {
            busy = false;
            if (remainingCoins <= 0) endTryout();
            updateControls();
            if (!exhausted) input.focus();
        }
    }

    function setAuthMode(mode) {
        authMode = mode;
        const signingUp = mode === 'signup';
        authTitle.textContent = signingUp ? 'Create your account' : 'Welcome back';
        authSubtitle.textContent = signingUp ? 'Join Snortle AI and keep your conversations.' : 'Log in to keep your conversations.';
        authSubmit.textContent = signingUp ? 'Create account' : 'Log in';
        signupFields.hidden = !signingUp;
        confirmPassword.required = signingUp;
        termsAgreement.required = signingUp;
        botCheck.required = signingUp;
        authError.textContent = '';
        authForm.reset();
    }

    async function openAuth(mode) {
        setAuthMode(mode);
        overlay.classList.add('visible');
        overlay.setAttribute('aria-hidden', 'false');
        username.focus();
        if (mode !== 'signup') return;
        try {
            const response = await fetch('/api/bot-check');
            if (!response.ok) throw new Error('Could not load the bot check. Please try again.');
            const challenge = await response.json();
            botCheckToken = challenge.token;
            botCheckTarget = Number(challenge.answer);
            botCheck.min = challenge.min;
            botCheck.max = challenge.max;
            botCheck.value = challenge.min;
            botCheckValue.textContent = challenge.min;
            botCheckLabel.textContent = `Bot check: slide to ${botCheckTarget}`;
        } catch (error) {
            authError.textContent = error.message;
        }
    }

    function closeAuth() {
        overlay.classList.remove('visible');
        overlay.setAttribute('aria-hidden', 'true');
        authForm.reset();
        authError.textContent = '';
    }

    document.querySelectorAll('#guest-home [data-mode]').forEach((button) => {
        button.addEventListener('click', () => openAuth(button.dataset.mode));
    });
    sidebarToggle.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        chatShell.classList.toggle('collapsed', collapsed);
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        sidebarToggle.textContent = collapsed ? '›' : '‹';
        sidebarToggle.classList.toggle('is-open', !collapsed);
    });
    document.getElementById('guest-auth-close').addEventListener('click', closeAuth);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeAuth();
    });
    botCheck.addEventListener('input', () => {
        botCheckValue.textContent = botCheck.value;
    });

    authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const enteredUsername = username.value.trim();
        const enteredPassword = password.value;
        const signingUp = authMode === 'signup';
        if (!enteredUsername || !enteredPassword) return;
        if (signingUp) {
            const passwordError = window.PasswordRules.getPasswordError(enteredPassword, enteredUsername);
            if (passwordError) {
                authError.textContent = passwordError;
                return;
            }
            if (enteredPassword !== confirmPassword.value) {
                authError.textContent = 'Passwords do not match.';
                return;
            }
            if (!termsAgreement.checked) {
                authError.textContent = 'You must agree to the Terms of Service to create an account.';
                return;
            }
            if (botCheckTarget === null || Number(botCheck.value) !== botCheckTarget) {
                authError.textContent = `Please slide the bot check to ${botCheckTarget ?? 'the requested number'}.`;
                return;
            }
        }

        authSubmit.disabled = true;
        authSubmit.textContent = signingUp ? 'Creating...' : 'Logging in...';
        authError.textContent = '';
        try {
            const response = await fetch(signingUp ? '/api/signup' : '/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: enteredUsername,
                    password: enteredPassword,
                    acceptedTerms: signingUp ? termsAgreement.checked : undefined,
                    botCheckAnswer: signingUp ? Number(botCheck.value) : undefined,
                    botCheckToken: signingUp ? botCheckToken : undefined
                })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Request failed.');
            window.location.replace('/chat');
        } catch (error) {
            authError.textContent = error.message || 'Something went wrong.';
        } finally {
            authSubmit.disabled = false;
            authSubmit.textContent = authMode === 'signup' ? 'Create account' : 'Log in';
        }
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const prompt = input.value.trim();
        if (!prompt || !ready || busy || exhausted) return;
        if (countCharacters(prompt) > MAX_CHARACTERS) return;
        input.value = '';
        updateControls();
        sendMessage(prompt);
    });
    input.addEventListener('input', updateControls);
    input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        if (!event.repeat && !sendButton.disabled) form.requestSubmit();
    });

    initializeTryout();
}