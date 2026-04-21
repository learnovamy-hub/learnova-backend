# Learnova Backend

**AI-Powered Tutoring Platform for Form 4 Mathematics**

- 🎓 Student lessons + quizzes
- 👨‍🏫 Teacher pedagogy integration
- 👨‍👩‍👧‍👦 Parent progress dashboard
- 🤖 Claude API for lesson generation
- 🎯 Real-time progress tracking

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/learnovamy-hub/learnova-backend.git
cd learnova-backend

# 2. Install
npm install

# 3. Setup database (see SETUP_GUIDE.md)

# 4. Run
npm run dev

# 5. Test
curl http://localhost:3000/health
```

See `SETUP_GUIDE.md` for complete instructions.

---

## Architecture

```
Student/Parent/Teacher App
        ↓
Express API (Node.js)
        ↓
Supabase (PostgreSQL)
        ↓
Claude API (Lesson Generation)
```

**Routes:**
- `POST /api/auth/signup` — Register user
- `POST /api/auth/login` — Login
- `GET /api/lessons/topics` — Get all topics
- `GET /api/lessons/lessons/:topicId` — Get lesson
- `POST /api/quizzes/:quizId/start` — Start quiz
- `POST /api/quizzes/attempts/:attemptId/submit` — Submit quiz

---

## Environment Variables

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
JWT_SECRET=...
PORT=3000
CORS_ORIGIN=http://localhost:19006
```

---

## Database Schema

**Tables (15 total):**
- users, students, teachers
- subjects, topics
- lessons, quizzes, questions
- quiz_attempts, question_responses
- topic_progress, app_sessions
- teacher_pedagogies, teacher_materials
- parent_dashboard_data

**RLS policies enabled** for secure row-level access.

---

## Testing

### Create a student and login:

```bash
# Signup
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@test.com",
    "password": "password123",
    "full_name": "Test Student",
    "role": "student",
    "form_level": 4
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@test.com",
    "password": "password123"
  }'
```

---

## Project Structure

```
learnova-backend/
├── src/
│   ├── app.js (Main Express app)
│   ├── config/
│   │   ├── database.js (Supabase client + helpers)
│   │   └── auth.js (JWT + password hashing)
│   └── routes/
│       ├── auth.js (Login/signup/profiles)
│       ├── lessons.js (Topics, lessons, sessions)
│       └── quizzes.js (Quizzes, scoring, progress)
├── package.json
├── .env.example
├── database-schema.sql
└── SETUP_GUIDE.md
```

---

## Technologies

- **Express.js** — REST API framework
- **Supabase** — PostgreSQL database
- **JWT** — Authentication tokens
- **bcryptjs** — Password hashing
- **CORS** — Cross-origin requests

---

## Next Steps

1. ✅ Backend running locally
2. → Create Flutter app (frontend)
3. → Teacher material capture (Google Form)
4. → Claude API integration (lesson generation)
5. → Deployment to production

---

## Support

See `SETUP_GUIDE.md` for troubleshooting and detailed instructions.

---

**Phase 1: ✅ COMPLETE**

Backend ready. Next: Flutter app + database deployment.
