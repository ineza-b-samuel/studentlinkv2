// StudentLink Main Application
class StudentLink {
    // Add this to your StudentLink class
    async loadAIChat() {
        // Check if AI is available first
        const statusResponse = await fetch(`${this.apiBase}/api/ai/status`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        const status = await statusResponse.json();

        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
        <div class="ai-chat-container">
            <div class="ai-chat-header">
                <h2><i class="fas fa-robot"></i> AI Study Buddy</h2>
                <div class="ai-status">
                    <span class="status-dot ${status.available ? 'online' : 'offline'}"></span>
                    <span>${status.model || 'Unavailable'}</span>
                </div>
                ${status.available ? `
                <button class="btn-icon" onclick="app.clearAIChat()">
                    <i class="fas fa-trash"></i>
                </button>` : ''}
            </div>
            <div id="aiChatMessages" class="ai-chat-messages">
                ${!status.available ?
                `<div class="ai-unavailable">
                        <i class="fas fa-robot"></i>
                        <h3>AI Assistant Unavailable</h3>
                        <p>The AI study buddy is not configured yet. Please contact your administrator.</p>
                    </div>`
                : this.renderAIChatHistory()}
            </div>
            ${status.available ? `
            <div class="ai-chat-input">
                <input type="text" id="aiInput" placeholder="Ask your study question...">
                <button id="aiSendBtn"><i class="fas fa-paper-plane"></i></button>
            </div>` : ''}
        </div>
    `;

        if (status.available) {
            this.setupAIChatListeners();
        }
    }

    async sendAIMessage(message) {
        const input = document.getElementById('aiInput');
        if (input) input.value = '';

        // Add user message to chat
        this.addAIMessageToChat('user', message);

        // Show typing indicator
        this.showAITyping(true);

        try {
            const response = await fetch(`${this.apiBase}/api/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    message: message,
                    history: this.aiChatHistory || []
                })
            });

            const data = await response.json();
            this.showAITyping(false);

            if (data.reply) {
                this.addAIMessageToChat('ai', data.reply);
            } else {
                throw new Error('No reply received');
            }

        } catch (error) {
            this.showAITyping(false);
            this.addAIMessageToChat('ai', 'Sorry, I encountered an error. Please try again.');
        }
    };
    constructor() {
        this.apiBase = window.location.origin;
        this.socket = null;
        this.currentUser = null;
        this.token = null;
        this.onlineUsers = new Set();
        this.currentPage = 'feed';

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuth();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigateTo(page);
            });
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });

        // Post Modal
        document.getElementById('publishPost')?.addEventListener('click', () => {
            this.createPost();
        });

        // File Drop Zone
        const dropZone = document.getElementById('fileDropZone');
        if (dropZone) {
            dropZone.addEventListener('click', () => {
                document.getElementById('fileInput').click();
            });

            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                this.handleFiles(e.dataTransfer.files);
            });
        }

        document.getElementById('fileInput')?.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });
    }

    async checkAuth() {
        const savedToken = localStorage.getItem('studentlink_token');
        if (savedToken) {
            this.token = savedToken;
            try {
                const response = await fetch(`${this.apiBase}/api/users`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                if (response.ok) {
                    this.currentUser = JSON.parse(localStorage.getItem('studentlink_user'));
                    this.showApp();
                    this.connectSocket();
                    this.loadFeed();
                } else {
                    this.showLogin();
                }
            } catch (error) {
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
        document.getElementById('loadingScreen').style.display = 'none';
    }

    showLogin() {
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="auth-container">
                <div class="auth-card">
                    <h1>Welcome to StudentLink</h1>
                    <p>The Global Student Network</p>
                    <div class="auth-tabs">
                        <button class="tab-btn active" data-tab="login">Login</button>
                        <button class="tab-btn" data-tab="register">Register</button>
                    </div>
                    <form id="loginForm" class="auth-form">
                        <input type="text" id="loginEmail" placeholder="Email or Username" required>
                        <input type="password" id="loginPassword" placeholder="Password" required>
                        <button type="submit" class="btn-primary">Login</button>
                    </form>
                    <form id="registerForm" class="auth-form" style="display:none;">
                        <input type="text" id="regFullName" placeholder="Full Name" required>
                        <input type="text" id="regUsername" placeholder="Username" required>
                        <input type="email" id="regEmail" placeholder="Email" required>
                        <input type="password" id="regPassword" placeholder="Password (min 6 characters)" required>
                        <select id="regCountry">
                            <option value="">Select Country</option>
                            ${this.getCountries()}
                        </select>
                        <input type="text" id="regUniversity" placeholder="University (optional)">
                        <button type="submit" class="btn-primary">Create Account</button>
                    </form>
                </div>
            </div>
        `;

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById('loginForm').style.display = e.target.dataset.tab === 'login' ? 'block' : 'none';
                document.getElementById('registerForm').style.display = e.target.dataset.tab === 'register' ? 'block' : 'none';
            });
        });

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.login();
        });

        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.register();
        });
    }

    async login() {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await fetch(`${this.apiBase}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const data = await response.json();
                this.setAuth(data);
                this.showApp();
                this.connectSocket();
                this.loadFeed();
            } else {
                const error = await response.json();
                this.showToast(error.error, 'error');
            }
        } catch (error) {
            this.showToast('Login failed', 'error');
        }
    }

    async register() {
        const userData = {
            fullName: document.getElementById('regFullName').value,
            username: document.getElementById('regUsername').value,
            email: document.getElementById('regEmail').value,
            password: document.getElementById('regPassword').value,
            country: document.getElementById('regCountry').value,
            university: document.getElementById('regUniversity').value
        };

        try {
            const response = await fetch(`${this.apiBase}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            if (response.ok) {
                const data = await response.json();
                this.setAuth(data);
                this.showApp();
                this.connectSocket();
                this.loadFeed();
                this.showToast('Welcome to StudentLink!', 'success');
            } else {
                const error = await response.json();
                this.showToast(error.error, 'error');
            }
        } catch (error) {
            this.showToast('Registration failed', 'error');
        }
    }

    setAuth(data) {
        this.token = data.token;
        this.currentUser = data.user;
        localStorage.setItem('studentlink_token', this.token);
        localStorage.setItem('studentlink_user', JSON.stringify(this.currentUser));

        document.getElementById('userName').textContent = this.currentUser.fullName;
        document.getElementById('userUsername').textContent = `@${this.currentUser.username}`;
        if (this.currentUser.profilePic) {
            document.getElementById('userAvatar').src = this.currentUser.profilePic;
        }
    }

    connectSocket() {
        this.socket = io(this.apiBase);

        this.socket.on('connect', () => {
            this.socket.emit('login', this.currentUser.id);
        });

        this.socket.on('new_message', (message) => {
            this.handleNewMessage(message);
        });

        this.socket.on('user_status', (data) => {
            if (data.status === 'online') {
                this.onlineUsers.add(data.userId);
            } else {
                this.onlineUsers.delete(data.userId);
            }
            this.updateOnlineUsers();
        });
    }

    showApp() {
        document.getElementById('mainApp').style.display = 'flex';
    }

    async navigateTo(page) {
        this.currentPage = page;
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        switch (page) {
            case 'feed':
                this.loadFeed();
                break;
            case 'explore':
                this.loadExplore();
                break;
            case 'groups':
                this.loadGroups();
                break;
            case 'messages':
                this.loadMessages();
                break;
            case 'reels':
                this.loadReels();
                break;
            case 'stories':
                this.loadStories();
                break;
            case 'studyrooms':
                this.loadStudyRooms();
                break;
            case 'profile':
                this.loadProfile();
                break;
        }
    }

    async loadFeed() {
        try {
            const response = await fetch(`${this.apiBase}/api/posts`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            this.renderFeed(data.posts);
        } catch (error) {
            this.showToast('Failed to load feed', 'error');
        }
    }

    renderFeed(posts) {
        const mainContent = document.getElementById('mainContent');
        let html = `
            <div class="feed-container">
                <div class="create-post-card">
                    <button class="btn-primary" onclick="app.openPostModal()">
                        <i class="fas fa-plus"></i> Create Post
                    </button>
                    <button class="btn-primary" onclick="app.openStoryCreator()">
                        <i class="fas fa-circle"></i> Add Story
                    </button>
                </div>
                <div class="stories-container" id="storiesContainer"></div>
                <div id="postsContainer"></div>
            </div>
        `;

        mainContent.innerHTML = html;

        // Render posts
        const postsContainer = document.getElementById('postsContainer');
        posts.forEach(post => {
            const postCard = this.createPostCard(post);
            postsContainer.appendChild(postCard);
        });

        // Load stories
        this.loadStoriesIntoBar();
    }

    createPostCard(post) {
        const card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = `
            <div class="post-header">
                <img src="${post.author?.profilePic || '/default-avatar.png'}" class="avatar">
                <div class="post-author-info">
                    <span class="post-author-name">${post.author?.fullName || 'Unknown'}</span>
                    <span class="post-meta">
                        @${post.author?.username || 'user'} • ${this.timeAgo(post.timestamp)}
                        ${post.author?.country ? ` • ${post.author.country}` : ''}
                    </span>
                </div>
            </div>
            <div class="post-content">${this.escapeHtml(post.content)}</div>
            ${post.files?.length ? this.renderMedia(post.files) : ''}
            <div class="post-actions">
                <button class="action-btn like-btn ${post.likes.includes(this.currentUser.id) ? 'liked' : ''}" 
                        onclick="app.toggleLike('${post.id}')">
                    <i class="far fa-heart"></i> ${post.likes.length}
                </button>
                <button class="action-btn" onclick="app.showComments('${post.id}')">
                    <i class="far fa-comment"></i> ${post.comments?.length || 0}
                </button>
                <button class="action-btn" onclick="app.sharePost('${post.id}')">
                    <i class="far fa-share-square"></i> ${post.shares || 0}
                </button>
                ${this.currentUser.isAdmin ? `
                    <button class="action-btn" onclick="app.deletePost('${post.id}')" style="color: var(--danger);">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        `;
        return card;
    }

    renderMedia(files) {
        return files.map(file => {
            if (file.type.startsWith('image/')) {
                return `<div class="post-media"><img src="${file.path}" alt="Post image"></div>`;
            } else if (file.type.startsWith('video/')) {
                return `<div class="post-media"><video controls src="${file.path}"></video></div>`;
            } else {
                return `<div class="post-media"><a href="${file.path}" target="_blank"><i class="fas fa-file"></i> Download File</a></div>`;
            }
        }).join('');
    }

    openPostModal() {
        const modal = document.getElementById('postModal');
        modal.style.display = 'block';

        document.querySelector('.close').onclick = () => {
            modal.style.display = 'none';
        };

        window.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    async createPost() {
        const content = document.getElementById('postContent').value;
        const tags = document.getElementById('postTags').value;
        const isQuestion = document.getElementById('isQuestion').checked;
        const subject = document.getElementById('postSubject').value;
        const files = document.getElementById('fileInput').files;

        if (!content.trim()) {
            this.showToast('Please add some content', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('content', content);
        formData.append('tags', JSON.stringify(tags.split(',').map(t => t.trim()).filter(Boolean)));
        formData.append('isQuestion', isQuestion);
        formData.append('subject', subject);

        for (let file of files) {
            formData.append('files', file);
        }

        try {
            const response = await fetch(`${this.apiBase}/api/posts`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: formData
            });

            if (response.ok) {
                document.getElementById('postModal').style.display = 'none';
                document.getElementById('postContent').value = '';
                document.getElementById('fileInput').value = '';
                this.loadFeed();
                this.showToast('Post created!', 'success');
            }
        } catch (error) {
            this.showToast('Failed to create post', 'error');
        }
    }

    handleFiles(files) {
        const preview = document.getElementById('filePreview');
        preview.innerHTML = '';

        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const element = file.type.startsWith('image/')
                    ? `<img src="${e.target.result}" class="file-preview">`
                    : `<div class="file-preview"><i class="fas fa-file"></i> ${file.name}</div>`;
                preview.innerHTML += element;
            };
            reader.readAsDataURL(file);
        });
    }

    async toggleLike(postId) {
        try {
            await fetch(`${this.apiBase}/api/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId: this.currentUser.id })
            });
            this.loadFeed();
        } catch (error) {
            console.error('Like failed:', error);
        }
    }

    getCountries() {
        const countries = [
            'United States', 'United Kingdom', 'Canada', 'Australia', 'India',
            'Singapore', 'Germany', 'France', 'Spain', 'Italy', 'Japan',
            'South Korea', 'China', 'Brazil', 'Mexico', 'Nigeria', 'South Africa',
            'Kenya', 'Egypt', 'Saudi Arabia', 'UAE', 'Malaysia', 'Indonesia'
        ];
        return countries.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    logout() {
        localStorage.removeItem('studentlink_token');
        localStorage.removeItem('studentlink_user');
        window.location.reload();
    }
}

// Initialize app when DOM is ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new StudentLink();
});

// Add near the top with other requires
const fetch = require('node-fetch'); // npm install node-fetch@2

// AI Chat endpoint (API key stays on server)
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
        const { message, history } = req.body;

        // API key is ONLY on the server, never sent to client
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

        if (!OPENROUTER_API_KEY) {
            return res.status(500).json({ error: 'AI service not configured' });
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
                'X-Title': 'StudentLink'
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-001',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful AI study buddy for students. Provide clear, accurate explanations on academic topics. Keep responses concise but thorough. Use a friendly tone.'
                    },
                    ...history.slice(-20).map(msg => ({
                        role: msg.role === 'user' ? 'user' : 'assistant',
                        content: msg.content
                    })),
                    { role: 'user', content: message }
                ],
                max_tokens: 500
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'AI service error');
        }

        res.json({
            reply: data.choices[0].message.content,
            model: data.model
        });

    } catch (error) {
        console.error('AI Chat Error:', error);
        res.status(500).json({
            error: 'AI assistant unavailable',
            message: error.message
        });
    }
});

// Health check for AI service
app.get('/api/ai/status', authenticateToken, (req, res) => {
    const isConfigured = !!process.env.OPENROUTER_API_KEY;
    res.json({
        available: isConfigured,
        model: isConfigured ? 'google/gemini-2.0-flash-001' : null
    });
});