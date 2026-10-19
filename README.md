# ☁️ CloudStore — Cloud-Based File Storage Management System

A full-stack mini project with JWT authentication, file upload/download/delete, and a modern dashboard UI.

---

## 📂 Project Structure

```
cloud/
├── backend/
│   ├── middleware/
│   │   └── auth.js          # JWT verification middleware
│   ├── models/
│   │   ├── User.js          # User schema
│   │   └── File.js          # File metadata schema
│   ├── routes/
│   │   ├── auth.js          # /register, /login
│   │   └── files.js         # /upload, /files, /download/:id, /:id DELETE
│   ├── .env                 # Environment variables
│   ├── package.json
│   └── server.js            # Express app entry point
├── frontend/
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── auth.js              # Shared utilities (toast, token, logout)
│   ├── dashboard.js         # Dashboard logic
│   └── style.css            # All styles
├── uploads/                 # Stored files (auto-created)
└── README.md
```

---

## 🛠️ Prerequisites

- [Node.js](https://nodejs.org/) v16+
- [MongoDB](https://www.mongodb.com/try/download/community) (local) OR [MongoDB Atlas](https://www.mongodb.com/atlas) (cloud)

---

## ⚙️ Setup Instructions

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment Variables

Edit `backend/.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/cloudStorage
JWT_SECRET=your_super_secret_key_change_this
```

> For MongoDB Atlas, replace MONGO_URI with your Atlas connection string.

### 3. Start MongoDB

If using local MongoDB:
```bash
# Windows
net start MongoDB

# macOS/Linux
sudo systemctl start mongod
```

### 4. Start the Backend Server

```bash
cd backend
npm run dev       # with nodemon (auto-restart)
# OR
npm start         # without nodemon
```

You should see:
```
✅ MongoDB connected
🚀 Server running on http://localhost:5000
```

### 5. Open the Frontend

Open `frontend/login.html` directly in your browser.

> **Tip:** Use VS Code Live Server extension for a better experience.

---

## 🔗 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | ❌ | Register new user |
| POST | `/api/auth/login` | ❌ | Login & get JWT |
| POST | `/api/files/upload` | ✅ | Upload a file |
| GET | `/api/files` | ✅ | Get all user files |
| GET | `/api/files/download/:id` | ✅ | Download a file |
| DELETE | `/api/files/:id` | ✅ | Delete a file |

---

## ✅ Features

- JWT authentication with bcrypt password hashing
- Strong password validation + live strength indicator
- Remember Me (localStorage vs sessionStorage)
- File upload with drag & drop + progress bar
- File type validation (PDF, JPG, PNG only)
- 5MB file size limit
- Real-time search + sort (name, date, size)
- Pagination (7 files per page)
- Download, View (new tab), Delete with confirmation
- Dashboard stats: total files, storage used, recent upload
- Toast notifications for all actions
- Mobile responsive sidebar

---

## 🔐 Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%...)

---

## 🧪 Test Credentials (after registering)

Register at `register.html` with any valid email and strong password, then login at `login.html`.
