// index.js — Bot + Dashboard — single server
require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const path     = require('path');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');

const { getAIResponse }   = require('./ai');
const { sendTextMessage } = require('./whatsapp');
const Activity            = require('./dashboard/backend/models/Activity');
const User                = require('./dashboard/backend/models/User');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard/frontend')));

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });

const JWT_SECRET = process.env.JWT_SECRET || 'umrah_jwt_secret_change_this';

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required' });
  next();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FIRST TIME SETUP — creates admin if none exists
// Visit /api/setup in browser ONCE, then it locks itself
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/api/setup', async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (adminExists)
      return res.status(400).json({ message: 'Admin already exists. Setup locked.' });

    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password required' });

    const admin = new User({ username, password, role: 'admin' });
    await admin.save();

    res.json({ message: `Admin "${username}" created successfully. Setup is now locked.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH ROUTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Login — works for both admin and agent
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password required' });

    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user || !user.isActive)
      return res.status(401).json({ message: 'Invalid username or password' });

    const match = await user.comparePassword(password);
    if (!match)
      return res.status(401).json({ message: 'Invalid username or password' });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEAM MANAGEMENT — admin only
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Get all agents
app.get('/api/team', requireAuth, requireAdmin, async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(agents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create a new agent — admin only, no public signup
app.post('/api/team', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password required' });

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists)
      return res.status(400).json({ message: 'Username already taken' });

    const agent = new User({
      username,
      password,
      role:      'agent',
      createdBy: req.user.username
    });
    await agent.save();

    res.json({ message: 'Agent created', username: agent.username });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Toggle agent active/inactive (soft delete)
app.patch('/api/team/:username', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username, role: 'agent' });
    if (!user) return res.status(404).json({ message: 'Agent not found' });

    user.isActive = !user.isActive;
    await user.save();

    res.json({ message: `Agent ${user.isActive ? 'activated' : 'deactivated'}`, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reset agent password — admin only
app.post('/api/team/:username/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: 'New password required' });

    const user = await User.findOne({ username: req.params.username, role: 'agent' });
    if (!user) return res.status(404).json({ message: 'Agent not found' });

    user.password = newPassword;  // pre-save hook hashes it
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD API — both admin and agent can access
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const total  = await Activity.countDocuments();
    const paused = await Activity.countDocuments({ isPaused: true });
    const today  = new Date(); today.setHours(0,0,0,0);
    const newToday = await Activity.countDocuments({ firstSeen: { $gte: today } });
    const msgAgg = await Activity.aggregate([
      { $group: { _id: null, total: { $sum: '$messageCount' } } }
    ]);
    res.json({
      totalCustomers: total,
      activeChats:    total - paused,
      pausedChats:    paused,
      newToday,
      totalMessages:  msgAgg[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List all customers — sorted by last active
app.get('/api/customers', requireAuth, async (req, res) => {
  try {
    const customers = await Activity.find()
      .select('phoneNumber customerName status isPaused lastMessage lastActive messageCount firstSeen pausedBy')
      .sort({ lastActive: -1 });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get one customer's full conversation
app.get('/api/customers/:phone', requireAuth, async (req, res) => {
  try {
    const customer = await Activity.findOne({ phoneNumber: req.params.phone });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update customer name/status
app.patch('/api/customers/:phone', requireAuth, async (req, res) => {
  try {
    const { customerName, status } = req.body;
    const updated = await Activity.findOneAndUpdate(
      { phoneNumber: req.params.phone },
      { $set: { customerName, status } },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Pause bot — agent takes over
app.post('/api/customers/:phone/pause', requireAuth, async (req, res) => {
  try {
    const updated = await Activity.findOneAndUpdate(
      { phoneNumber: req.params.phone },
      { $set: {
          isPaused: true,
          pausedBy: req.user.username,
          pausedAt: new Date(),
          status:   'paused'
      }},
      { new: true }
    );
    console.log(`⏸️  Bot paused for ${req.params.phone} by ${req.user.username}`);
    res.json({ ok: true, customer: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Resume bot — hand back to AI
app.post('/api/customers/:phone/resume', requireAuth, async (req, res) => {
  try {
    const updated = await Activity.findOneAndUpdate(
      { phoneNumber: req.params.phone },
      { $set: {
          isPaused: false,
          pausedBy: null,
          pausedAt: null,
          status:   'active'
      }},
      { new: true }
    );
    console.log(`▶️  Bot resumed for ${req.params.phone} by ${req.user.username}`);
    res.json({ ok: true, customer: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Agent sends manual reply
app.post('/api/customers/:phone/reply', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim())
      return res.status(400).json({ message: 'Message cannot be empty' });

    await sendTextMessage(req.params.phone, message);

    await Activity.findOneAndUpdate(
      { phoneNumber: req.params.phone },
      {
        $push: { messages: { role: 'agent', content: message } },
        $set:  { lastMessage: message.substring(0,80), lastActive: new Date() },
        $inc:  { messageCount: 1 }
      }
    );

    console.log(`👤 ${req.user.username} replied to ${req.params.phone}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHATSAPP WEBHOOK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

const processedMessages = new Set();

app.post('/webhook', (req, res) => {
  res.sendStatus(200); // Always reply immediately

  setImmediate(async () => {
    try {
      const body = req.body;
      if (!body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) return;

      const value   = body.entry[0].changes[0].value;
      const message = value.messages[0];
      const from    = message.from;

      // Deduplicate — Meta sometimes sends the same message twice
      if (processedMessages.has(message.id)) return;
      processedMessages.add(message.id);
      setTimeout(() => processedMessages.delete(message.id), 10 * 60 * 1000);

      // Non-text messages
      if (message.type !== 'text') {
        await sendTextMessage(from, 'I can read text messages only. Please type your question 😊');
        return;
      }

      const incomingText = message.text.body.trim();
      console.log(`\n📩 From ${from}: "${incomingText}"`);

      // Check if agent has paused this customer
      const existing = await Activity.findOne({ phoneNumber: from });
      if (existing?.isPaused) {
        console.log(`⏸️  Agent handling ${from} — saving message silently`);
        await Activity.findOneAndUpdate(
          { phoneNumber: from },
          {
            $push: { messages: { role: 'user', content: incomingText } },
            $set:  { lastMessage: incomingText.substring(0,80), lastActive: new Date() },
            $inc:  { messageCount: 1 }
          }
        );
        return; // Bot stays silent — agent is handling
      }

      // Escalation keywords — auto-pause and alert
      const escalationWords = [
        'agent','human','manager','complaint','refund',
        'urgent','problem','انسان','شکایت','فوری','مسئلہ'
      ];
      if (escalationWords.some(w => incomingText.toLowerCase().includes(w))) {
        await sendTextMessage(from,
          'I understand you need immediate help. Connecting you with our team now.\n\n' +
          '📞 +92-300-1234567\n🕐 Mon–Sat, 9am–7pm PKT'
        );
        await Activity.findOneAndUpdate(
          { phoneNumber: from },
          {
            $push: { messages: { role: 'user', content: incomingText } },
            $set:  {
              isPaused:    true,
              pausedBy:    'auto-escalation',
              status:      'paused',
              lastMessage: incomingText.substring(0,80),
              lastActive:  new Date()
            },
            $inc: { messageCount: 1 }
          },
          { upsert: true }
        );
        return;
      }

      // Build conversation history for AI
      const history = (existing?.messages || [])
        .slice(-20)
        .map(m => ({
          role:    m.role === 'bot' ? 'assistant' : 'user',
          content: m.content
        }));

      // Get AI response
      const start   = Date.now();
      const aiReply = await getAIResponse(history, incomingText);
      const elapsed = Date.now() - start;

      // Save both messages to MongoDB — upsert creates record if new customer
      await Activity.findOneAndUpdate(
        { phoneNumber: from },
        {
          $push: { messages: { $each: [
            { role: 'user', content: incomingText },
            { role: 'bot',  content: aiReply }
          ]}},
          $set: {
            lastMessage:           aiReply.substring(0,80),
            lastActive:            new Date(),
            status:                'active',
            'metadata.responseTime': elapsed
          },
          $inc:        { messageCount: 2 },
          $setOnInsert: { firstSeen: new Date() }
        },
        { upsert: true, new: true }
      );

      await sendTextMessage(from, aiReply);
      console.log(`✅ Replied to ${from} in ${elapsed}ms`);

    } catch (err) {
      console.error('❌ Webhook error:', err.message);
    }
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
  status:  'running',
  bot:     'Umrah Travel Bot',
  ai:      process.env.AI_PROVIDER || 'gemini',
  uptime:  `${Math.floor(process.uptime())}s`
}));

// Serve dashboard for all other routes
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/frontend/index.html'));
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🕌  Umrah Travel Bot — STARTED');
  console.log(`🌐  Port: ${PORT}`);
  console.log(`🤖  AI: ${(process.env.AI_PROVIDER || 'gemini').toUpperCase()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});