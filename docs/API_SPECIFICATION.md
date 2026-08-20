# API_SPECIFICATION.md — Phase 15: Backend Foundation

> **توثيق API الكامل لمنصة CMS**. يحدد كل الـ endpoints، الـ request/response formats، الـ authentication، والـ error handling.

**المرحلة**: Phase 15
**الحالة**: ✅ Completed
**تاريخ الإنجاز**: 2026-07-31
**Base URL**: `https://api.cms.example.com/api/v1`

---

## جدول المحتويات

1. [نظرة عامة على API](#1-نظرة-عامة)
2. [المصادقة (Authentication)](#2-المصادقة)
3. [الـ Endpoints - Auth](#3-auth-endpoints)
4. [الـ Endpoints - Students](#4-students-endpoints)
5. [الـ Endpoints - Academic Hierarchy](#5-academic-endpoints)
6. [الـ Endpoints - Questions](#6-questions-endpoints)
7. [الـ Endpoints - Exams](#7-exams-endpoints)
8. [الـ Endpoints - Library](#8-library-endpoints)
9. [الـ Endpoints - Subscriptions](#9-subscriptions-endpoints)
10. [الـ Endpoints - Search](#10-search-endpoints)
11. [الـ Endpoints - Favorites](#11-favorites-endpoints)
12. [الـ Endpoints - Notifications](#12-notifications-endpoints)
13. [الـ Endpoints - Leaderboard](#13-leaderboard-endpoints)
14. [الـ Endpoints - Admin](#14-admin-endpoints)
15. [نماذج الـ Response](#15-response-models)
16. [Error Handling](#16-error-handling)
17. [Rate Limiting](#17-rate-limiting)

---

## 1. نظرة عامة

### 1.1 المبادئ

- **RESTful**: أسماء موارد، أفعال HTTP.
- **Versioned**: `/api/v1/...`
- **JSON Only**: `Content-Type: application/json`.
- **UTC Timestamps**: جميع التواريخ بصيغة ISO 8601 UTC.
- **UUID IDs**: جميع المعرفات UUID v4.
- **Pagination**: `?page=1&pageSize=20`.
- **Problem Details**: الأخطاء بصيغة RFC 7807.

### 1.2 Base URL

```
Production:  https://api.cms.example.com/api/v1
Staging:     https://api-staging.cms.example.com/api/v1
Development: http://localhost:8080/api/v1
```

### 1.3 Common Headers

| Header | القيمة | مطلوب |
|--------|--------|------|
| `Authorization` | `Bearer <access_token>` | نعم (للـ endpoints المحمية) |
| `Content-Type` | `application/json` | نعم (لـ POST/PUT/PATCH) |
| `Accept-Language` | `ar` | اختياري (افتراضي: ar) |
| `X-Device-Fingerprint` | `<fingerprint>` | نعم (للطلاب) |
| `X-Request-ID` | `<uuid>` | اختياري (للتتبّع) |

---

## 2. المصادقة

### 2.1 JWT Token Strategy

| Token | المدة | التخزين |
|-------|------|---------|
| **Access Token** | 15 دقيقة | `Authorization: Bearer` header |
| **Refresh Token** | 7 أيام | httpOnly cookie |
| **Device Token** | 30 يوم | DB (للـ device binding) |

### 2.2 Token Payload (Claims)

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@cms.example.com",
  "role": "super_admin",
  "type": "admin",
  "scope_university_id": "",
  "scope_college_id": "",
  "scope_subject_id": "",
  "device_id": "abc123",
  "jti": "unique-token-id",
  "iat": 1722400000,
  "exp": 1722400900
}
```

---

## 3. Auth Endpoints

### 3.1 Register (Student)

```
POST /api/v1/auth/register
```

**Request:**
```json
{
  "phone": "0991234567",
  "password": "SecurePass123!",
  "fullName": "أحمد العبد الله",
  "universityId": "uuid",
  "collegeId": "uuid",
  "academicYearId": "uuid",
  "acceptTerms": true
}
```

**Response (201):**
```json
{
  "data": {
    "studentId": "uuid",
    "phone": "0991234567",
    "otpRequired": true,
    "otpExpiresIn": 60
  }
}
```

### 3.2 Verify OTP

```
POST /api/v1/auth/verify-otp
```

**Request:**
```json
{
  "phone": "0991234567",
  "otpCode": "1234"
}
```

**Response (200):**
```json
{
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "phone": "0991234567",
      "fullName": "أحمد العبد الله",
      "role": "student"
    }
  }
}
```

### 3.3 Login (Student)

```
POST /api/v1/auth/login
```

**Request:**
```json
{
  "phone": "0991234567",
  "password": "SecurePass123!",
  "deviceFingerprint": "canvas-webgl-fonts-hash",
  "deviceName": "iPhone 12 - Safari"
}
```

**Response (200):**
```json
{
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "tokenType": "Bearer",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "phone": "0991234567",
      "fullName": "أحمد العبد الله",
      "role": "student",
      "university": { "id": "uuid", "nameAr": "جامعة حمص" },
      "college": { "id": "uuid", "nameAr": "الطب البشري" },
      "avatarUrl": null
    }
  }
}
```

**Errors:**
- `401` - بيانات خاطئة.
- `403` - حساب محظور / جهاز مختلف.

### 3.4 Login (Admin)

```
POST /api/v1/auth/admin/login
```

**Request:**
```json
{
  "email": "admin@cms.example.com",
  "password": "SecurePass123!",
  "twoFactorCode": "123456"
}
```

### 3.5 Refresh Token

```
POST /api/v1/auth/refresh
```

**Request:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

### 3.6 Logout

```
POST /api/v1/auth/logout
Authorization: Bearer <token>
```

### 3.7 Forgot Password

```
POST /api/v1/auth/forgot-password
```

**Request:**
```json
{
  "phone": "0991234567"
}
```

### 3.8 Reset Password

```
POST /api/v1/auth/reset-password
```

**Request:**
```json
{
  "phone": "0991234567",
  "otpCode": "1234",
  "newPassword": "NewPass123!"
}
```

---

## 4. Students Endpoints

### 4.1 Get Current Student

```
GET /api/v1/students/me
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "phone": "0991234567",
    "fullName": "أحمد العبد الله",
    "avatarUrl": null,
    "university": { "id": "uuid", "nameAr": "جامعة حمص" },
    "college": { "id": "uuid", "nameAr": "الطب البشري" },
    "academicYear": { "id": "uuid", "nameAr": "السنة الثالثة" },
    "stats": {
      "questionsAnswered": 342,
      "correctAnswers": 267,
      "accuracy": 78.07,
      "currentStreak": 7,
      "rank": 12
    },
    "createdAt": "2026-03-15T10:00:00Z"
  }
}
```

### 4.2 Update Profile

```
PATCH /api/v1/students/me
Authorization: Bearer <token>
```

**Request:**
```json
{
  "fullName": "أحمد محمد العبد الله",
  "avatarUrl": "https://...",
  "gender": "male"
}
```

### 4.3 Get My Subscriptions

```
GET /api/v1/students/me/subscriptions
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "scopeType": "subject",
      "subject": { "id": "uuid", "nameAr": "الباطنة" },
      "startsAt": "2026-07-01T00:00:00Z",
      "expiresAt": "2026-10-01T00:00:00Z",
      "status": "active",
      "daysRemaining": 62
    }
  ]
}
```

### 4.4 Get My Stats

```
GET /api/v1/students/me/stats?period=month
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": {
    "totalQuestions": 342,
    "correctAnswers": 267,
    "accuracy": 78.07,
    "studyTimeMinutes": 1240,
    "currentStreak": 7,
    "longestStreak": 15,
    "bySubject": [
      {
        "subjectId": "uuid",
        "subjectName": "الباطنة",
        "questionsAnswered": 267,
        "accuracy": 80.5
      }
    ],
    "byDifficulty": {
      "easy": { "answered": 100, "accuracy": 90.0 },
      "medium": { "answered": 150, "accuracy": 75.0 },
      "hard": { "answered": 92, "accuracy": 65.0 }
    }
  }
}
```

### 4.5 Get My Results

```
GET /api/v1/students/me/results?page=1&pageSize=10
Authorization: Bearer <token>
```

---

## 5. Academic Endpoints

### 5.1 Get Universities

```
GET /api/v1/universities
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "nameAr": "جامعة حمص",
      "nameEn": "Homs University",
      "slug": "homs-university",
      "logoUrl": "https://...",
      "collegesCount": 3
    }
  ]
}
```

### 5.2 Get Colleges

```
GET /api/v1/universities/{universityId}/colleges
```

### 5.3 Get Academic Years

```
GET /api/v1/colleges/{collegeId}/years
```

### 5.4 Get Semesters

```
GET /api/v1/years/{yearId}/semesters
```

### 5.5 Get Subjects

```
GET /api/v1/semesters/{semesterId}/subjects
```

### 5.6 Get Subject Details

```
GET /api/v1/subjects/{subjectId}
```

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "nameAr": "الباطنة",
    "nameEn": "Internal Medicine",
    "slug": "internal-medicine",
    "description": "...",
    "icon": "book",
    "color": "#1976D2",
    "totalQuestions": 320,
    "totalLectures": 15,
    "totalExams": 5,
    "userProgress": {
      "questionsAnswered": 267,
      "accuracy": 80.5,
      "completedPercentage": 65.0
    }
  }
}
```

### 5.7 Get Lectures

```
GET /api/v1/subjects/{subjectId}/lectures
```

### 5.8 Get Lecture Details

```
GET /api/v1/lectures/{lectureId}
```

---

## 6. Questions Endpoints

### 6.1 Get Questions (by Subject/Lecture)

```
GET /api/v1/questions?subjectId={id}&page=1&pageSize=20&difficulty=medium&sort=createdAt&order=desc
Authorization: Bearer <token>
```

**Query Parameters:**
| Param | Type | الوصف |
|-------|------|------|
| `subjectId` | UUID | فلترة حسب المادة |
| `lectureId` | UUID | فلترة حسب المحاضرة |
| `difficulty` | string | easy/medium/hard |
| `tags` | string | مفصولة بفاصلة |
| `status` | string | draft/published (admin only) |
| `search` | string | بحث نصّي |
| `page` | int | افتراضي: 1 |
| `pageSize` | int | افتراضي: 20، حد أقصى: 100 |
| `sort` | string | createdAt/difficulty/viewsCount |
| `order` | string | asc/desc |

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "text": "أي مما يلي يعتبر عرضاً شائعاً...",
      "type": "mcq",
      "difficulty": "medium",
      "tags": ["cardiology", "ecg"],
      "lectureTitle": "محاضرة 2: أمراض القلب",
      "year": 2024,
      "userAnswer": {
        "selectedOptionId": "uuid",
        "isCorrect": true,
        "isFirstAttempt": true,
        "answeredAt": "2026-07-30T10:00:00Z"
      },
      "isFavorite": true
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 320,
    "totalPages": 16,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 6.2 Get Question by ID

```
GET /api/v1/questions/{questionId}
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "text": "رجل 55 عام يشكو من ألم صدري...",
    "textHtml": "<p>رجل <strong>55 عام</strong> يشكو...</p>",
    "type": "mcq",
    "difficulty": "medium",
    "tags": ["cardiology", "ecg"],
    "subject": { "id": "uuid", "nameAr": "الباطنة" },
    "lecture": { "id": "uuid", "titleAr": "محاضرة 2" },
    "options": [
      { "id": "uuid", "letter": "A", "text": "ذبحة صدرية مستقرة" },
      { "id": "uuid", "letter": "B", "text": "احتشاء عضلة القلب" },
      { "id": "uuid", "letter": "C", "text": "التهاب التامور" },
      { "id": "uuid", "letter": "D", "text": "تمزق الأبهر" }
    ],
    "images": [],
    "reference": "ديفيدسون ص. 245",
    "userAnswer": null,
    "isFavorite": false,
    "stats": {
      "attemptsCount": 245,
      "correctRate": 72.5
    }
  }
}
```

> **ملاحظة**: `correctAnswer` و `explanation` لا يُرجعان إلا بعد الإجابة.

### 6.3 Answer Question

```
POST /api/v1/questions/{questionId}/answer
Authorization: Bearer <token>
```

**Request:**
```json
{
  "selectedOptionId": "uuid",
  "durationSeconds": 25,
  "isOffline": false
}
```

**Response (200):**
```json
{
  "data": {
    "isCorrect": true,
    "correctOptionId": "uuid",
    "correctOptionLetter": "B",
    "explanation": "الألم الصدري الضاغط الذي يستمر > 20 دقيقة...",
    "explanationHtml": "<p>الألم الصدري...</p>",
    "reference": "ديفيدسون ص. 245",
    "isFirstAttempt": true,
    "newAchievements": [
      {
        "type": "streak_7",
        "title": "على نار هادئة",
        "icon": "flame"
      }
    ],
    "updatedStats": {
      "questionsAnswered": 343,
      "correctAnswers": 268,
      "accuracy": 78.13,
      "currentStreak": 8
    }
  }
}
```

### 6.4 Report Question Error

```
POST /api/v1/questions/{questionId}/report
Authorization: Bearer <token>
```

**Request:**
```json
{
  "reasonType": "scientific",
  "description": "الإجابة الصحيحة ينبغي أن تكون C وليس B",
  "screenshotUrl": "https://..."
}
```

### 6.5 Share Question (Deep Link)

```
GET /api/v1/questions/{questionId}/share-link
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": {
    "shareUrl": "https://app.cms.example.com/q/abc123token",
    "expiresAt": "2026-07-30T11:00:00Z"
  }
}
```

---

## 7. Exams Endpoints

### 7.1 Get Exams (by Subject)

```
GET /api/v1/subjects/{subjectId}/exams
Authorization: Bearer <token>
```

### 7.2 Get Exam Details

```
GET /api/v1/exams/{examId}
```

### 7.3 Start Exam Session

```
POST /api/v1/exams/{examId}/start
Authorization: Bearer <token>
```

**Request:**
```json
{
  "mode": "test",
  "isOffline": false
}
```

**Response (201):**
```json
{
  "data": {
    "sessionId": "uuid",
    "examId": "uuid",
    "totalQuestions": 100,
    "durationMinutes": 120,
    "expiresAt": "2026-07-30T12:00:00Z",
    "questions": [
      {
        "id": "uuid",
        "number": 1,
        "text": "...",
        "options": [...]
      }
    ]
  }
}
```

### 7.4 Submit Exam

```
POST /api/v1/exams/sessions/{sessionId}/submit
Authorization: Bearer <token>
```

**Request:**
```json
{
  "answers": [
    { "questionId": "uuid", "selectedOptionId": "uuid", "durationSeconds": 30 },
    ...
  ]
}
```

**Response (200):**
```json
{
  "data": {
    "sessionId": "uuid",
    "score": 78.0,
    "passed": true,
    "totalQuestions": 100,
    "answeredQuestions": 95,
    "correctAnswers": 78,
    "durationSeconds": 7200,
    "weakestTopics": [
      { "tag": "liver", "accuracy": 40.0 },
      { "tag": "shock", "accuracy": 50.0 }
    ],
    "comparison": {
      "yourScore": 78.0,
      "averageScore": 65.0,
      "topScore": 95.0
    }
  }
}
```

### 7.5 Get Exam Results

```
GET /api/v1/exams/sessions/{sessionId}/results
```

### 7.6 Review Exam

```
GET /api/v1/exams/sessions/{sessionId}/review
```

---

## 8. Library Endpoints

### 8.1 Get Library Files

```
GET /api/v1/subjects/{subjectId}/library?type=pdf&page=1&pageSize=20
Authorization: Bearer <token>
```

### 8.2 Get File Details

```
GET /api/v1/library/{fileId}
```

### 8.3 Get File Access URL (Signed)

```
POST /api/v1/library/{fileId}/access
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": {
    "accessUrl": "https://r2.cloudflarestorage.com/...?signature=...",
    "expiresAt": "2026-07-30T10:05:00Z",
    "watermark": {
      "studentName": "أحمد العبد الله",
      "studentPhone": "0991234567",
      "timestamp": "2026-07-30T10:00:00Z"
    }
  }
}
```

### 8.4 Record File View

```
POST /api/v1/library/{fileId}/view
Authorization: Bearer <token>
```

**Request:**
```json
{
  "durationSeconds": 300,
  "pagesViewed": 15,
  "completionPercentage": 33.3
}
```

---

## 9. Subscriptions Endpoints

### 9.1 Activate Code

```
POST /api/v1/codes/activate
Authorization: Bearer <token>
```

**Request:**
```json
{
  "code": "CMS7X9K2M4Q8"
}
```

**Response (200):**
```json
{
  "data": {
    "subscriptionId": "uuid",
    "scopeType": "subject",
    "subject": { "id": "uuid", "nameAr": "الباطنة" },
    "startsAt": "2026-07-30T00:00:00Z",
    "expiresAt": "2026-10-28T00:00:00Z",
    "durationDays": 90
  }
}
```

**Errors:**
- `404` - الكود غير موجود.
- `409` - الكود مستخدم / منتهي / نطاق مختلف.

---

## 10. Search Endpoints

### 10.1 Universal Search

```
GET /api/v1/search?q=cardiology&type=all&page=1&pageSize=20
Authorization: Bearer <token>
```

**Query Parameters:**
| Param | Type | الوصف |
|-------|------|------|
| `q` | string | الاستعلام (min 2 chars) |
| `type` | string | all/questions/files/lectures |
| `subjectId` | UUID | فلترة حسب المادة |
| `difficulty` | string | easy/medium/hard |
| `tags` | string | مفصولة بفاصلة |

**Response (200):**
```json
{
  "data": {
    "questions": {
      "total": 28,
      "items": [
        {
          "id": "uuid",
          "text": "...ألم صدري **cardiology**...",
          "highlightedText": "...ألم صدري <mark>cardiology</mark>...",
          "subject": { "nameAr": "الباطنة" },
          "difficulty": "medium"
        }
      ]
    },
    "files": {
      "total": 10,
      "items": [...]
    },
    "lectures": {
      "total": 4,
      "items": [...]
    }
  },
  "meta": {
    "totalResults": 42,
    "query": "cardiology",
    "took": 234
  }
}
```

---

## 11. Favorites Endpoints

### 11.1 Get Favorites

```
GET /api/v1/favorites?page=1&pageSize=20
Authorization: Bearer <token>
```

### 11.2 Add to Favorites

```
POST /api/v1/favorites
```

**Request:**
```json
{
  "questionId": "uuid",
  "listId": "uuid",
  "notes": "سؤال مهم للامتحان"
}
```

### 11.3 Remove from Favorites

```
DELETE /api/v1/favorites/{questionId}
```

### 11.4 Get Favorite Lists

```
GET /api/v1/favorites/lists
```

### 11.5 Create Favorite List

```
POST /api/v1/favorites/lists
```

**Request:**
```json
{
  "name": "أسئلة صعبة",
  "description": "للمراجعة قبل الامتحان",
  "color": "#FF5252"
}
```

### 11.6 Get List Questions

```
GET /api/v1/favorites/lists/{listId}/questions
```

---

## 12. Notifications Endpoints

### 12.1 Get Notifications

```
GET /api/v1/notifications?page=1&pageSize=20&unreadOnly=true
Authorization: Bearer <token>
```

### 12.2 Mark as Read

```
PATCH /api/v1/notifications/{id}/read
```

### 12.3 Mark All as Read

```
POST /api/v1/notifications/mark-all-read
```

### 12.4 Register Push Token

```
POST /api/v1/notifications/push-token
```

**Request:**
```json
{
  "token": "firebase-token",
  "platform": "web"
}
```

---

## 13. Leaderboard Endpoints

### 13.1 Get Leaderboard

```
GET /api/v1/leaderboard?scope=subject&scopeId={uuid}&period=month&page=1&pageSize=100
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "data": {
    "topStudents": [
      {
        "rank": 1,
        "studentId": "uuid",
        "studentName": "محمد أحمد",
        "avatarUrl": null,
        "questionsAnswered": 1245,
        "accuracy": 92.0,
        "isYou": false
      },
      ...
    ],
    "yourRank": {
      "rank": 12,
      "questionsAnswered": 342,
      "accuracy": 78.0
    }
  }
}
```

---

## 14. Admin Endpoints

> جميع الـ endpoints التالية تتطلب صلاحية `Admin`.

### 14.1 Admin Dashboard Stats

```
GET /api/v1/admin/dashboard
Authorization: Bearer <admin_token>
```

### 14.2 Questions Management

```
GET    /api/v1/admin/questions
POST   /api/v1/admin/questions
GET    /api/v1/admin/questions/{id}
PUT    /api/v1/admin/questions/{id}
DELETE /api/v1/admin/questions/{id}
POST   /api/v1/admin/questions/import
GET    /api/v1/admin/questions/export
```

### 14.3 Codes Management

```
GET    /api/v1/admin/codes
POST   /api/v1/admin/codes/generate
GET    /api/v1/admin/codes/{id}
GET    /api/v1/admin/codes/export
```

### 14.4 Students Management

```
GET    /api/v1/admin/students
GET    /api/v1/admin/students/{id}
PATCH  /api/v1/admin/students/{id}/status
GET    /api/v1/admin/students/{id}/security-logs
```

### 14.5 Library Management

```
GET    /api/v1/admin/library
POST   /api/v1/admin/library/upload-url
POST   /api/v1/admin/library/{id}/complete
DELETE /api/v1/admin/library/{id}
```

### 14.6 Notifications Management

```
GET    /api/v1/admin/notifications
POST   /api/v1/admin/notifications
GET    /api/v1/admin/notifications/{id}/stats
```

### 14.7 Reports

```
GET /api/v1/admin/reports/usage?period=month
GET /api/v1/admin/reports/revenue?period=month
GET /api/v1/admin/reports/performance
GET /api/v1/admin/reports/security
```

---

## 15. Response Models

### 15.1 Success Response

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 15.2 Error Response (RFC 7807)

```json
{
  "type": "https://cms.example.com/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "The request contains invalid data",
  "errors": {
    "text": ["Question text is required"],
    "options": ["At least 2 options required"]
  },
  "traceId": "00-abc123def456-789-ghi"
}
```

---

## 16. Error Handling

### 16.1 HTTP Status Codes

| Code | المعنى | الاستخدام |
|------|--------|----------|
| 200 | OK | نجاح GET/PUT/PATCH |
| 201 | Created | نجاح POST (إنشاء) |
| 204 | No Content | نجاح DELETE |
| 400 | Bad Request | خطأ في الـ request |
| 401 | Unauthorized | غير مصادق |
| 403 | Forbidden | لا صلاحية |
| 404 | Not Found | غير موجود |
| 409 | Conflict | تعارض (مثل كود مستخدم) |
| 422 | Unprocessable Entity | خطأ تحقق |
| 429 | Too Many Requests | تجاوز rate limit |
| 500 | Internal Server Error | خطأ خادم |

### 16.2 Error Codes

| Error Code | HTTP | الوصف |
|-----------|------|------|
| `AUTH_INVALID_CREDENTIALS` | 401 | بيانات دخول خاطئة |
| `AUTH_ACCOUNT_BANNED` | 403 | حساب محظور |
| `AUTH_DEVICE_MISMATCH` | 403 | جهاز مختلف |
| `AUTH_TOKEN_EXPIRED` | 401 | انتهت صلاحية الـ token |
| `CODE_NOT_FOUND` | 404 | الكود غير موجود |
| `CODE_ALREADY_USED` | 409 | الكود مستخدم |
| `CODE_EXPIRED` | 409 | الكود منتهي الصلاحية |
| `CODE_SCOPE_MISMATCH` | 409 | النطاق لا يطابق |
| `SUBSCRIPTION_REQUIRED` | 403 | اشتراك مطلوب |
| `SUBSCRIPTION_EXPIRED` | 403 | اشتراك منتهي |
| `RESOURCE_NOT_FOUND` | 404 | المورد غير موجود |
| `VALIDATION_ERROR` | 400 | خطأ تحقق |
| `RATE_LIMIT_EXCEEDED` | 429 | تجاوز الحد |
| `INTERNAL_ERROR` | 500 | خطأ داخلي |

---

## 17. Rate Limiting

| Endpoint Category | Limit | Window |
|------------------|-------|--------|
| Auth (login/register) | 5 requests | per minute |
| Auth (forgot password) | 3 requests | per hour |
| Search | 30 requests | per minute |
| File access | 20 requests | per minute |
| Standard authenticated | 100 requests | per minute |
| Admin endpoints | 200 requests | per minute |

**Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1722400900
```

---

## 18. API Endpoint Summary

| الفئة | عدد Endpoints |
|------|--------------|
| Auth | 8 |
| Students | 5 |
| Academic | 8 |
| Questions | 5 |
| Exams | 6 |
| Library | 4 |
| Subscriptions | 1 |
| Search | 1 |
| Favorites | 6 |
| Notifications | 4 |
| Leaderboard | 1 |
| Admin | ~40 |
| **الإجمالي** | **~89 endpoints** |

---

**نهاية ملف API_SPECIFICATION.md**
