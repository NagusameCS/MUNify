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

GitHub Pages (project site)
---------------------------
This repo is intended to be served from a project path (for example: `https://<user>.github.io/MUNify/`).

Important notes:
- The HTML uses relative links (e.g. `design/`, `info/`, `form/`) so the site will work when hosted under the repo path.
- The fallback `assets/css/style.css` contains minimal CSS so the site renders even before you build the full Tailwind output. Run `npm run build:css` to generate the complete styles for production.

Other
-----
- The 3D background uses `earth.glb` in the repo root. Ensure it is present when deploying.
- Google Sign-In is used for UX only; configuration (client ID) is in the pages already. If you see errors in the console related to cross-origin frames or blocked network requests, they are usually browser extensions or Google scripts and don't prevent local testing.

If you want, I can add a small GitHub Actions workflow to automatically build the CSS and commit the result before publishing.
