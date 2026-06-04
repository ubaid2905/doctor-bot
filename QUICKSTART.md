# 🚀 Quick Start Guide

Get your Umrah Bot dashboard running in 5 minutes!

## Step 1: Install Dependencies

```bash
# Root directory
npm install

# Dashboard backend
cd dashboard/backend
npm install
cd ../..
```

## Step 2: Setup MongoDB

### Option A: Local MongoDB
```bash
# Install MongoDB if not already installed
# macOS: brew install mongodb-community
# Windows: Download from https://www.mongodb.com/try/download/community

# Start MongoDB
mongod
```

### Option B: MongoDB Atlas (Cloud - Recommended)
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free account and cluster
3. Copy connection string

## Step 3: Configure Environment

### Main Bot (.env in root)
```bash
WHATSAPP_VERIFY_TOKEN=test_token_12345
WHATSAPP_ACCESS_TOKEN=your_whatsapp_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_id
GOOGLE_API_KEY=your_google_key
MONGODB_URI=mongodb://localhost:27017/umrah-bot-dashboard
PORT=3000
```

### Dashboard (dashboard/backend/.env)
```bash
MONGODB_URI=mongodb://localhost:27017/umrah-bot-dashboard
JWT_SECRET=my-secret-key-12345
DASHBOARD_PORT=5000
```

## Step 4: Create First Admin User

```bash
# Option 1: Via Dashboard UI
1. Go to http://localhost:5000
2. Click "Sign Up"
3. Create account
4. Connect to MongoDB and run:

db.users.updateOne(
  { email: "your-email@example.com" },
  { $set: { role: "admin" } }
)
```

## Step 5: Run Everything!

**Terminal 1 - Main Bot:**
```bash
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2 - Dashboard Backend:**
```bash
cd dashboard/backend
npm run dev
# Runs on http://localhost:5000
```

**Terminal 3 - Open Dashboard:**
```bash
http://localhost:5000
```

## 📌 What You Can Do

### As Admin:
- ✅ See all user conversations
- ✅ View statistics and usage metrics
- ✅ Monitor bot performance
- ✅ Manage user accounts

### As Regular User:
- ✅ View your own chat history
- ✅ Link your WhatsApp number
- ✅ See your conversation stats

## 🔗 Linking Your WhatsApp Number

1. Login to dashboard
2. Click "Link WhatsApp"
3. Enter your phone number (with country code: +92...)
4. Any messages from this number will now appear in your activity log

## 🧪 Test the Bot

Send a message to your WhatsApp Business number!

Example messages:
- "Hello, how much does Umrah cost?"
- "What are the Umrah packages?"
- "I want to book a trip"

## 📊 View Activities

1. Admin: Dashboard → All Activity (see all conversations)
2. User: Dashboard → My Activity (see only your chats)

## 🐛 Need Help?

Check console logs:
- Bot not responding? Check GOOGLE_API_KEY
- Dashboard 500 error? Check MONGODB_URI
- Can't login? Ensure JWT_SECRET is set

## 📚 Full Documentation

See `dashboard/README.md` for detailed setup and troubleshooting.

---

**Everything working?** 🎉 You're all set!
