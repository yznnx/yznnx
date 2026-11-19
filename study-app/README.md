# 📚 Study Vault – your private study app

An interactive study app for your lectures and exercises. Upload slides, scripts, exercise sheets (Serien), solutions and past exams. The app works out **what is important**, builds a **daily study plan** and tests you **at ETH exam level**.

**It's only for you.** Everything is stored on your own device, encrypted with your password (AES-256). There is no account, no server and no tracking, and nobody else can open your vault.

## Start using it

1. Download **[`StudyApp.html`](StudyApp.html)** (on GitHub: open the file, then click "Download raw file").
2. Double-click it. It opens in your browser (Chrome or Edge recommended) and works offline.
3. Choose a password. Write it down: there is no "forgot password", because nobody but you can decrypt the data.

Always open the same file in the same browser. Your data lives in that browser's storage.

## What it does

| | |
|---|---|
| 🎓 **One environment per lecture** | Pick a lecture on "My lectures" or switch from the sidebar. Files, plan, cards, exercises and notes are kept separate for each lecture. Set the exam date and the plan gets more focused as it comes closer. |
| 🎯 **What's important** | Every page is rated **Core / Important / Optional / Skip**. The strongest signal is overlap with your exercise sheets and past exams. Definitions, theorems, "klausurrelevant" and formulas also count, and title, agenda, organisation and literature slides are skipped. With the AI tutor, Claude rates every page and names the key topics. You can override any rating. |
| ✅ **Study now** | A ranked to-do list with the reason for each item: flashcards that are due, weak spots, exercises marked "shaky", core pages you haven't studied yet, and practice quizzes before the exam. |
| 📄 **Viewer** | PDF viewer with selectable text, an importance strip and **Focus mode**, which skips unimportant pages. You can take notes per page, select text and turn it into a flashcard, a note or an AI question, and "studied" progress is tracked. PowerPoint and Word files are shown as text, and notebooks and Markdown are rendered. |
| 🃏 **Flashcards** | Anki-style spaced repetition. You **type your answer before the solution is revealed**. New cards from core pages come first. Maths in LaTeX (`$…$`, `$$…$$`). |
| ✏️ **Exercises** | Type "1a-c, 2, 3" to create the tasks. Then set a status and a confidence rating, write your solution or attach photos of handwritten work, and let the AI **check it strictly**. Practice mode brings back the shaky ones. |
| ❓ **Quiz** | ETH-style: single choice, "select all that apply" (all-or-nothing) and true/false blocks with **negative marking**. |
| 🎓 **Exam practice** | Exam problems with points, a time limit, a model solution and a rubric. Solve them under a timer and get graded like an ETH corrector. |
| ✨ **AI tutor** (optional) | Explains a page using the slide image, chats about the whole lecture, quizzes you, and generates cards, quiz questions and exam problems calibrated to your past exams. |
| 🔎 **Search** | Full-text search over every page, note, card and exercise. |
| ⏱️ **Focus timer, streaks, heatmap** | Pomodoro timer per lecture and daily activity tracking. |

## The AI tutor (optional)

Settings → AI tutor → paste your own **Anthropic API key** (create one at console.anthropic.com) → *Test*.

- The key is stored encrypted inside your vault. Requests go directly from the app to Anthropic.
- Your material is only sent when **you press an AI button**, and only the part that's needed (a page, a range or one file).
- The default model is Claude Opus 5.5. You can switch to Sonnet 5.5 or Haiku 5.5 to make it cheaper. You pay Anthropic per use.
- "ETH level – hard & strict" is the default. Switch to "Standard" in Settings if you want it easier.

## Backups, other devices, phone

- **Settings → Download backup** creates one `.studyvault` file. It stays encrypted with your password, so it's safe on a USB stick or in a cloud drive.
- To move to another computer, open `StudyApp.html` there and choose **"Restore from a backup file"**.
- Browsers delete stored data if you "clear site data/history", so make backups regularly.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests (scheduler, importance engine, encryption, parsers)
npm run build    # type-check + build the single file → StudyApp.html
```

Built with React, TypeScript, Vite, pdf.js, KaTeX and fflate. It uses the Anthropic SDK for the optional tutor. The whole app is bundled into one self-contained HTML file.
