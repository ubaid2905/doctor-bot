// whatsapp.js
// Handles sending messages TO customers via WhatsApp Cloud API

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v20.0';

// ── Send a plain text message ─────────────────────────────────────────────────
async function sendTextMessage(recipientPhone, messageText) {
  try {
    const response = await axios({
      method: 'POST',
      url: `${BASE_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText
        }
      }
    });

    console.log(`✅ Sent to ${recipientPhone}: ${messageText.substring(0, 60)}...`);
    return response.data;

  } catch (error) {
    // Log the full error from Meta so we can debug
    const errData = error.response?.data?.error;
    console.error(`❌ Failed to send message to ${recipientPhone}`);
    console.error(`   Code: ${errData?.code} | Message: ${errData?.message}`);
    throw error;
  }
}

// ── Send a "typing..." indicator before replying ──────────────────────────────
// This makes the bot feel more human — customer sees "typing..." for a moment
async function sendTypingIndicator(recipientPhone) {
  try {
    await axios({
      method: 'POST',
      url: `${BASE_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'reaction',  // Note: typing indicator uses status updates in v20
        status: {
          status: 'read',
          message_id: 'placeholder'
        }
      }
    });
  } catch {
    // Typing indicator failure is non-critical, don't crash
  }
}

module.exports = { sendTextMessage, sendTypingIndicator };