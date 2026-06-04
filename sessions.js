// sessions.js
// Stores conversation history per customer phone number

const sessions = new Map();

// How many messages to remember per customer
const MAX_HISTORY = 20;

// Clear sessions after 24 hours of no activity
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// Get or create a session for a phone number
function getSession(phoneNumber) {
  if (!sessions.has(phoneNumber)) {
    // First time this customer messages us
    sessions.set(phoneNumber, {
      history: [],         // array of { role, content } objects
      lastActive: Date.now(),
      isNew: true
    });
  }

  const session = sessions.get(phoneNumber);
  session.lastActive = Date.now();
  return session;
}

// Add a message to a customer's history
function addToHistory(phoneNumber, role, content) {
  const session = getSession(phoneNumber);

  session.history.push({ role, content });

  // If history gets too long, remove oldest messages
  // but always keep the first 2 (greeting exchange)
  if (session.history.length > MAX_HISTORY) {
    const overflow = session.history.length - MAX_HISTORY;
    session.history.splice(2, overflow);
  }

  // Mark as no longer new after first exchange
  if (session.history.length >= 2) {
    session.isNew = false;
  }
}

// Clean up sessions that have been inactive for 24+ hours
// Runs automatically every hour
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [phone, session] of sessions.entries()) {
    if (now - session.lastActive > SESSION_TIMEOUT_MS) {
      sessions.delete(phone);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleared ${cleaned} inactive session(s)`);
  }
}, 60 * 60 * 1000);

module.exports = { getSession, addToHistory };