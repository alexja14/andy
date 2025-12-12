# XADRY — site (Vue 3 + Vite + Tailwind)

## Rulare locală

- `npm install`
- `npm run dev`

## Deploy pe GitHub Pages (automat)

Repo-ul e pregătit cu GitHub Actions pentru Pages.

1. Urcă proiectul pe GitHub (repo nou).
2. În GitHub: **Settings → Pages**
3. La **Build and deployment**, alege **Source: GitHub Actions**.
4. Fă push pe branch-ul `main` (sau `master`). Workflow-ul `Deploy to GitHub Pages` va rula și va publica site-ul.

Notă: `vite.config.js` setează automat `base` la `/<repo>/` în GitHub Actions, ca să meargă corect pe Pages.
