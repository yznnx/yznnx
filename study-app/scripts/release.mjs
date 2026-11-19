// Copies the single-file build to StudyApp.html – the file you open to use the app.
import { copyFileSync, statSync } from "node:fs";
copyFileSync("dist/index.html", "StudyApp.html");
console.log(`StudyApp.html ready (${(statSync("StudyApp.html").size / 1024 / 1024).toFixed(1)} MB)`);
