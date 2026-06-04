// dashboard/backend/routes/users.js
const express = require('express');
const User = require('../models/User');
const UserPhoneMapping = require('../models/UserPhoneMapping');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin only)
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const users = await User.find({ isActive: true })
      .select('-password')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments({ isActive: true });

    res.json({
      users,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Map phone number to user
router.post('/map-phone', protect, async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    // Check if phone number is already mapped
    const existing = await UserPhoneMapping.findOne({ phoneNumber });
    if (existing) {
      return res.status(400).json({ message: 'Phone number already mapped' });
    }

    const mapping = new UserPhoneMapping({
      userId: req.user.id,
      phoneNumber
    });

    await mapping.save();

    res.status(201).json({
      message: 'Phone number mapped successfully',
      mapping
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user's mapped phone numbers
router.get('/my-phones', protect, async (req, res) => {
  try {
    const mappings = await UserPhoneMapping.find({ userId: req.user.id });
    res.json({ phoneNumbers: mappings.map(m => m.phoneNumber) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create admin user (admin only)
router.post('/create-admin', protect, adminOnly, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const user = new User({
      username,
      email,
      password,
      role: 'admin'
    });

    await user.save();

    res.status(201).json({
      message: 'Admin user created',
      user: { id: user._id, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
