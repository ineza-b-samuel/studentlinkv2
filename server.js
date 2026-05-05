const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== ROOT ROUTE (MUST BE BEFORE SERVER.LISTEN) ====================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'studentlink.html'));
});

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'studentlink.html'));
});

// ==================== ENSURE DIRECTORIES EXIST ====================
['uploads', 'data'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ==================== DATABASE ====================
const DB = {
    users: [],
    posts: [],
    groups: [],
    messages: [],
    stories: [],
    reels: [],
    notifications: [],
    studyRooms: []
};

// Initialize database
const initDB = () => {
    const files = ['users', 'posts', 'groups', 'messages', 'stories', 'reels', 'notifications', 'studyRooms'];

    files.forEach(file => {
        const filePath = `./data/${file}.json`;
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });

        if (fs.existsSync(filePath)) {
            try {
                DB[file] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch (e) {
                DB[file] = [];
                fs.writeFileSync(filePath, '[]');
            }
        } else {
            fs.writeFileSync(filePath, '[]');
        }
    });

    // Create admin account if not exists
    if (!DB.users.find(u => u.username === 'admin')) {
        const adminUser = {
            id: uuidv4(),
            username: 'admin',
            email: 'admin@studentlink.com',
            password: bcrypt.hashSync('2009113', 10),
            fullName: 'Administrator',
            bio: 'StudentLink Admin • Global Moderator',
            profilePic: '',
            role: 'admin',
            isAdmin: true,
            verified: true,
            createdAt: Date.now(),
            country: 'Global',
            university: 'StudentLink HQ',
            followers: [],
            following: []
        };
        DB.users.push(adminUser);
        saveDB('users');
    }

    // Add sample users
    if (DB.users.length <= 1) {
        const sampleUsers = [
            { username: 'sarah_cs', fullName: 'Sarah Johnson', country: 'United States', university: 'MIT', bio: 'Computer Science Major | AI Enthusiast' },
            { username: 'alex_med', fullName: 'Alex Chen', country: 'Singapore', university: 'National University of Singapore', bio: 'Medical Student | Research Focus' },
            { username: 'maria_arts', fullName: 'Maria Garcia', country: 'Spain', university: 'University of Barcelona', bio: 'Fine Arts & Design Student' },
            { username: 'raj_eng', fullName: 'Raj Patel', country: 'India', university: 'IIT Delhi', bio: 'Engineering Student | Robotics Club' },
            { username: 'lisa_bio', fullName: 'Lisa Anderson', country: 'United Kingdom', university: 'University of Oxford', bio: 'Biology Research Student' },
            { username: 'yuki_physics', fullName: 'Yuki Tanaka', country: 'Japan', university: 'University of Tokyo', bio: 'Physics Major | Quantum Computing' },
            { username: 'omar_business', fullName: 'Omar Hassan', country: 'UAE', university: 'NYU Abu Dhabi', bio: 'Business & Entrepreneurship' }
        ];

        sampleUsers.forEach(u => {
            const user = {
                id: uuidv4(),
                username: u.username,
                email: `${u.username}@studentlink.com`,
                password: bcrypt.hashSync('password123', 10),
                fullName: u.fullName,
                bio: u.bio,
                profilePic: '',
                role: 'user',
                isAdmin: false,
                verified: true,
                createdAt: Date.now() - Math.floor(Math.random() * 60 * 24 * 60 * 60 * 1000),
                country: u.country,
                university: u.university,
                followers: [],
                following: []
            };
            DB.users.push(user);
        });
        saveDB('users');
    }
};

const saveDB = (name) => {
    const filePath = `./data/${name}.json`;
    fs.writeFileSync(filePath, JSON.stringify(DB[name], null, 2));
};

// ==================== JWT CONFIGURATION ====================
const JWT_SECRET = process.env.JWT_SECRET || 'studentlink-dev-secret-change-in-production';
const JWT_EXPIRY = '7d';

// ==================== AUTH MIDDLEWARE ====================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};

const isAdmin = (req, res, next) => {
    const user = DB.users.find(u => u.id === req.user.id);
    if (!user || !user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// ==================== FILE UPLOAD CONFIGURATION ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|pdf|doc|docx|ppt|pptx|xls|xlsx|zip|txt/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// ==================== AUTH ROUTES ====================
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password, fullName, country, university } = req.body;

        if (!username || !email || !password || !fullName) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        if (DB.users.find(u => u.username === username || u.email === email)) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            id: uuidv4(),
            username,
            email,
            password: hashedPassword,
            fullName,
            bio: '',
            profilePic: '',
            role: 'user',
            isAdmin: false,
            verified: false,
            createdAt: Date.now(),
            country: country || 'Unknown',
            university: university || 'Unknown',
            followers: [],
            following: []
        };

        DB.users.push(user);
        saveDB('users');

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        const { password: _, ...userWithoutPassword } = user;
        res.status(201).json({ token, user: userWithoutPassword });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = DB.users.find(u => u.email === email || u.username === email);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        const { password: _, ...userWithoutPassword } = user;
        res.json({ token, user: userWithoutPassword });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ==================== USER ROUTES ====================
app.get('/api/users', authenticateToken, (req, res) => {
    const users = DB.users.map(({ password, ...user }) => user);
    res.json({ users });
});

app.get('/api/users/:id', authenticateToken, (req, res) => {
    const user = DB.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
});

app.put('/api/users/profile', authenticateToken, upload.single('profilePic'), (req, res) => {
    const user = DB.users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { fullName, bio, country, university } = req.body;
    if (fullName) user.fullName = fullName;
    if (bio) user.bio = bio;
    if (country) user.country = country;
    if (university) user.university = university;
    if (req.file) user.profilePic = `/uploads/${req.file.filename}`;

    saveDB('users');
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
});

app.post('/api/users/:id/follow', authenticateToken, (req, res) => {
    const targetUser = DB.users.find(u => u.id === req.params.id);
    const currentUser = DB.users.find(u => u.id === req.user.id);

    if (!targetUser || !currentUser) {
        return res.status(404).json({ error: 'User not found' });
    }

    const isFollowing = currentUser.following.includes(targetUser.id);

    if (isFollowing) {
        currentUser.following = currentUser.following.filter(id => id !== targetUser.id);
        targetUser.followers = targetUser.followers.filter(id => id !== currentUser.id);
    } else {
        currentUser.following.push(targetUser.id);
        targetUser.followers.push(currentUser.id);
    }

    saveDB('users');
    res.json({ following: !isFollowing });
});

// ==================== POST ROUTES ====================
app.post('/api/posts', authenticateToken, upload.array('files', 5), (req, res) => {
    try {
        const { content, tags, isQuestion, subject } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const files = req.files?.map(f => ({
            id: uuidv4(),
            filename: f.filename,
            path: `/uploads/${f.filename}`,
            type: f.mimetype,
            size: f.size
        })) || [];

        const post = {
            id: uuidv4(),
            authorId: req.user.id,
            content: content.trim(),
            tags: tags ? JSON.parse(tags) : [],
            files,
            isQuestion: isQuestion === 'true',
            subject: subject || 'General',
            likes: [],
            comments: [],
            shares: 0,
            views: 0,
            timestamp: Date.now(),
            edited: false
        };

        DB.posts.unshift(post);
        saveDB('posts');

        const author = DB.users.find(u => u.id === post.authorId);
        const populatedPost = {
            ...post,
            author: author ? {
                id: author.id,
                username: author.username,
                fullName: author.fullName,
                profilePic: author.profilePic,
                country: author.country,
                university: author.university
            } : null
        };

        io.emit('new_post', populatedPost);
        res.status(201).json(populatedPost);
    } catch (error) {
        console.error('Post creation error:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

app.get('/api/posts', authenticateToken, (req, res) => {
    const posts = DB.posts.map(post => ({
        ...post,
        author: DB.users.find(u => u.id === post.authorId)
    })).filter(p => p.author);

    res.json({ posts });
});

app.delete('/api/posts/:id', authenticateToken, (req, res) => {
    const postIndex = DB.posts.findIndex(p => p.id === req.params.id);
    if (postIndex === -1) return res.status(404).json({ error: 'Post not found' });

    const post = DB.posts[postIndex];

    if (post.authorId !== req.user.id && !DB.users.find(u => u.id === req.user.id)?.isAdmin) {
        return res.status(403).json({ error: 'Not authorized' });
    }

    DB.posts.splice(postIndex, 1);
    saveDB('posts');
    io.emit('post_deleted', req.params.id);
    res.json({ success: true });
});

app.post('/api/posts/:id/like', authenticateToken, (req, res) => {
    const post = DB.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const likeIndex = post.likes.indexOf(req.user.id);

    if (likeIndex > -1) {
        post.likes.splice(likeIndex, 1);
    } else {
        post.likes.push(req.user.id);
    }

    saveDB('posts');
    res.json({ liked: likeIndex === -1, count: post.likes.length });
});

app.post('/api/posts/:id/comments', authenticateToken, (req, res) => {
    const post = DB.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const { text } = req.body;
    if (!text || !text.trim()) {
        return res.status(400).json({ error: 'Comment text is required' });
    }

    const comment = {
        id: uuidv4(),
        authorId: req.user.id,
        text: text.trim(),
        timestamp: Date.now(),
        likes: []
    };

    post.comments.push(comment);
    saveDB('posts');

    const author = DB.users.find(u => u.id === comment.authorId);
    res.status(201).json({ ...comment, author });
});

// ==================== GROUP ROUTES ====================
app.post('/api/groups', authenticateToken, (req, res) => {
    const { name, description, subject } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Group name is required' });
    }

    const group = {
        id: uuidv4(),
        name: name.trim(),
        description: description || '',
        subject: subject || 'General',
        creatorId: req.user.id,
        members: [req.user.id],
        admins: [req.user.id],
        posts: [],
        createdAt: Date.now()
    };

    DB.groups.push(group);
    saveDB('groups');
    res.status(201).json(group);
});

app.get('/api/groups', authenticateToken, (req, res) => {
    const groups = DB.groups.map(group => ({
        ...group,
        memberCount: group.members.length
    }));
    res.json({ groups });
});

app.post('/api/groups/:id/join', authenticateToken, (req, res) => {
    const group = DB.groups.find(g => g.id === req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!group.members.includes(req.user.id)) {
        group.members.push(req.user.id);
        saveDB('groups');
    }

    res.json({ success: true });
});

// ==================== MESSAGE ROUTES ====================
app.get('/api/conversations/:userId', authenticateToken, (req, res) => {
    const conversations = DB.messages
        .filter(msg => msg.participants?.includes(req.params.userId))
        .reduce((acc, msg) => {
            const otherUserId = msg.participants.find(p => p !== req.params.userId);
            if (!acc[otherUserId]) {
                acc[otherUserId] = { userId: otherUserId, messages: [] };
            }
            acc[otherUserId].messages.push(msg);
            return acc;
        }, {});

    res.json({ conversations: Object.values(conversations) });
});

// ==================== AI CHAT ROUTE ====================
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

        if (!OPENROUTER_API_KEY) {
            return res.status(503).json({
                reply: 'AI assistant is not configured. Please add OPENROUTER_API_KEY to environment variables.'
            });
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-001',
                messages: [
                    { role: 'system', content: 'You are a helpful AI study buddy for students.' },
                    { role: 'user', content: message.trim() }
                ],
                max_tokens: 500
            })
        });

        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });

    } catch (error) {
        console.error('AI Error:', error);
        res.status(500).json({ reply: 'AI service error. Please try again.' });
    }
});

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    const users = DB.users.map(({ password, ...user }) => user);
    res.json({ users });
});

app.delete('/api/admin/users/:userId', authenticateToken, isAdmin, (req, res) => {
    if (req.params.userId === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own admin account' });
    }

    const userIndex = DB.users.findIndex(u => u.id === req.params.userId);
    if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

    DB.users.splice(userIndex, 1);
    saveDB('users');
    res.json({ success: true });
});

app.delete('/api/admin/posts/:postId', authenticateToken, isAdmin, (req, res) => {
    const postIndex = DB.posts.findIndex(p => p.id === req.params.postId);
    if (postIndex === -1) return res.status(404).json({ error: 'Post not found' });

    DB.posts.splice(postIndex, 1);
    saveDB('posts');
    io.emit('post_deleted', req.params.postId);
    res.json({ success: true });
});

// ==================== WEBSOCKET HANDLING ====================
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    let currentUser = null;

    socket.on('login', (userId) => {
        currentUser = userId;
        onlineUsers.set(userId, socket.id);
        io.emit('user_status', { userId, status: 'online' });
    });

    socket.on('send_message', (data) => {
        if (!currentUser || !data.recipientId || !data.text?.trim()) return;

        const message = {
            id: uuidv4(),
            senderId: currentUser,
            recipientId: data.recipientId,
            text: data.text.trim(),
            participants: [currentUser, data.recipientId],
            timestamp: Date.now()
        };

        DB.messages.push(message);
        saveDB('messages');

        const recipientSocket = onlineUsers.get(data.recipientId);
        if (recipientSocket) {
            io.to(recipientSocket).emit('new_message', message);
        }
        socket.emit('message_sent', message);
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            onlineUsers.delete(currentUser);
            io.emit('user_status', { userId: currentUser, status: 'offline' });
        }
    });
});

// ==================== INITIALIZE AND START SERVER ====================
initDB();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 StudentLink server running on port ${PORT}`);
    console.log(`👑 Admin: username=admin, password=2009113`);
    console.log(`🤖 AI: ${process.env.OPENROUTER_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
});
