// models.js
const mongoose = require('mongoose');

// ── Patient History ───────────────────────────────────────────────────────────
const patientSchema = new mongoose.Schema({
  phoneNumber:   { type: String, required: true, unique: true },
  
  // Personal info collected by bot
  name:          String,
  age:           Number,
  gender:        String,
  bloodGroup:    String,
  
  // Medical history collected by bot
  symptoms:          [String],
  existingConditions:[String],
  currentMedication: [String],
  allergies:         [String],
  
  // Appointment
  appointmentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  
  // Conversation
  messages: [{
    role:      { type: String, enum: ['user', 'bot', 'agent'] },
    content:   String,
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['collecting-history', 'selecting-slot', 'confirmed', 'completed', 'cancelled'],
    default: 'collecting-history'
  },
  
  isPaused:     { type: Boolean, default: false },
  pausedBy:     String,
  lastMessage:  String,
  messageCount: { type: Number, default: 0 },
  lastActive:   { type: Date, default: Date.now },
  firstSeen:    { type: Date, default: Date.now },
  
  // PDF
  pdfGenerated: { type: Boolean, default: false },
  pdfData:      String, // base64 encoded PDF stored in DB
  
  followUpSent:   { type: Boolean, default: false },
  reminderSent:   { type: Boolean, default: false }
});

// ── Appointment ───────────────────────────────────────────────────────────────
const appointmentSchema = new mongoose.Schema({
  patientPhone:  { type: String, required: true },
  patientName:   String,
  date:          { type: Date, required: true },
  timeSlot:      { type: String, required: true }, // e.g. "10:00 AM"
  duration:      { type: Number, default: 30 },    // minutes
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'rescheduled'],
    default: 'confirmed'
  },
  cancelledAt:     Date,
  cancelledBy:     String,
  cancelReason:    String,
  rescheduledFrom: Date,
  reminderSent:    { type: Boolean, default: false },
  createdAt:       { type: Date, default: Date.now }
});

// ── Doctor Availability ───────────────────────────────────────────────────────
const availabilitySchema = new mongoose.Schema({
  date:      { type: Date, required: true, unique: true },
  dayLabel:  String, // "Monday, June 10"
  isOpen:    { type: Boolean, default: true },
  startTime: { type: String, default: '09:00 AM' },
  endTime:   { type: String, default: '05:00 PM' },
  slotDuration: { type: Number, default: 30 }, // minutes
  
  // Generated slots
  slots: [{
    time:      String,       // "09:00 AM"
    isBooked:  Boolean,
    patientPhone: String,
    patientName:  String
  }]
});

const Patient      = mongoose.model('Patient',      patientSchema);
const Appointment  = mongoose.model('Appointment',  appointmentSchema);
const Availability = mongoose.model('Availability', availabilitySchema);

module.exports = { Patient, Appointment, Availability };