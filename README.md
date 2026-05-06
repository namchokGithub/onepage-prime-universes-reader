# Novel Reader

A lightweight one-page web novel reader with Firebase-backed editing support.
Designed for static deployment (GitHub Pages) and optimized reading experience.

---

## Features

### Reader Mode

- Read novels by **Volume / Arc / Chapter**
- Dark / Light mode
- Adjustable font size & layout
- Clean, distraction-free UI

### Editor Mode

- Edit chapters stored in Cloud Firestore
- Optional local Markdown import/export
- Export edited content
- Simple writing workflow

---

## Project Structure

```
/src
  /components
  /lib
  /pages
  /utils
```

---

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS
- shadcn/ui components
- Firebase Auth + Cloud Firestore
- Zustand
- React Router

---

## Firebase Setup

1. Create a Firebase project.
2. Enable Cloud Firestore.
3. Enable Firebase Auth with the Email/Password provider.
4. Add an editor user and verify their email.
5. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values from the Firebase web app config.
6. Deploy Firestore rules from `firestore.rules`.

The app stores chapters in the `chapters` collection and editor backups in `chapters/{chapterId}/backups`. Chapter reads are public; chapter writes and all backup access require a signed-in user with a verified email.

---

## Deployment

```bash
npm install
npm run dev
```

This project is designed for **GitHub Pages**.

```bash
npm run build
```

---

## &#x20;Roadmap

- [x] Bookmark system
- [x] Reading progress tracking
- [x] Continue reading
- [ ] ~~Search (in novel) ค้นคำในทั้งเรื่อง (client-side index)~~
- [x] Chapter navigation UX
- [ ] Theme presets

---

## License

MIT License
