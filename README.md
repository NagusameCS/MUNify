MUNify
======

Quick notes for local development and GitHub Pages deployment.

Build CSS (Tailwind)
--------------------
This project uses Tailwind for styling. For production, build a local CSS bundle and replace the fallback:

```bash
npm install
npm run build:css
```

Development watch mode:

```bash
npm run watch:css
```

Serve locally
-------------
To preview the site locally (recommended to use a simple HTTP server):

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```
