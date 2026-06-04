// dashboard/backend/routes/activity.js
const express = require('express');
const Activity = require('../models/Activity');
const UserPhoneMapping = require('../models/UserPhoneMapping');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// Get user's own activity
router.get('/my-activity', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // Find phone numbers associated with this user
    const mappings = await UserPhoneMapping.find({ userId: req.user.id });
    const phoneNumbers = mappings.map(m => m.phoneNumber);

    if (phoneNumbers.length === 0) {
      return res.json({ activities: [], total: 0, pages: 0 });
    }

    const activities = await Activity.find({ phoneNumber: { $in: phoneNumbers } })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Activity.countDocuments({ phoneNumber: { $in: phoneNumbers } });

    res.json({
      activities,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all activities (admin only)
router.get('/all', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 50, phoneNumber, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    if (phoneNumber) {
      query.phoneNumber = phoneNumber;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const activities = await Activity.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Activity.countDocuments(query);

    res.json({
      activities,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get specific user's activity (admin only)
router.get('/user/:phoneNumber', protect, adminOnly, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const activities = await Activity.find({ phoneNumber: req.params.phoneNumber })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Activity.countDocuments({ phoneNumber: req.params.phoneNumber });

    // Get user stats
    const stats = await Activity.aggregate([
      { $match: { phoneNumber: req.params.phoneNumber } },
      {
        $group: {
          _id: null,
          totalMessages: { $sum: 1 },
          avgResponseTime: { $avg: '$metadata.responseTime' }
        }
      }
    ]);

    res.json({
      activities,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      stats: stats[0] || { totalMessages: 0, avgResponseTime: 0 }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Log activity (called by main bot)
router.post('/log', async (req, res) => {
  try {
    const { phoneNumber, userMessage, botResponse, responseTime, tokenCount } = req.body;

    const activity = new Activity({
      phoneNumber,
      userMessage,
      botResponse,
      metadata: {
        responseTime,
        tokenCount
      }
    });

    await activity.save();
    res.status(201).json({ message: 'Activity logged' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get dashboard stats (admin only)
router.get('/stats/overview', protect, adminOnly, async (req, res) => {
  try {
    const stats = await Activity.aggregate([
      {
        $group: {
          _id: null,
          totalInteractions: { $sum: 1 },
          uniqueUsers: { $addToSet: '$phoneNumber' }
        }
      },
      {
        $project: {
          totalInteractions: 1,
          uniqueUsersCount: { $size: '$uniqueUsers' }
        }
      }
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await Activity.countDocuments({
      timestamp: { $gte: today }
    });

    res.json({
      totalInteractions: stats[0]?.totalInteractions || 0,
      uniqueUsers: stats[0]?.uniqueUsersCount || 0,
      todayInteractions: todayStats,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
