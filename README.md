# Novel Reader

A lightweight one-page web novel reader with built-in editing support.
Designed for static deployment (GitHub Pages) and optimized reading experience.

---

## Features

### Reader Mode

- Read novels by **Volume / Arc / Chapter**
- Dark / Light mode
- Adjustable font size & layout
- Clean, distraction-free UI

### Editor Mode

- Edit `.txt` / `.md` files
- Load from local file
- Export edited content
- Simple writing workflow

---

## Project Structure

```
/content
  /vol-1
    /arc-1
      chapter-1.md

/src
  /components
  /features
  /pages
```

---

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS
- shadcn/ui components
- Zustand
- React Router

---

## Deployment

```bash
npm install
npm run dev
```

This project is designed for **GitHub Pages**.

```bash
npm run build
npm run export
```

---

## &#x20;Roadmap

- [ ] Bookmark system
- [ ] Auto save editor
- [ ] GitHub commit integration
- [ ] Reading progress tracking

---

## License

MIT License
