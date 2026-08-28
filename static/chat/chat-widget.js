/**
 * Emirald AI Chat Support Widget
 * Powered by Free LLM Rotator (port 8082)
 * 24/7 AI Customer Specialist
 */
class EmiraldChatWidget {
    constructor(options = {}) {
        this.apiEndpoint = options.apiEndpoint || '/api/chat';
        // Use deployed HF Space rotator when available, fallback to local
        // Default to HF Space rotator for public site, local for development
        const defaultRotatorUrl = (typeof HF_ROTATOR_URL !== 'undefined' && HF_ROTATOR_URL)
            ? HF_ROTATOR_URL
            : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? 'http://127.0.0.1:8082'
                : 'https://mknight2690-sys-emirald-rotator.hf.space');
        this.rotatorUrl = options.rotatorUrl || defaultRotatorUrl;
        this.isOpen = false;
        this.messages = [];
        this.sessionId = this.generateSessionId();
        this.userInfo = options.userInfo || {};
        this.isTyping = false;

        // System prompt for the AI support specialist
        this.systemPrompt = `You are Emirald AI Support Specialist, a 24/7 customer support agent for Emirald - an AI-powered automated crypto trading bot for BloFin.

YOUR PERSONALITY:
- Warm, personable, and courteous
- Deeply knowledgeable about Emirald's codebase, architecture, and features
- Patient with beginners, technical with advanced users
- Available 24/7, never rushed
- Speak naturally, use emojis appropriately
- Always offer to help further

YOUR EXPERTISE:
- Emirald Electron app (main.js, preload.js, renderer tabs)
- Free Claude Router (LLM rotator on port 8082)
- Emirald Dashboard (FastAPI on port 8766)
- Emirald Trading Bot (Python, 60-second LLM decisions, BloFin USDT-M Futures)
- Stripe billing, subscriptions, webhooks
- BloFin API integration (HMAC-SHA256, 10x leverage, 3% SL, 25% TP)
- GitHub Pages deployment, Electron builder, NSIS installers
- Common issues: installation, API keys, credential testing, bot startup, dashboard access

YOUR APPROACH:
1. Greet warmly, ask how you can help
2. Diagnose issues systematically
3. Provide step-by-step solutions
4. Share relevant code snippets when helpful
5. Always end with "Is there anything else I can help you with?"
6. If you don't know something, be honest and offer to escalate

COMMON TROUBLESHOOTING TOPICS:
- Installation errors (NSIS, antivirus, SmartScreen)
- Electron app won't start (electron-updater, electron-log missing)
- Rotator not starting (Python path, port 8082 conflicts)
- Dashboard not loading (port 8766, uvicorn, config.yaml)
- BloFin API credential errors (HMAC signature, passphrase, broker ID)
- Stripe checkout/webhook issues
- GitHub Pages deployment
- Credential testing failures

Keep responses concise but complete. Use formatting for readability.`;

        this.init();
    }

    generateSessionId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    init() {
        this.createWidget();
        this.bindEvents();
        this.loadHistory();
    }

    createWidget() {
        // Chat button (floating)
        this.chatButton = document.createElement('button');
        this.chatButton.id = 'emirald-chat-button';
        this.chatButton.className = 'chat-button';
        this.chatButton.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="chat-badge">1</span>
        `;
        this.chatButton.setAttribute('aria-label', 'Open Emirald Support Chat');

        // Chat panel
        this.chatPanel = document.createElement('div');
        this.chatPanel.id = 'emirald-chat-panel';
        this.chatPanel.className = 'chat-panel hidden';
        this.chatPanel.innerHTML = `
            <div class="chat-header">
                <div class="chat-header-info">
                    <div class="chat-avatar">
                        <svg width="32" height="32" viewBox="0 0 512 512" fill="none">
                            <rect width="512" height="512" rx="90" fill="url(#grad)"/>
                            <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0d8a6f"/><stop offset="100%" stop-color="#0a7b8c"/></linearGradient></defs>
                            <path d="M256 48c-12 0-24 6-30 16-6 10-6 22 0 32 6 10 18 16 30 16s24-6 30-16c6-10 6-22 0-32-6-10-18-16-30-16z" fill="#38c9a7"/>
                            <circle cx="256" cy="256" r="120" fill="none" stroke="#28e0c0" stroke-width="8"/>
                        </svg>
                    </div>
                    <div class="chat-title">
                        <h3>Emirald Support</h3>
                        <span class="chat-status">AI Specialist • Online 24/7</span>
                    </div>
                </div>
                <button class="chat-close" aria-label="Close chat">&times;</button>
            </div>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-typing hidden" id="chat-typing">
                <span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>
                <span>AI Specialist is typing...</span>
            </div>
            <div class="chat-input-area">
                <form id="chat-form">
                    <input type="text" id="chat-input" placeholder="Type your message..." autocomplete="off" aria-label="Message">
                    <button type="submit" id="chat-send" aria-label="Send message">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </button>
                </form>
                <div class="chat-hint">Press Enter to send • Shift+Enter for new line</div>
            </div>
        `;

        document.body.appendChild(this.chatButton);
        document.body.appendChild(this.chatPanel);

        // Add welcome message after a brief delay
        setTimeout(() => this.addWelcomeMessage(), 500);
    }

    addWelcomeMessage() {
        const welcomeMsg = `Hello! 👋 I'm your Emirald AI Support Specialist, available 24/7 to help you with anything you need.

Whether you're:
• **Installing** the Emirald app and hitting errors
• **Setting up** BloFin API keys and credential testing
• **Starting** the bot, rotator, or dashboard
• **Troubleshooting** Stripe billing, webhooks, or deployment
• Just **curious** about features, architecture, or best practices

I'm here to help! I know the codebase inside and out — from the Electron main process to the BloFin HMAC signing, from the free LLM rotator to the 60-second trading loop.

**What can I help you with today?**`;

        this.addMessage('assistant', welcomeMsg);
    }

    bindEvents() {
        // Toggle chat
        this.chatButton.addEventListener('click', () => this.toggleChat());
        this.chatPanel.querySelector('.chat-close').addEventListener('click', () => this.closeChat());

        // Form submission
        const form = this.chatPanel.querySelector('#chat-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendMessage();
        });

        // Input handling
        const input = this.chatPanel.querySelector('#chat-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeChat();
            }
        });

        // Click outside to close (optional)
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.chatPanel.contains(e.target) && !this.chatButton.contains(e.target)) {
                // Optional: close on outside click
            }
        });
    }

    toggleChat() {
        if (this.isOpen) {
            this.closeChat();
        } else {
            this.openChat();
        }
    }

    openChat() {
        this.isOpen = true;
        this.chatPanel.classList.remove('hidden');
        this.chatButton.classList.add('active');
        this.chatButton.querySelector('.chat-badge').style.display = 'none';
        this.chatPanel.querySelector('#chat-input').focus();
        this.scrollToBottom();
    }

    closeChat() {
        this.isOpen = false;
        this.chatPanel.classList.add('hidden');
        this.chatButton.classList.remove('active');
    }

    async sendMessage() {
        const input = this.chatPanel.querySelector('#chat-input');
        const text = input.value.trim();
        if (!text || this.isTyping) return;

        // Add user message
        this.addMessage('user', text);
        input.value = '';

        // Show typing indicator with auto-hide timeout
        this.showTyping(true);
        const typingTimeout = setTimeout(() => {
            if (this.isTyping) {
                console.warn('Typing indicator timed out, hiding');
                this.showTyping(false);
            }
        }, 30000); // 30 second max

        try {
            const response = await this.callAI(text);
            clearTimeout(typingTimeout);
            this.showTyping(false);
            this.addMessage('assistant', response);
        } catch (error) {
            clearTimeout(typingTimeout);
            this.showTyping(false);
            this.addMessage('assistant', `I apologize — I'm having trouble connecting right now. Let me try a different approach.

**Quick troubleshooting:**
• Make sure the Emirald app is running (rotator on port 8082)
• Check if the free LLM rotator is started in the Setup tab
• Try refreshing the page

Is there something specific you'd like help with while I reconnect?`);
            console.error('Chat error:', error);
        }
    }

    async callAI(userMessage) {
        // Build conversation history for context
        const history = this.messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        }));

        const payload = {
            messages: [
                { role: 'system', content: this.systemPrompt },
                ...history,
                { role: 'user', content: userMessage }
            ],
            session_id: this.sessionId,
            user_info: this.userInfo,
            temperature: 0.7,
            max_tokens: 1500
        };

        // Connection retry logic with exponential backoff
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second

        // Try rotator first with retries
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

                const response = await fetch(`${this.rotatorUrl}/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    return data.choices[0]?.message?.content || 'I\'m ready to help! What can I assist you with?';
                } else {
                    console.warn(`Rotator returned ${response.status}, attempt ${attempt + 1}/${maxRetries}`);
                }
            } catch (e) {
                if (e.name === 'AbortError') {
                    console.warn(`Rotator request timed out, attempt ${attempt + 1}/${maxRetries}`);
                } else {
                    console.warn(`Rotator connection error (attempt ${attempt + 1}/${maxRetries}):`, e.message);
                }
            }

            // Exponential backoff before retry
            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
                console.log(`Retrying rotator in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Rotator failed after retries - try local Flask API
        console.warn('Rotator unavailable after retries, trying local API...');
        try {
            const localResponse = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (localResponse.ok) {
                const data = await localResponse.json();
                return data.response || 'I\'m here to help! What can I do for you?';
            }
        } catch (e) {
            console.warn('Local API also unavailable:', e.message);
        }

        // Final fallback - return helpful message based on context
        return this.getFallbackResponse();
    }

    getFallbackResponse() {
        const responses = {
            greeting: "Hello! I'm your Emirald AI Support Specialist. While I'm having trouble connecting to the full AI brain right now, I can still help with common issues!",
            install: "For installation issues: Run the installer as Administrator. If Windows SmartScreen blocks it, click 'More info' → 'Run anyway'. Disable antivirus temporarily during install.",
            api: "For BloFin API issues: Check your API Key, Secret, and Passphrase in the Setup tab. Make sure permissions include Read + Trade (not withdraw). Test with the 'Test Credentials' button.",
            rotator: "The LLM rotator runs on port 8082. If it's not starting, check Python 3.12+ is installed and the free-claude-router folder exists.",
            dashboard: "Dashboard runs on port 8766. If not loading, check config.yaml exists and port 8766 is free.",
            default: "I'm your Emirald AI Support Specialist! While I reconnect to the full AI, here's quick help:\n\n**Common issues:**\n• **Install errors** → Run as Admin, allow SmartScreen\n• **API keys** → Test in Setup tab, check permissions\n• **Rotator** → Port 8082, check Python venv\n• **Dashboard** → Port 8766, check config.yaml\n• **Bot won't start** → Check .env has valid keys\n\nWhat specific issue can I help you with?"
        };

        // Simple keyword matching
        const lastUserMsg = this.messages.filter(m => m.role === 'user').pop();
        if (lastUserMsg) {
            const msg = lastUserMsg.content.toLowerCase();
            if (msg.includes('install') || msg.includes('setup')) return responses.install;
            if (msg.includes('api') || msg.includes('key') || msg.includes('secret')) return responses.api;
            if (msg.includes('rotator') || msg.includes('llm') || msg.includes('model')) return responses.rotator;
            if (msg.includes('dashboard') || msg.includes('port 8766')) return responses.dashboard;
            if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) return responses.greeting;
        }
        return responses.default;
    }

    addMessage(role, content) {
        const messagesContainer = this.chatPanel.querySelector('#chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${role}`;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.innerHTML = `
            <div class="message-avatar">
                ${role === 'assistant' ? `
                    <svg width="20" height="20" viewBox="0 0 512 512" fill="none">
                        <rect width="512" height="512" rx="90" fill="url(#grad)"/>
                        <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0d8a6f"/><stop offset="100%" stop-color="#0a7b8c"/></linearGradient></defs>
                        <path d="M256 48c-12 0-24 6-30 16-6 10-6 22 0 32 6 10 18 16 30 16s24-6 30-16c6-10 6-22 0-32-6-10-18-16-30-16z" fill="#38c9a7"/>
                    </svg>
                ` : `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                `}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    ${this.formatMessage(content)}
                </div>
                <span class="message-time">${time}</span>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        this.messages.push({ role, content, time });
        this.saveHistory();
        this.scrollToBottom();
    }

    formatMessage(content) {
        // Convert markdown-like formatting
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>')
            .replace(/• /g, '<br>• ');
    }

    showTyping(show) {
        this.isTyping = show;
        const typingEl = this.chatPanel.querySelector('#chat-typing');
        if (show) {
            typingEl.classList.remove('hidden');
        } else {
            typingEl.classList.add('hidden');
        }
        this.scrollToBottom();
    }

    scrollToBottom() {
        const container = this.chatPanel.querySelector('#chat-messages');
        container.scrollTop = container.scrollHeight;
    }

    saveHistory() {
        try {
            localStorage.setItem('emirald_chat_history', JSON.stringify({
                messages: this.messages.slice(-50), // Keep last 50
                sessionId: this.sessionId,
                timestamp: Date.now()
            }));
        } catch (e) {
            // Storage full or unavailable
        }
    }

    loadHistory() {
        try {
            const saved = localStorage.getItem('emirald_chat_history');
            if (saved) {
                const data = JSON.parse(saved);
                // Only restore if session is recent (within 24 hours)
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    this.messages = data.messages;
                    this.sessionId = data.sessionId;
                    this.messages.forEach(m => this.renderMessage(m));
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    renderMessage(msg) {
        const messagesContainer = this.chatPanel.querySelector('#chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${msg.role}`;

        messageDiv.innerHTML = `
            <div class="message-avatar">
                ${msg.role === 'assistant' ? `
                    <svg width="20" height="20" viewBox="0 0 512 512" fill="none">
                        <rect width="512" height="512" rx="90" fill="url(#grad)"/>
                        <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0d8a6f"/><stop offset="100%" stop-color="#0a7b8c"/></linearGradient></defs>
                        <path d="M256 48c-12 0-24 6-30 16-6 10-6 22 0 32 6 10 18 16 30 16s24-6 30-16c6-10 6-22 0-32-6-10-18-16-30-16z" fill="#38c9a7"/>
                    </svg>
                ` : `
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                `}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    ${this.formatMessage(msg.content)}
                </div>
                <span class="message-time">${msg.time}</span>
            </div>
        `;
        messagesContainer.appendChild(messageDiv);
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is on a page where chat should appear
    const showChat = !window.location.pathname.includes('/dashboard'); // Don't show on dashboard (has its own UI)

    if (showChat) {
        window.emiraldChat = new EmiraldChatWidget({
            apiEndpoint: '/api/chat',
            rotatorUrl: 'http://127.0.0.1:8082'
        });
    }
});

// Export for manual initialization
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmiraldChatWidget;
}