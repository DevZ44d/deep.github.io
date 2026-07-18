<div align="center">

# `>_` PortFolio `</Deep>`

**AhMed's personal developer portfolio** — a dark, animated single-page site live at **[deep.is-a.dev](https://deep.is-a.dev)**

[![Live Site](https://img.shields.io/badge/Live-deep.is--a.dev-2ea44f?style=flat-square&logo=googlechrome&logoColor=white)](https://deep.is-a.dev)
[![GitHub Pages](https://img.shields.io/badge/Hosted%20on-GitHub%20Pages-181717?style=flat-square&logo=github&logoColor=white)](https://pages.github.com/)
[![Stars](https://img.shields.io/github/stars/DevZ44d/deep.github.io?style=flat-square&color=yellow)](https://github.com/DevZ44d/deep.github.io/stargazers)
[![Forks](https://img.shields.io/github/forks/DevZ44d/deep.github.io?style=flat-square&color=orange)](https://github.com/DevZ44d/deep.github.io/forks)
[![Last Commit](https://img.shields.io/github/last-commit/DevZ44d/deep.github.io?style=flat-square&color=brightgreen)](https://github.com/DevZ44d/deep.github.io/commits/main)
[![Repo Size](https://img.shields.io/github/repo-size/DevZ44d/deep.github.io?style=flat-square&color=blueviolet)](https://github.com/DevZ44d/deep.github.io)
[![Issues](https://img.shields.io/github/issues/DevZ44d/deep.github.io?style=flat-square&color=red)](https://github.com/DevZ44d/deep.github.io/issues)

![HTML](https://img.shields.io/badge/HTML-45.8%25-E34F26?style=flat-square&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-33.8%25-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![CSS](https://img.shields.io/badge/CSS-20.3%25-1572B6?style=flat-square&logo=css3&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-Local%20Dev%20Server-000000?style=flat-square&logo=flask&logoColor=white)

</div>

---

## 🧑‍💻 `>_` About

This is the source code for **AhMed's (DevZ44d)** personal portfolio site — a single, dark-themed landing page built with plain HTML/CSS/JS, packed with small interactive touches instead of a heavy framework.

> `>_ Hello — I am AhMed.`
> `>_ Check my repositories.`

## ✨ Features

- 🎨 **Dark, animated UI** — [particles.js](https://vincentgarreau.com/particles.js/) background, custom intro loader, and a light/dark toggle switch
- 🎁 **Telegram-gift-style card** — an animated SVG panel that displays a random icon from `Symbol/` on every page load
- 🎵 **Built-in music player** — custom playlist and controls (`Music/`)
- ⏰ **Standalone clock page** — available at [`/clock`](https://deep.is-a.dev/clock/)
- ✉️ **Working contact form** — wired to a serverless Cloudflare Worker endpoint (`contactform/`)
- 🔗 **Social links hub** — GitHub, PyPI, Telegram, Instagram, all in one sidebar
- 🔒 **Basic content protection** — right-click and common DevTools shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U) are disabled
- 🌐 **Custom domain** — served via GitHub Pages with a `CNAME` pointing to `deep.is-a.dev`
- 🐍 **Flask-powered local dev server** — run the whole site locally with hot access to every asset, exactly as it's served in production

## 🛠️ Tech Stack

| Layer | Tools |
|---|---|
| 🖼️ Markup / Styling | HTML5, CSS3, [Google Fonts](https://fonts.google.com/) (Poppins, Cutive Mono) |
| ⚡ Interactivity | Vanilla JavaScript, [particles.js](https://vincentgarreau.com/particles.js/), [Font Awesome](https://fontawesome.com/) |
| 🐍 Local dev server | [Flask](https://flask.palletsprojects.com/) (`main.py`) |
| ✉️ Contact form backend | Cloudflare Worker |
| 🌐 Hosting | GitHub Pages (custom domain via `CNAME`) |

## 📁 Project Structure

```
deep.github.io/
├── Music/            # Playlist data, player script and styles
├── Symbol/           # Icon set used by the animated gift/symbol card
├── assets/           # Images, favicon, particles.js library
├── audios/           # Audio files used by the music player
├── clock/            # Standalone clock sub-page
├── contactform/       # Contact form script + Worker integration
├── profiles/         # Profile images
├── src/              # Core stylesheet (style.css) and app script (app.js)
├── CNAME             # Custom domain config for GitHub Pages
├── index.html        # Main landing page
├── main.py           # Flask local dev server (serves the full site)
├── requirements.txt  # Python dependencies (Flask)
└── open.bat           # Windows shortcut to launch the site
```

## 🚀 Getting Started

### 👀 View it live

Just visit **[deep.is-a.dev](https://deep.is-a.dev)** — no setup needed.

### 💻 Run it locally

```bash
git clone https://github.com/DevZ44d/deep.github.io.git
cd deep.github.io
pip install flask
python main.py
```

This spins up a local Flask server at **http://127.0.0.1:5000** serving the exact same files GitHub Pages does, and opens it in your browser automatically.

**Useful flags:**

| Flag | What it does |
|---|---|
| `--port 8080` | Run on a different port |
| `--host 0.0.0.0` | Expose the server on your local network |
| `--no-browser` | Don't auto-open a browser tab |
| `--debug` | Enable Flask's auto-reload/debugger |

On Windows, you can also just double-click `open.bat`.

## 🔗 Connect

<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-DevZ44d-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/DevZ44d)
[![Telegram](https://img.shields.io/badge/Telegram-DevGit-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/DevGit)
[![Instagram](https://img.shields.io/badge/Instagram-dddi.dev-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/dddi.dev)
[![PyPI](https://img.shields.io/badge/PyPI-AsyncPy-3775A9?style=for-the-badge&logo=pypi&logoColor=white)](https://pypi.org/user/AsyncPy/)

</div>

---

<div align="center">
<sub>Built with ⚡ by <a href="https://github.com/DevZ44d">DevZ44d</a></sub>
</div>
