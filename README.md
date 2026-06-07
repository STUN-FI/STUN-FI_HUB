# STUN-FI HUB

STUN-FI HUB is a education administration platform designed to solve the daily operational challenges faced by schools across Nigeria and Africa.
It brings result management, school subscriptions, session planning, promotion tracking and communications into one platform so school leaders can focus on learning outcomes instead of paperwork.

## The Problem

Many schools still rely on spreadsheets, manual result processing, and disconnected communication channels.
This creates delays in publishing results, makes promotion decisions hard to track, and leaves teachers and parents without timely progress updates.
For school owners, the result is administrative overload, wasted time, and limited visibility into student performance and subscription status.

## Why STUN-FI HUB Exists

STUN-FI HUB was created to give school leaders a modern, purpose-built system for managing academic operations.
It helps schools move from fragmented workflows to a centralized dashboard that combines academic results, session management, subscription oversight, and school-wide announcements.

## How the Platform Works

- A static frontend in `SaaS/` presents role-specific pages for school admins, teachers, students and platform administrators.
- The Node.js backend in `Backend/` powers the APIs that fetch school metrics, manage subscriptions, and store results, sessions, and promotion history.
- A Super Admin dashboard provides platform-wide monitoring and school management capabilities.
- Integrated AI support is included for chat, guidance, and text analysis through the backend API.

## Benefits for Schools, Teachers and Students

- School owners gain a single view of active schools, subscription status, student counts and result summaries.
- Teachers can rely on structured result data and promotion guidance instead of manual grading spreadsheets.
- Students and parents benefit from clearer result tracking and academic progress visibility.
- Administrators can send notifications and announcements directly to schools while keeping operational workflows centralized.

## Result Management

STUN-FI HUB supports structured result collection and storage for each student, school, session and term.
The backend includes logic for summarizing performance, generating student result documents, and tracking whether results have been finalized.
This enables reliable report generation and consistent academic record keeping.

## Session and Promotion Management

The platform captures academic sessions and promotion status for students.
It stores promotion decisions, tracks whether a student is promoted, repeated, graduated, or withdrawn, and maintains a promotion history for audit and review.
This is especially valuable for schools that need transparent promotion workflows at the end of each term.

## School Subscriptions

STUN-FI HUB includes school subscription management and billing status visibility.
Schools can be tracked by trial, active, and expired status.
The Super Admin APIs also support plan upgrades, suspension, and reactivation so the platform can manage commercial access in a scalable way.

## Notifications and Announcements

The platform includes notification and support ticket workflows that let administrators deliver messages to schools.
This helps school leaders receive timely alerts about account status, password resets, impersonation actions, or important platform updates.

## Platform Scalability for Nigeria and Africa

STUN-FI HUB is built as a scalable SaaS foundation for education ecosystems beyond a single school.
With centralized analytics, school-level detail APIs, and multi-role interfaces, the platform is ready to expand across Nigerian states and wider African school networks.
It is positioned to help regional administrators manage multiple schools without duplicating manual effort.

## Impact on Educational Administration

By reducing manual result processing and consolidating subscriptions, sessions, and notifications, STUN-FI HUB frees schools to focus on teaching and learning.
The platform is designed to increase administrative efficiency, improve transparency in promotion decisions, and support better outcomes for students.

## Existing Features

- Super Admin dashboard for platform monitoring and school management
- School-level overview endpoints for subscription, session, student and result metrics
- School suspension, activation and plan upgrade controls
- Activity log and analytics endpoints to track platform performance
- Export endpoints for school student and teacher data
- Notifications, password reset, and support ticket workflows
- AI chat/help/analyze endpoints via backend integration
- Static multi-role frontend pages for administrator, school, teacher and student workflows

## Tech Stack

- Node.js
- Express
- MongoDB with Mongoose
- HTML, CSS, and JavaScript frontend
- bcrypt for password hashing
- JWT for token helpers
- dotenv for configuration
- cors for cross-origin support
- multer for file uploads
- nodemailer for email-related workflows
- Google Gemini / GenAI support via `@google/genai`

## Repository Structure

- `Backend/`
  - `server.js` - Express server and backend application entry point
  - `admin-routes.js` - Super Admin and platform management APIs
  - `ai-routes.js` - AI chat/help/analyze endpoints
  - `package.json` - backend dependencies
  - `Credentials/` - service account and upload artifacts
- `SaaS/`
  - Frontend HTML/CSS/JS pages for login, dashboards, results, and admin interfaces

## Setup

1. Install backend dependencies:

```bash
cd Backend
npm install
```

2. Configure environment variables

Copy `.env.example` to `.env` and set values for email, API keys, and Google AI credentials.

3. Start the backend server:

```bash
node server.js
```

The backend serves the static frontend from `../SaaS` and exposes API routes under `/api` and `/admin`.

## AI Integration

Backend AI endpoints are available at:

- `POST /api/ai/chat`
- `POST /api/ai/help`
- `POST /api/ai/analyze`

See `Backend/README.md` for Google Gemini / GenAI configuration details.

## License

This project is licensed under the MIT License. See `LICENSE` for details.
