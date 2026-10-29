// Builds main.js from src/ (Obsidian loads one file): npm run build
const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "src", f), "utf8");
const text = `// StudyOS Notes, built from src/ (npm run build)\n${read("symbols.js").replace("module.exports =", "const SYMBOLS =")}\n${read("notes.js")}`;
fs.writeFileSync(path.join(__dirname, "main.js"), text);
console.log("built main.js");
