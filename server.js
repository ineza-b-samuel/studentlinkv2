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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
['uploads', 'data'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Database
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
            {
                username: 'sarah_cs',
                fullName: 'Sarah Johnson',
                country: 'United States',
                university: 'MIT',
                bio: 'Computer Science Major | AI Enthusiast'
            },
            {
                username: 'alex_med',
                fullName: 'Alex Chen',
                country: 'Singapore',
                university: 'National University of Singapore',
                bio: 'Medical Student | Research Focus'
            },
            {
                username: 'maria_arts',
                fullName: 'Maria Garcia',
                country: 'Spain',
                university: 'University of Barcelona',
                bio: 'Fine Arts & Design Student'
            },
            {
                username: 'raj_eng',
                fullName: 'Raj Patel',
                country: 'India',
                university: 'IIT Delhi',
                bio: 'Engineering Student | Robotics Club'
            },
            {
                username: 'lisa_bio',
                fullName: 'Lisa Anderson',
                country: 'United Kingdom',
                university: 'University of Oxford',
                bio: 'Biology Research Student'
            },
            {
                username: 'yuki_physics',
                fullName: 'Yuki Tanaka',
                country: 'Japan',
                university: 'University of Tokyo',
                bio: 'Physics Major | Quantum Computing'
            },
            {
                username: 'omar_business',
                fullName: 'Omar Hassan',
                country: 'UAE',
                university: 'NYU Abu Dhabi',
                bio: 'Business & Entrepreneurship'
            }
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

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'studentlink-dev-secret-change-in-production';
const JWT_EXPIRY = '7d';

// Authentication Middleware
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

// Admin Middleware
const isAdmin = (req, res, next) => {
    const user = DB.users.find(u => u.id === req.user.id);
    if (!user || !user.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// File Upload Configuration
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
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
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

// ==================== API ROUTES ====================

// Auth Routes
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

// User Routes
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

// Follow/Unfollow
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

// Post Routes
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

        // Populate author info
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

        // Create notification for followers
        const currentUser = DB.users.find(u => u.id === req.user.id);
        currentUser.followers.forEach(followerId => {
            const notification = {
                id: uuidv4(),
                userId: followerId,
                type: 'new_post',
                message: `${currentUser.fullName} posted: "${content.substring(0, 50)}..."`,
                relatedId: post.id,
                read: false,
                timestamp: Date.now()
            };
            DB.notifications.unshift(notification);
        });
        saveDB('notifications');

        res.status(201).json(populatedPost);
    } catch (error) {
        console.error('Post creation error:', error);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

app.get('/api/posts', authenticateToken, (req, res) => {
    const { subject, tag, author } = req.query;
    let posts = [...DB.posts];

    if (subject) {
        posts = posts.filter(p => p.subject === subject);
    }
    if (tag) {
        posts = posts.filter(p => p.tags.includes(tag));
    }
    if (author) {
        posts = posts.filter(p => p.authorId === author);
    }

    const populatedPosts = posts.map(post => ({
        ...post,
        author: DB.users.find(u => u.id === post.authorId)
    })).filter(p => p.author);

    res.json({ posts: populatedPosts });
});

app.get('/api/posts/:id', authenticateToken, (req, res) => {
    const post = DB.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.views++;
    saveDB('posts');

    const author = DB.users.find(u => u.id === post.authorId);
    res.json({ ...post, author });
});

app.delete('/api/posts/:id', authenticateToken, (req, res) => {
    const postIndex = DB.posts.findIndex(p => p.id === req.params.id);
    if (postIndex === -1) return res.status(404).json({ error: 'Post not found' });

    const post = DB.posts[postIndex];

    // Only author or admin can delete
    if (post.authorId !== req.user.id && !DB.users.find(u => u.id === req.user.id)?.isAdmin) {
        return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    // Delete associated files
    post.files?.forEach(file => {
        const filePath = path.join(__dirname, 'uploads', file.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    DB.posts.splice(postIndex, 1);
    saveDB('posts');

    io.emit('post_deleted', req.params.id);
    res.json({ success: true });
});

// Like/Unlike
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

// Comments
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

// Share
app.post('/api/posts/:id/share', authenticateToken, (req, res) => {
    const post = DB.posts.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.shares++;
    saveDB('posts');

    res.json({ shares: post.shares });
});

// Group Routes
app.post('/api/groups', authenticateToken, upload.single('groupImage'), (req, res) => {
    const { name, description, subject, isPrivate } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Group name is required' });
    }

    const group = {
        id: uuidv4(),
        name: name.trim(),
        description: description || '',
        subject: subject || 'General',
        isPrivate: isPrivate === 'true',
        creatorId: req.user.id,
        members: [req.user.id],
        admins: [req.user.id],
        image: req.file ? `/uploads/${req.file.filename}` : '',
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
        creator: DB.users.find(u => u.id === group.creatorId),
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

        io.emit('member_joined', { groupId: group.id, userId: req.user.id });
    }

    res.json({ success: true });
});

app.post('/api/groups/:id/leave', authenticateToken, (req, res) => {
    const group = DB.groups.find(g => g.id === req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.members = group.members.filter(m => m !== req.user.id);
    saveDB('groups');

    res.json({ success: true });
});

// Message Routes
app.get('/api/conversations/:userId', authenticateToken, (req, res) => {
    const conversations = DB.messages
        .filter(msg => msg.participants.includes(req.params.userId))
        .reduce((acc, msg) => {
            const otherUserId = msg.participants.find(p => p !== req.params.userId);
            if (!acc[otherUserId]) {
                acc[otherUserId] = {
                    userId: otherUserId,
                    messages: []
                };
            }
            acc[otherUserId].messages.push(msg);
            return acc;
        }, {});

    res.json({ conversations: Object.values(conversations) });
});

// Stories Routes
app.post('/api/stories', authenticateToken, upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Media file is required' });
    }

    const story = {
        id: uuidv4(),
        userId: req.user.id,
        media: `/uploads/${req.file.filename}`,
        type: req.file.mimetype.startsWith('video') ? 'video' : 'image',
        timestamp: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };

    DB.stories.unshift(story);
    saveDB('stories');
    res.status(201).json(story);
});

app.get('/api/stories', authenticateToken, (req, res) => {
    const now = Date.now();
    const activeStories = DB.stories
        .filter(story => story.expiresAt > now)
        .map(story => ({
            ...story,
            user: DB.users.find(u => u.id === story.userId)
        }));

    res.json({ stories: activeStories });
});

// Reels Routes
app.post('/api/reels', authenticateToken, upload.single('video'), (req, res) => {
    if (!req.file || !req.file.mimetype.startsWith('video')) {
        return res.status(400).json({ error: 'Video file is required' });
    }

    const reel = {
        id: uuidv4(),
        userId: req.user.id,
        video: `/uploads/${req.file.filename}`,
        caption: req.body.caption || '',
        tags: req.body.tags ? JSON.parse(req.body.tags) : [],
        likes: [],
        comments: [],
        shares: 0,
        views: 0,
        timestamp: Date.now()
    };

    DB.reels.unshift(reel);
    saveDB('reels');
    res.status(201).json(reel);
});

app.get('/api/reels', authenticateToken, (req, res) => {
    const reels = DB.reels.map(reel => ({
        ...reel,
        user: DB.users.find(u => u.id === reel.userId)
    }));
    res.json({ reels });
});

// Study Room Routes
app.post('/api/studyrooms', authenticateToken, (req, res) => {
    const { name, subject, maxParticipants } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Room name is required' });
    }

    const room = {
        id: uuidv4(),
        name: name.trim(),
        subject: subject || 'General',
        maxParticipants: maxParticipants || 20,
        creatorId: req.user.id,
        participants: [req.user.id],
        messages: [],
        createdAt: Date.now()
    };

    DB.studyRooms.push(room);
    saveDB('studyRooms');
    res.status(201).json(room);
});

app.get('/api/studyrooms', authenticateToken, (req, res) => {
    res.json({ rooms: DB.studyRooms });
});

// Notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
    const notifications = DB.notifications
        .filter(n => n.userId === req.user.id)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 50);

    res.json({ notifications });
});

// ==================== AI CHAT ROUTE (API KEY HIDDEN) ====================
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
    try {
        const { message, history } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // API key is ONLY on the server, never exposed to client
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

        if (!OPENROUTER_API_KEY) {
            return res.status(503).json({
                error: 'AI service is not configured',
                reply: 'The AI assistant is currently unavailable. Please try again later or contact the administrator.'
            });
        }

        const APP_URL = process.env.APP_URL || 'http://localhost:3000';

        const messages = [
            {
                role: 'system',
                content: `You are a helpful AI study buddy for StudentLink, a global student social network. 
                You help students with:
                - Academic questions and explanations
                - Study tips and strategies
                - Homework help (but don't do it for them)
                - Subject-specific guidance
                - Research suggestions
                - Language learning
                - Career advice
                Keep responses educational, encouraging, and appropriate for students.
                Be concise but thorough. Use emojis occasionally to be friendly.`
            },
            ...(history || []).slice(-20).map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            })),
            {
                role: 'user',
                content: message.trim()
            }
        ];

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': APP_URL,
                'X-Title': 'StudentLink - Global Student Network'
            },
            body: JSON.stringify({
                model: 'google/gemini-2.0-flash-001',
                messages: messages,
                max_tokens: 500,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API responded with status ${response.status}`);
        }

        const data = await response.json();

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response format from AI service');
        }

        res.json({
            reply: data.choices[0].message.content,
            model: data.model || 'AI Assistant'
        });

    } catch (error) {
        console.error('AI Chat Error:', error);

        // Don't expose API errors to client
        const userMessage = error.message.includes('API key')
            ? 'AI service configuration error'
            : 'I encountered an error processing your request. Please try again.';

        res.status(500).json({
            error: 'AI service error',
            reply: userMessage
        });
    }
});

// AI Health Check (doesn't expose key)
app.get('/api/ai/status', authenticateToken, (req, res) => {
    const isConfigured = !!process.env.OPENROUTER_API_KEY;
    res.json({
        available: isConfigured,
        model: isConfigured ? 'Gemini 2.0 Flash' : null,
        features: isConfigured ? ['Q&A', 'Study Help', 'Explanations'] : []
    });
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

    // Don't delete other admins
    if (DB.users[userIndex].isAdmin) {
        return res.status(403).json({ error: 'Cannot delete admin accounts' });
    }

    DB.users.splice(userIndex, 1);
    saveDB('users');

    // Remove user's posts
    DB.posts = DB.posts.filter(p => p.authorId !== req.params.userId);
    saveDB('posts');

    res.json({ success: true });
});

app.delete('/api/admin/posts/:postId', authenticateToken, isAdmin, (req, res) => {
    const postIndex = DB.posts.findIndex(p => p.id === req.params.postId);
    if (postIndex === -1) return res.status(404).json({ error: 'Post not found' });

    const post = DB.posts[postIndex];

    // Delete associated files
    post.files?.forEach(file => {
        const filePath = path.join(__dirname, 'uploads', file.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    DB.posts.splice(postIndex, 1);
    saveDB('posts');

    io.emit('post_deleted', req.params.id);
    res.json({ success: true });
});

// ==================== WEBSOCKET HANDLING ====================
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    let currentUser = null;
    let currentUserData = null;

    socket.on('login', (userId) => {
        currentUser = userId;
        currentUserData = DB.users.find(u => u.id === userId);
        onlineUsers.set(userId, socket.id);

        io.emit('user_status', { userId, status: 'online' });
        socket.emit('online_users', Array.from(onlineUsers.keys()));

        console.log(`${currentUserData?.fullName || 'User'} is now online`);
    });

    socket.on('send_message', (data) => {
        if (!currentUser || !data.recipientId || !data.text?.trim()) return;

        const participants = [currentUser, data.recipientId].sort();
        const conversationId = participants.join('_');

        const message = {
            id: uuidv4(),
            conversationId,
            senderId: currentUser,
            recipientId: data.recipientId,
            text: data.text.trim(),
            timestamp: Date.now(),
            read: false
        };

        DB.messages.push(message);
        saveDB('messages');

        // Send to recipient if online
        const recipientSocket = onlineUsers.get(data.recipientId);
        if (recipientSocket) {
            io.to(recipientSocket).emit('new_message', message);
        }

        // Confirm to sender
        socket.emit('message_sent', message);
    });

    socket.on('typing', (data) => {
        const recipientSocket = onlineUsers.get(data.recipientId);
        if (recipientSocket) {
            io.to(recipientSocket).emit('user_typing', {
                userId: currentUser,
                conversationId: data.conversationId,
                isTyping: data.isTyping
            });
        }
    });

    socket.on('join_studyroom', (roomId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user_joined_room', {
            userId: currentUser,
            userName: currentUserData?.fullName
        });

        const room = DB.studyRooms.find(r => r.id === roomId);
        if (room && !room.participants.includes(currentUser)) {
            room.participants.push(currentUser);
            saveDB('studyRooms');
        }
    });

    socket.on('studyroom_message', (data) => {
        if (!currentUser || !data.roomId || !data.text?.trim()) return;

        const room = DB.studyRooms.find(r => r.id === data.roomId);
        if (room) {
            const message = {
                id: uuidv4(),
                userId: currentUser,
                text: data.text.trim(),
                timestamp: Date.now()
            };
            room.messages.push(message);
            saveDB('studyRooms');
        }

        io.to(data.roomId).emit('new_studyroom_message', {
            userId: currentUser,
            userName: currentUserData?.fullName,
            text: data.text.trim(),
            timestamp: Date.now()
        });
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            onlineUsers.delete(currentUser);
            io.emit('user_status', { userId: currentUser, status: 'offline' });
            console.log(`${currentUserData?.fullName || 'User'} disconnected`);
        }
    });
});

// Initialize and start server
initDB();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 StudentLink server running on port ${PORT}`);
    console.log(`👑 Admin account: username=admin, password=2009113`);
    console.log(`🤖 AI Assistant: ${process.env.OPENROUTER_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve main page for root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'studentlink.html'));
});
