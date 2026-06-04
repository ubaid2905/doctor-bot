# Umrah Bot Dashboard Setup Guide

Complete guide to setting up the Umrah Bot with MongoDB activity logging and admin dashboard.

## 📋 Prerequisites

- Node.js (v14+)
- MongoDB (local or Atlas cloud)
- WhatsApp Business API credentials
- Google Generative AI API key (for the bot)

## 🚀 Installation

### 1. Install Main Bot Dependencies

```bash
cd umrah-bot-main
npm install
```

### 2. Install Dashboard Backend Dependencies

```bash
cd dashboard/backend
npm install
```

### 3. Configure Environment Variables

#### Main Bot `.env` file (in root directory)
```
# WhatsApp Config
WHATSAPP_VERIFY_TOKEN=your_verify_token
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# AI Provider
AI_PROVIDER=gemini
GOOGLE_API_KEY=your_google_api_key

# MongoDB (for activity logging)
MONGODB_URI=mongodb://localhost:27017/umrah-bot-dashboard
# OR for MongoDB Atlas
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/umrah-bot-dashboard

# Port
PORT=3000
```

#### Dashboard `.env` file (in dashboard/backend directory)
```
# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/umrah-bot-dashboard
# OR for MongoDB Atlas
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/umrah-bot-dashboard

# JWT Secret for authentication
JWT_SECRET=your_super_secret_jwt_key_change_this!

# Dashboard Port
DASHBOARD_PORT=5000
```

## 🏃 Running the Application

### Development Mode

**Terminal 1: Start the Main Bot**
```bash
npm run dev
```

**Terminal 2: Start the Dashboard Backend**
```bash
cd dashboard/backend
npm run dev
```

Access the dashboard at: `http://localhost:5000`

### Production Mode

```bash
npm start
cd dashboard/backend && npm start
```

## 👤 User Roles & Features

### Admin Users
- 📊 View overview statistics
- 📋 See all user activity and conversations
- 👥 Manage user accounts
- 🔍 Filter activities by phone number and date range
- 📈 View user engagement metrics

### Regular Users
- 📋 View only their own chatbot conversations
- 📱 Link WhatsApp numbers to their account
- 📊 Track their interaction history

## 🔑 Initial Setup

### 1. Create First Admin User

Use MongoDB client or:

```bash
# Using MongoDB shell
db.users.insertOne({
  username: "admin",
  email: "admin@example.com",
  password: "$2a$10$...", // bcrypted password - use the registration endpoint instead!
  role: "admin",
  isActive: true,
  createdAt: new Date()
})
```

**Better approach:** Use the registration endpoint and then manually update the role:

1. Register an account via dashboard UI
2. Connect to MongoDB
3. Update the user role:
```bash
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

### 2. Create Regular Users

Users can self-register through the dashboard signup form.

### 3. Link WhatsApp Numbers

Users must:
1. Login to dashboard
2. Go to "Link WhatsApp" section
3. Enter their WhatsApp phone number (with country code, e.g., +92)
4. Their conversations will now be tracked in the dashboard

## 📊 Database Schema

### User Collection
```
{
  _id: ObjectId,
  username: string (unique),
  email: string (unique),
  password: string (bcrypted),
  role: "admin" | "user",
  phoneNumber: string (optional),
  createdAt: Date,
  lastLogin: Date,
  isActive: boolean
}
```

### Activity Collection
```
{
  _id: ObjectId,
  phoneNumber: string,
  userMessage: string,
  botResponse: string,
  timestamp: Date,
  sessionId: string (optional),
  messageType: "text" | "image" | "document",
  metadata: {
    responseTime: number (ms),
    tokenCount: number (optional)
  }
}
```

### UserPhoneMapping Collection
```
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  phoneNumber: string (unique),
  createdAt: Date
}
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Activity Logging
- `POST /api/activity/log` - Log bot activity
- `GET /api/activity/my-activity` - Get user's activity (protected)
- `GET /api/activity/all` - Get all activities (admin only)
- `GET /api/activity/user/:phoneNumber` - Get specific user activity (admin only)
- `GET /api/activity/stats/overview` - Get dashboard stats (admin only)

### Users
- `GET /api/users` - Get all users (admin only)
- `POST /api/users/map-phone` - Map phone number to user (protected)
- `GET /api/users/my-phones` - Get user's mapped phones (protected)
- `POST /api/users/create-admin` - Create admin user (admin only)

## 🐛 Troubleshooting

### MongoDB Connection Error
- Ensure MongoDB is running: `mongod` (local) or check Atlas connection string
- Verify connection string in `.env`
- Check firewall/network access

### Dashboard Not Loading
- Ensure dashboard backend is running on correct port
- Check browser console for errors
- Verify JWT_SECRET is set in `.env`

### Activities Not Logging
- Check MongoDB connection is established
- Verify MONGODB_URI in main bot `.env`
- Check bot console for "Connected to MongoDB" message

### Authentication Issues
- Clear browser localStorage: `localStorage.clear()`
- Verify JWT_SECRET matches in dashboard backend
- Check token expiration (default 7 days)

## 📁 Project Structure

```
umrah-bot-main/
├── index.js                      # Main bot server
├── ai.js                        # AI response logic
├── whatsapp.js                  # WhatsApp API integration
├── sessions.js                  # Session management
├── knowledge.js                 # Knowledge base
├── package.json
├── .env                         # Configuration
└── dashboard/
    ├── backend/
    │   ├── server.js            # Dashboard API server
    │   ├── package.json
    │   ├── .env                 # Dashboard configuration
    │   ├── models/
    │   │   ├── User.js
    │   │   ├── Activity.js
    │   │   └── UserPhoneMapping.js
    │   ├── middleware/
    │   │   └── auth.js          # JWT authentication
    │   └── routes/
    │       ├── auth.js          # Authentication endpoints
    │       ├── activity.js      # Activity endpoints
    │       └── users.js         # User management endpoints
    └── frontend/
        ├── index.html           # Dashboard UI
        ├── app.js               # Frontend logic
        └── style.css            # Styling
```

## 🔐 Security Recommendations

1. **Change JWT_SECRET** to a strong random string
2. **Use HTTPS** in production
3. **Enable MongoDB authentication** with strong passwords
4. **Use MongoDB Atlas** for cloud hosting instead of public MongoDB
5. **Set appropriate CORS policies** in production
6. **Implement rate limiting** for API endpoints
7. **Regular backups** of MongoDB data
8. **Monitor logs** for suspicious activities

## 📞 Support

For issues or questions, check the console logs and ensure all services are running properly.

---

**Last Updated**: May 2026
