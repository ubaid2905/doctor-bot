// dashboard/backend/models/UserPhoneMapping.js
const mongoose = require('mongoose');

const userPhoneMappingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('UserPhoneMapping', userPhoneMappingSchema);
