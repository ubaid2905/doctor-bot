// dashboard/backend/models/Activity.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'bot', 'agent'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const activitySchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true, index: true },
  
  // Full conversation thread — every message from both sides
  messages: [messageSchema],

  // Agent takeover
  isPaused:    { type: Boolean, default: false },  // true = bot paused, agent handling
  pausedBy:    { type: String },                   // which agent paused it
  pausedAt:    { type: Date },

  // Quick stats
  messageCount:   { type: Number, default: 0 },
  lastMessage:    { type: String },                // preview of last message
  lastActive:     { type: Date, default: Date.now },
  firstSeen:      { type: Date, default: Date.now },

  // Customer info (agents can fill this in)
  customerName:   { type: String },
  status: {
    type: String,
    enum: ['new', 'active', 'paused', 'resolved'],
    default: 'new'
  },

  metadata: {
    responseTime: Number,
    tokenCount:   Number
  }
});

activitySchema.index({ phoneNumber: 1, lastActive: -1 });

module.exports = mongoose.model('Activity', activitySchema);