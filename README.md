# Seeparah

Seeparah is a multilingual reading and publishing platform designed to remove language barriers for readers and expand global reach for authors. The product combines AI-assisted translation, premium subscription access, personal reading history, and protected reading experiences in a single ecosystem.

## Product positioning

A multilingual reading and publishing platform that removes language barriers for readers and expands global reach for authors through AI translation, subscription access, saved progress, and premium reading experiences.

## Core product goals

- Readers can read books in their preferred language even when the original is in another language.
- Authors can publish manuscripts, manage submissions, and earn from subscription-based access.
- Reading progress, favorites, history, and personal shelves keep users engaged over time.
- Premium reading experiences protect content from download and keep access controlled.
- One shared backend supports both the website and app experience.

## Architecture

- Website: marketing + reader web experience
- App: mobile app experience
- Shared backend: Supabase for auth, books, progress, highlights, shelves, and subscriptions
- Payments: Stripe for subscriptions
- AI translation: Gemini or similar model for translated content chunks
- Content delivery: chunk-based reading flow with progress saved incrementally

The website and the app are intentionally separate frontends that connect to the same backend, auth system, and data model.

## Development

This project is the website frontend for the Seeparah ecosystem. It is kept separate from the app project while sharing the same Supabase, Stripe, and AI configuration.

Prerequisites:

- Node.js 18+
- npm

```sh
npm install
npm run dev
```

Production build:

```sh
npm run build
```

## Notes

- Demo/local fallback logic is enabled when backend credentials are not configured.
- The project follows the Seeparah brand and product strategy rather than the earlier FikrNama naming.
- Real Stripe checkout remains the next integration step once live keys are configured.

This repository is meant to remain the web experience while the Flutter app continues as the mobile experience connected to the same shared backend.
