# LEARNOVA BACKEND - SETUP GUIDE
**Phase 1 Deployment Instructions**

---

## QUICK START (5 minutes)

### 1. Clone Repository
```bash
cd ~
git clone https://github.com/learnovamy-hub/learnova-backend.git
cd learnova-backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment
```bash
cp .env.example .env
# Edit .env with your credentials (already pre-filled)
```

### 4. Setup Database (One-time)
```bash
# Open Supabase dashboard:
# https://supabase.com/dashboard/project/nxvbpanozswheackgwni

# Go to SQL Editor
# Copy entire content from database-schema.sql
# Paste into SQL Editor
# Click "Run"
# Wait 30 seconds for all tables to be created
```

### 5. Start Backend
```bash
npm run dev
```

You should see:
```
✅ Learnova Backend running on port 3000
📡 Health check: http://localhost:3000/health
🔐 API: http://localhost:3000/api
```

### 6. Test Backend
```bash
# In a new terminal
curl http://localhost:3000/health

# Response should be:
# {"status":"ok","timestamp":"2024-04-XX..."}
```

---

## DETAILED SETUP

### Prerequisites
- Node.js 16+ installed
- Supabase account (already created: nxvbpanozswheackgwni)
- Git installed

### Step 1: Create Repository on GitHub

You'll need to push code to GitHub. Follow this:

```bash
cd ~/learnova-backend
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/learnovamy-hub/learnova-backend.git
git push -u origin main
```

### Step 2: Database Setup (Critical)

**Go to:**
https://supabase.com/dashboard/project/nxvbpanozswheackgwni

**Click:** SQL Editor (left sidebar)

**Copy the entire `database-schema.sql` file** (provided in repo)

**Paste into editor** and click "Run"

**Expected output:**
```
CREATE EXTENSION
CREATE TABLE
CREATE TABLE
... (15 CREATE TABLE commands)
INSERT
INSERT ... (12 topic inserts)
ALTER TABLE ... (RLS policies)
```

**Verify tables created:**
```
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public';
```

You should see 15 tables.

### Step 3: Environment Variables

Create `.env` in project root:

```
SUPABASE_URL=https://nxvbpanozswheackgwni.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54dmJwYW5venN3aGVhY2tnd25pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0MTUwNzQsImV4cCI6MjA5MDk5MTA3NH0.mSazZDgFTHLyz2I8KnWtRkU0QqgmEkH7LGnE1_rldNA
JWT_SECRET=your_jwt_secret_key_change_this_in_production
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:19006
```

### Step 4: Install Dependencies

```bash
npm install
```

This installs:
- express (web framework)
- @supabase/supabase-js (database client)
- jsonwebtoken (JWT auth)
- bcryptjs (password hashing)
- cors (cross-origin requests)
- express-validator (input validation)

### Step 5: Run Locally

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

---

## API ENDPOINTS (Testing)

### Authentication

**Signup (Create Student):**
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "password123",
    "full_name": "John Doe",
    "role": "student",
    "school_name": "ABC School",
    "form_level": 4
  }'
```

**Expected response:**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid...",
    "email": "student@example.com",
    "full_name": "John Doe",
    "role": "student"
  }
}
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "password123"
  }'
```

**Get Current User (requires token):**
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGc..."
```

### Lessons

**Get All Topics:**
```bash
curl http://localhost:3000/api/lessons/topics
```

**Get Specific Topic:**
```bash
curl http://localhost:3000/api/lessons/topics/[topic-id]
```

**Get Lesson for Topic:**
```bash
curl http://localhost:3000/api/lessons/lessons/[topic-id]
```

### Quizzes

**Start Quiz:**
```bash
curl -X POST http://localhost:3000/api/quizzes/[quiz-id]/start \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json"
```

**Submit Quiz:**
```bash
curl -X POST http://localhost:3000/api/quizzes/attempts/[attempt-id]/submit \
  -H "Authorization: Bearer [token]" \
  -H "Content-Type: application/json" \
  -d '{
    "responses": [
      {
        "question_id": "uuid",
        "answer": "A",
        "time_spent_seconds": 30
      }
    ],
    "time_spent_seconds": 600
  }'
```

---

## TROUBLESHOOTING

### Error: "Missing Supabase credentials"
**Solution:** Check `.env` file has `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Error: "Cannot connect to database"
**Solution:** 
1. Verify Supabase project is running (check dashboard)
2. Check `.env` URL is correct
3. Try running database schema again

### Port 3000 already in use
**Solution:**
```bash
# Kill existing process
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm run dev
```

### JWT errors on protected routes
**Solution:** Make sure token is passed correctly:
```bash
Authorization: Bearer [your_token_here]
```

---

## DEPLOYMENT (For Later)

### Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Deploy
railway up
```

### Deploy to Render

Go to: https://render.com
1. Connect GitHub account
2. Click "New" → "Web Service"
3. Select `learnova-backend` repo
4. Set environment variables
5. Deploy

---

## NEXT: FLUTTER APP

Once backend is running locally, you can test it from Flutter app.

Flutter will connect to: `http://localhost:3000/api`

---

## SUPPORT

If something breaks:
1. Check error message carefully
2. Search for the error in this guide
3. Check Supabase dashboard for database errors
4. Verify all `.env` variables are correct
5. Try restarting: `npm run dev`

---

**Backend is ready. Next: Setup Flutter app.**
