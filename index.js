// index.js — Doctor Bot + Dashboard
require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const path      = require('path');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const cron      = require('node-cron');
const PDFDoc    = require('pdfkit');

const { getAIResponse }   = require('./ai');
const { sendTextMessage } = require('./whatsapp');
const { Patient, Appointment, Availability } = require('./models');
const User = require('./dashboard/backend/models/User');
const KNOWLEDGE = require('./knowledge');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard/frontend')));

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    startSchedulers(); // start cron jobs after DB connects
  })
  .catch(err => { console.error('❌ MongoDB:', err.message); process.exit(1); });

const JWT_SECRET = process.env.JWT_SECRET || 'doctor_jwt_secret';

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token' });
  try {
    req.user = jwt.verify(h.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Admin only' });
  next();
}

// ── PDF Generator ─────────────────────────────────────────────────────────────
function generatePatientPDF(patient) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDoc({ margin: 50 });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).fillColor('#075e54')
       .text('PATIENT MEDICAL HISTORY', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#666')
       .text(`Generated: ${new Date().toLocaleString('en-PK')}`, { align: 'center' });
    
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#075e54');
    doc.moveDown();

    // Personal Info
    doc.fontSize(14).fillColor('#075e54').text('PERSONAL INFORMATION');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#111');
    doc.text(`Name:         ${patient.name || 'Not provided'}`);
    doc.text(`Age:          ${patient.age || 'Not provided'}`);
    doc.text(`Gender:       ${patient.gender || 'Not provided'}`);
    doc.text(`Blood Group:  ${patient.bloodGroup || 'Not provided'}`);
    doc.text(`Phone:        ${patient.phoneNumber}`);
    doc.text(`First Visit:  ${new Date(patient.firstSeen).toLocaleDateString('en-PK')}`);

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#ddd');
    doc.moveDown();

    // Symptoms
    doc.fontSize(14).fillColor('#075e54').text('PRESENTING SYMPTOMS');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#111');
    if (patient.symptoms?.length) {
      patient.symptoms.forEach(s => doc.text(`  • ${s}`));
    } else {
      doc.text('  Not recorded');
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#ddd');
    doc.moveDown();

    // Medical History
    doc.fontSize(14).fillColor('#075e54').text('MEDICAL HISTORY');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#111');
    doc.text('Existing Conditions:');
    if (patient.existingConditions?.length) {
      patient.existingConditions.forEach(c => doc.text(`  • ${c}`));
    } else { doc.text('  None reported'); }

    doc.moveDown(0.5);
    doc.text('Current Medications:');
    if (patient.currentMedication?.length) {
      patient.currentMedication.forEach(m => doc.text(`  • ${m}`));
    } else { doc.text('  None'); }

    doc.moveDown(0.5);
    doc.text('Allergies:');
    if (patient.allergies?.length) {
      patient.allergies.forEach(a => doc.text(`  • ${a}`));
    } else { doc.text('  None reported'); }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke('#ddd');
    doc.moveDown();

    // Appointment
    doc.fontSize(14).fillColor('#075e54').text('APPOINTMENT DETAILS');
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#111');
    if (patient.appointmentId) {
      doc.text(`Status: ${patient.status}`);
    } else {
      doc.text('No appointment booked yet');
    }

    doc.end();
  });
}

// ── Helper: get available slots for bot ──────────────────────────────────────
async function getAvailableSlotsText() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const availabilities = await Availability.find({
    date:   { $gte: today, $lte: nextWeek },
    isOpen: true
  }).sort({ date: 1 });

  if (!availabilities.length) {
    return 'No available slots in the next 7 days. Please check back later or call the clinic.';
  }

  let text = 'Available appointment slots:\n\n';
  availabilities.forEach(av => {
    const openSlots = av.slots.filter(s => !s.isBooked);
    if (openSlots.length) {
      text += `📅 ${av.dayLabel}\n`;
      openSlots.forEach(s => { text += `   ⏰ ${s.time}\n`; });
      text += '\n';
    }
  });
  text += 'Please reply with your preferred date and time.';
  return text;
}

// ── Helper: book a slot ───────────────────────────────────────────────────────
async function bookSlot(patient, chosenSlotText) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const availabilities = await Availability.find({
    date: { $gte: today, $lte: nextWeek }, isOpen: true
  });

  for (const av of availabilities) {
    for (const slot of av.slots) {
      if (!slot.isBooked && chosenSlotText.includes(slot.time)) {
        // Book the slot
        slot.isBooked     = true;
        slot.patientPhone = patient.phoneNumber;
        slot.patientName  = patient.name;
        await av.save();

        // Create appointment record
        const appt = await Appointment.create({
          patientPhone: patient.phoneNumber,
          patientName:  patient.name,
          date:         av.date,
          timeSlot:     slot.time,
          status:       'confirmed'
        });

        // Generate PDF
        const pdfBase64 = await generatePatientPDF(patient);

        // Update patient record
        await Patient.findOneAndUpdate(
          { phoneNumber: patient.phoneNumber },
          {
            $set: {
              appointmentId: appt._id,
              status:        'confirmed',
              pdfGenerated:  true,
              pdfData:       pdfBase64
            }
          }
        );

        return {
          success: true,
          date:    av.dayLabel,
          time:    slot.time,
          apptId:  appt._id
        };
      }
    }
  }
  return { success: false };
}

// ── Helper: extract patient info from conversation ────────────────────────────
function extractPatientInfo(messages) {
  const info = {
    symptoms: [], existingConditions: [],
    currentMedication: [], allergies: []
  };

  // Simple extraction — looks for answers after bot questions
  messages.forEach((msg, i) => {
    if (msg.role !== 'user') return;
    const prev = messages[i-1];
    if (!prev || prev.role !== 'bot') return;

    const q = prev.content.toLowerCase();
    const a = msg.content.trim();

    if (q.includes('full name'))
      info.name = a;
    else if (q.includes('how old'))
      info.age = parseInt(a) || a;
    else if (q.includes('gender'))
      info.gender = a;
    else if (q.includes('blood group'))
      info.bloodGroup = a;
    else if (q.includes('symptoms'))
      info.symptoms = [a];
    else if (q.includes('existing medical') || q.includes('conditions'))
      info.existingConditions = a.toLowerCase() === 'no' || a.toLowerCase() === 'none' ? [] : [a];
    else if (q.includes('medication'))
      info.currentMedication = a.toLowerCase() === 'no' || a.toLowerCase() === 'none' ? [] : [a];
    else if (q.includes('allergies'))
      info.allergies = a.toLowerCase() === 'no' || a.toLowerCase() === 'none' ? [] : [a];
  });

  return info;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SETUP ROUTE — create admin once
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/api/setup', async (req, res) => {
  try {
    const exists = await User.findOne({ role: 'admin' });
    if (exists) return res.status(400).json({ message: 'Admin already exists. Setup locked.' });
    const { username, password } = req.body;
    const admin = new User({ username, password, role: 'admin' });
    await admin.save();
    res.json({ message: `Admin "${username}" created. Setup locked.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username?.toLowerCase().trim() });
    if (!user || !user.isActive)
      return res.status(401).json({ message: 'Invalid credentials' });
    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    user.lastLogin = new Date(); await user.save();
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, username: user.username, role: user.role });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!(await user.comparePassword(currentPassword)))
      return res.status(401).json({ message: 'Current password wrong' });
    user.password = newPassword; await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEAM MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/api/team', requireAuth, requireAdmin, async (req, res) => {
  const agents = await User.find({ role: 'agent' }).select('-password').sort({ createdAt: -1 });
  res.json(agents);
});
app.post('/api/team', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body;
    const exists = await User.findOne({ username: username?.toLowerCase() });
    if (exists) return res.status(400).json({ message: 'Username taken' });
    const agent = new User({ username, password, role: 'agent', createdBy: req.user.username });
    await agent.save();
    res.json({ message: 'Agent created', username: agent.username });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
app.patch('/api/team/:username', requireAuth, requireAdmin, async (req, res) => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) return res.status(404).json({ message: 'Not found' });
  user.isActive = !user.isActive; await user.save();
  res.json({ isActive: user.isActive });
});
app.post('/api/team/:username/reset-password', requireAuth, requireAdmin, async (req, res) => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) return res.status(404).json({ message: 'Not found' });
  user.password = req.body.newPassword; await user.save();
  res.json({ message: 'Password reset successfully' });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const total         = await Patient.countDocuments();
    const todayAppts    = await Appointment.countDocuments({ date: { $gte: today, $lt: tomorrow }, status: 'confirmed' });
    const totalAppts    = await Appointment.countDocuments({ status: 'confirmed' });
    const pendingAppts  = await Appointment.countDocuments({ status: 'pending' });
    const newToday      = await Patient.countDocuments({ firstSeen: { $gte: today } });
    res.json({ total, todayAppts, totalAppts, pendingAppts, newToday });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PATIENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/api/patients', requireAuth, async (req, res) => {
  const patients = await Patient.find()
    .select('phoneNumber name age status lastActive messageCount firstSeen isPaused pdfGenerated')
    .sort({ lastActive: -1 });
  res.json(patients);
});

app.get('/api/patients/:phone', requireAuth, async (req, res) => {
  const p = await Patient.findOne({ phoneNumber: req.params.phone })
    .populate('appointmentId');
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  res.json(p);
});

// Download patient PDF
app.get('/api/patients/:phone/pdf', requireAuth, async (req, res) => {
  const p = await Patient.findOne({ phoneNumber: req.params.phone });
  if (!p?.pdfData) return res.status(404).json({ message: 'PDF not generated yet' });
  const buffer = Buffer.from(p.pdfData, 'base64');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${p.name || p.phoneNumber}-history.pdf"`);
  res.send(buffer);
});

// Regenerate PDF manually
app.post('/api/patients/:phone/generate-pdf', requireAuth, async (req, res) => {
  const p = await Patient.findOne({ phoneNumber: req.params.phone });
  if (!p) return res.status(404).json({ message: 'Patient not found' });
  const pdfBase64 = await generatePatientPDF(p);
  await Patient.findOneAndUpdate({ phoneNumber: req.params.phone }, {
    $set: { pdfGenerated: true, pdfData: pdfBase64 }
  });
  res.json({ message: 'PDF generated' });
});

// Pause/resume bot for patient
app.post('/api/patients/:phone/pause', requireAuth, async (req, res) => {
  await Patient.findOneAndUpdate({ phoneNumber: req.params.phone },
    { $set: { isPaused: true, pausedBy: req.user.username } });
  res.json({ ok: true });
});
app.post('/api/patients/:phone/resume', requireAuth, async (req, res) => {
  await Patient.findOneAndUpdate({ phoneNumber: req.params.phone },
    { $set: { isPaused: false, pausedBy: null } });
  res.json({ ok: true });
});

// Manual reply
app.post('/api/patients/:phone/reply', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    await sendTextMessage(req.params.phone, message);
    await Patient.findOneAndUpdate({ phoneNumber: req.params.phone }, {
      $push: { messages: { role: 'agent', content: message } },
      $set:  { lastMessage: message.substring(0,80), lastActive: new Date() },
      $inc:  { messageCount: 1 }
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// APPOINTMENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/api/appointments', requireAuth, async (req, res) => {
  const { date } = req.query;
  const filter = { status: { $in: ['confirmed', 'pending'] } };
  if (date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    filter.date = { $gte: d, $lt: next };
  }
  const appts = await Appointment.find(filter).sort({ date: 1, timeSlot: 1 });
  res.json(appts);
});

// Cancel appointment + notify all affected patients
app.post('/api/appointments/:id/cancel', requireAuth, async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id);
    if (!appt) return res.status(404).json({ message: 'Not found' });

    appt.status      = 'cancelled';
    appt.cancelledAt = new Date();
    appt.cancelledBy = req.user.username;
    appt.cancelReason = req.body.reason || 'Doctor unavailable';
    await appt.save();

    // Free the slot in availability
    await Availability.updateOne(
      { 'slots.patientPhone': appt.patientPhone },
      { $set: { 'slots.$.isBooked': false, 'slots.$.patientPhone': null, 'slots.$.patientName': null } }
    );

    // Update patient status
    await Patient.findOneAndUpdate(
      { phoneNumber: appt.patientPhone },
      { $set: { status: 'cancelled', appointmentId: null } }
    );

    // Notify patient via WhatsApp
    await sendTextMessage(appt.patientPhone,
      `Dear ${appt.patientName},\n\n` +
      `We regret to inform you that your appointment scheduled for:\n` +
      `📅 ${appt.date.toLocaleDateString('en-PK')}\n` +
      `⏰ ${appt.timeSlot}\n\n` +
      `has been cancelled due to: ${appt.cancelReason}\n\n` +
      `We sincerely apologize for the inconvenience.\n` +
      `Please reply to this message to reschedule your appointment.\n\n` +
      `For urgent matters, please call: ${process.env.CLINIC_PHONE || '+92-300-0000000'}`
    );

    res.json({ ok: true, message: 'Appointment cancelled and patient notified' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Cancel entire day — notify ALL patients that day
app.post('/api/availability/:date/cancel-day', requireAuth, requireAdmin, async (req, res) => {
  try {
    const date = new Date(req.params.date);
    date.setHours(0,0,0,0);
    const nextDay = new Date(date); nextDay.setDate(nextDay.getDate() + 1);

    // Get all appointments that day
    const appointments = await Appointment.find({
      date:   { $gte: date, $lt: nextDay },
      status: 'confirmed'
    });

    // Cancel all and notify each patient
    for (const appt of appointments) {
      appt.status = 'cancelled';
      appt.cancelledAt = new Date();
      appt.cancelledBy = req.user.username;
      appt.cancelReason = req.body.reason || 'Doctor unavailable today';
      await appt.save();

      await Patient.findOneAndUpdate(
        { phoneNumber: appt.patientPhone },
        { $set: { status: 'cancelled', appointmentId: null } }
      );

      await sendTextMessage(appt.patientPhone,
        `Dear ${appt.patientName},\n\n` +
        `Your appointment on ${date.toLocaleDateString('en-PK')} at ${appt.timeSlot} ` +
        `has been cancelled.\n\n` +
        `Reason: ${req.body.reason || 'Doctor unavailable'}\n\n` +
        `Please reply to reschedule. We apologize for the inconvenience.\n\n` +
        `📞 ${process.env.CLINIC_PHONE || 'Call clinic for urgent matters'}`
      );

      await new Promise(r => setTimeout(r, 1500)); // avoid rate limits
    }

    // Mark day as closed in availability
    await Availability.findOneAndUpdate(
      { date: { $gte: date, $lt: nextDay } },
      { $set: { isOpen: false } }
    );

    res.json({ ok: true, cancelled: appointments.length, message: `${appointments.length} patients notified` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AVAILABILITY MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/api/availability', requireAuth, async (req, res) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const nextMonth = new Date(today); nextMonth.setDate(nextMonth.getDate() + 30);
  const avails = await Availability.find({
    date: { $gte: today, $lte: nextMonth }
  }).sort({ date: 1 });
  res.json(avails);
});

// Set availability for a date — generates 30-min slots automatically
app.post('/api/availability', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { date, startTime, endTime, isOpen } = req.body;
    const d = new Date(date); d.setHours(0,0,0,0);

    // Generate 30-min slots between startTime and endTime
    const slots = [];
    if (isOpen) {
      const [startH, startM] = parseTime(startTime);
      const [endH, endM]     = parseTime(endTime);
      let current = startH * 60 + startM;
      const end   = endH * 60 + endM;
      while (current + 30 <= end) {
        slots.push({ time: formatTime(current), isBooked: false });
        current += 30;
      }
    }

    const dayLabel = d.toLocaleDateString('en-PK', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const avail = await Availability.findOneAndUpdate(
      { date: d },
      { $set: { date: d, dayLabel, isOpen: isOpen !== false, startTime, endTime, slots } },
      { upsert: true, new: true }
    );

    res.json(avail);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── Time helpers ──────────────────────────────────────────────────────────────
function parseTime(timeStr) {
  // Parses "09:00 AM" or "14:00" format
  if (!timeStr) return [9, 0];
  const upper = timeStr.toUpperCase();
  const isPM  = upper.includes('PM');
  const [h, m] = timeStr.replace(/[APM ]/gi, '').split(':').map(Number);
  let hours = h;
  if (isPM && h !== 12) hours += 12;
  if (!isPM && h === 12) hours = 0;
  return [hours, m || 0];
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2,'0')} ${suffix}`;
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'running', bot: 'Doctor Bot' }));

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/frontend/index.html'));
});
 // WHATSAPP WEBHOOK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else { res.sendStatus(403); }
});

const processedMessages = new Set();

app.post('/webhook', (req, res) => {
  res.sendStatus(200);
  setImmediate(async () => {
    try {
      const body = req.body;
      if (!body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) return;
      const message = body.entry[0].changes[0].value.messages[0];
      const from    = message.from;

      if (processedMessages.has(message.id)) return;
      processedMessages.add(message.id);
      setTimeout(() => processedMessages.delete(message.id), 10 * 60 * 1000);

      if (message.type !== 'text') {
        await sendTextMessage(from, 'Please send text messages only 😊');
        return;
      }

      const text = message.text.body.trim();
      console.log(`📩 From ${from}: "${text}"`);

      // Get or create patient record
      let patient = await Patient.findOne({ phoneNumber: from });
      if (!patient) {
        patient = await Patient.create({ phoneNumber: from });
      }

      // If agent paused — save silently
      if (patient.isPaused) {
        await Patient.findOneAndUpdate({ phoneNumber: from }, {
          $push: { messages: { role: 'user', content: text } },
          $set:  { lastMessage: text.substring(0,80), lastActive: new Date() },
          $inc:  { messageCount: 1 }
        });
        return;
      }

      // Escalation check
      const escalation = ['human','agent','doctor','urgent','complaint','مسئلہ','فوری'];
      if (escalation.some(w => text.toLowerCase().includes(w))) {
        await sendTextMessage(from,
          'Connecting you with our clinic staff immediately.\n\n' +
          `📞 ${process.env.CLINIC_PHONE || 'Please call the clinic directly'}`
        );
        await Patient.findOneAndUpdate({ phoneNumber: from }, {
          $push: { messages: { role: 'user', content: text } },
          $set:  { isPaused: true, pausedBy: 'auto-escalation',
                   lastMessage: text.substring(0,80), lastActive: new Date() },
          $inc:  { messageCount: 1 }
        });
        return;
      }

      // Build history for AI
      const history = (patient.messages || []).slice(-30).map(m => ({
        role:    m.role === 'bot' ? 'assistant' : 'user',
        content: m.content
      }));

      // Get AI reply
      let aiReply = await getAIResponse(history, text);

      // Check for special commands in AI reply
      if (aiReply.includes('SHOW_SLOTS')) {
        const slotsText = await getAvailableSlotsText();
        aiReply = aiReply.replace('SHOW_SLOTS', slotsText);
      }

      if (aiReply.includes('BOOK_SLOT:')) {
        const slotMatch = aiReply.match(/BOOK_SLOT:(.+)/);
        if (slotMatch) {
          const chosenSlot = slotMatch[1].trim();
          
          // Extract patient info from conversation
          const info = extractPatientInfo([...history, { role: 'user', content: text }]);
          
          // Update patient record with extracted info
          await Patient.findOneAndUpdate({ phoneNumber: from }, { $set: info });
          const updatedPatient = await Patient.findOne({ phoneNumber: from });
          
          const booking = await bookSlot(updatedPatient, chosenSlot);
          if (booking.success) {
            aiReply = aiReply.replace(/BOOK_SLOT:.+/, '').trim();
          } else {
            aiReply = 'Sorry, that slot is no longer available. Let me show you other options.\n\n' +
                      await getAvailableSlotsText();
          }
        }
      }

      // Save messages
      await Patient.findOneAndUpdate(
        { phoneNumber: from },
        {
          $push: { messages: { $each: [
            { role: 'user', content: text },
            { role: 'bot',  content: aiReply }
          ]}},
          $set: { lastMessage: aiReply.substring(0,80), lastActive: new Date() },
          $inc: { messageCount: 2 }
        }
      );

      await sendTextMessage(from, aiReply);
      console.log(`✅ Replied to ${from}`);

    } catch (err) {
      console.error('❌ Webhook error:', err.message);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCHEDULED JOBS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function startSchedulers() {
  // Run every day at 9 AM — send appointment reminders
  cron.schedule('0 9 * * *', async () => {
    console.log('🔔 Running appointment reminder check...');
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0,0,0,0);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const appointments = await Appointment.find({
        date:         { $gte: tomorrow, $lt: dayAfter },
        status:       'confirmed',
        reminderSent: false
      });

      for (const appt of appointments) {
        await sendTextMessage(appt.patientPhone,
          `Appointment Reminder 🏥\n\n` +
          `Dear ${appt.patientName},\n\n` +
          `This is a reminder that you have an appointment tomorrow:\n\n` +
          `📅 ${appt.date.toLocaleDateString('en-PK', { weekday:'long', month:'long', day:'numeric' })}\n` +
          `⏰ ${appt.timeSlot}\n` +
          `💰 Fee: PKR ${process.env.CONSULTATION_FEE || '1000'}\n\n` +
          `Please remember to bring:\n` +
          `• Any previous prescriptions\n` +
          `• Previous test reports\n` +
          `• Your CNIC\n\n` +
          `To cancel, reply with 'cancel'\n` +
          `JazakAllah Khair! 🤲`
        );
        appt.reminderSent = true;
        await appt.save();
        await new Promise(r => setTimeout(r, 2000));
      }
      console.log(`📤 Reminders sent: ${appointments.length}`);
    } catch (err) {
      console.error('Reminder error:', err.message);
    }
  });
}

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏥  Doctor Bot — STARTED');
  console.log(`🌐  Port: ${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});