// Copyright (c) 2026 Y-Labs. See LICENSE (PolyForm Noncommercial 1.0.0).
// StudyOS Notes: fast class notes.
//   /      insert a block (definition, exercise, table, drawing…)
//   \name  insert a symbol (\sigma → σ, \in → ∈); \ alone: the ones of this note, your recent ones, the likely ones
//   ## + space   a numbered part; ### a section, #### a subsection… (I. / 1. / 1.1 / 1.1.1, style in settings). Numbers stay in order.
//   hover a table  a bar adds or removes rows and columns
//   -> => <= >= != <->   become → ⇒ ≤ ≥ ≠ ↔ (Ctrl+Z gives the plain text back); x^2 → x², q_0 → q₀, x^{n+1} → xⁿ⁺¹, a_{word} → a<sub>word</sub>
//   select text  a small bar: bold, highlight, italic, strike, code
const { Plugin, EditorSuggest, Modal, Notice, PluginSettingTab, Setting, setIcon, editorInfoField, requestUrl, arrayBufferToBase64, MarkdownRenderer, parseYaml, stringifyYaml } = require("obsidian");
const { EditorView, ViewPlugin, keymap, showTooltip } = require("@codemirror/view");
const { StateField, Prec } = require("@codemirror/state");
const { syntaxTree } = require("@codemirror/language");
const { isolateHistory } = require("@codemirror/commands");

const STUDYOS_URL = "https://github.com/yannx8/studyos-notes#studyos";
// FULL: built into the StudyOS vault (photos to notes, phone/computer merges, setup). The community build sets it to false.
const FULL = false;

const DEFAULTS = { arrows: true, scripts: true, numbering: true, numberEverywhere: false, toolbar: true, style: "roman-decimal", provider: "gemini", apiKey: "", photoModel: "claude-opus-5-5", geminiModel: "gemini-3.8-flash" };

// ---------- helpers ----------

/** Inside code, math or the properties: no shortcut there (math keeps its LaTeX). */
function inCode(state, pos) {
	for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) if (/code|math|frontmatter/i.test(n.name)) return true;
	return false;
}

const ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
const roman = (n) => ROMAN.reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, "");
const letter = (n) => String.fromCharCode(96 + Math.min(Math.max(n, 1), 26));
const lroman = (n) => roman(Math.max(n, 1)).toLowerCase();

// Numbering styles. c = counters of ## … ######, L = level (0 for ##). Settings > StudyOS Notes picks one.
const STYLES = {
	"roman-decimal": { label: "I. · 1. · 1.1 · 1.1.1", fmt: (c, L) => (L === 0 ? `${roman(c[0])}.` : L === 1 ? `${c[1]}.` : c.slice(1, L + 1).join(".")) },
	decimal: { label: "1. · 1.1 · 1.1.1 · 1.1.1.1", fmt: (c, L) => (L === 0 ? `${c[0]}.` : c.slice(0, L + 1).join(".")) },
	"roman-letter": { label: "I. · 1. · 1.a · 1.a.i", fmt: (c, L) => [`${roman(c[0])}.`, `${c[1]}.`, `${c[1]}.${letter(c[2])}`, `${c[1]}.${letter(c[2])}.${lroman(c[3])}`, `${c[1]}.${letter(c[2])}.${lroman(c[3])}.${c[4]}`][L] },
	classic: { label: "I. · 1. · a) · i)", fmt: (c, L) => [`${roman(c[0])}.`, `${c[1]}.`, `${letter(c[2])})`, `${lroman(c[3])})`, `${c[4]})`][L] },
};
let STYLE = "roman-decimal";
const setStyle = (s) => { STYLE = STYLES[s] ? s : "roman-decimal"; };

// A heading counts as numbered when it starts with a number of any style: I.  1.  1.2  1.2.3  1.a  a)  ii)
const NUMBERED = /^(#{2,6}[ \t]+)(\d+(?:\.(?:\d+|[a-z]+))+\.?|\d+\.|[IVXLCDM]+\.|[a-z]+\))(?=[ \t]|$)/;

/** Numbered headings in order, in the chosen style (I. / 1. / 1.1 / 1.1.1 …).
 * A heading without a number is left alone (and starts a new count below it). */
function renumberLines(lines, style) {
	const fmt = STYLES[style || STYLE].fmt;
	const out = lines.slice();
	const count = [0, 0, 0, 0, 0];
	let fence = false, front = lines[0] === "---";
	for (let i = 0; i < lines.length; i++) {
		const l = lines[i];
		if (front) { if (i > 0 && l === "---") front = false; continue; }
		if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
		if (fence) continue;
		const h = /^(#{1,6})[ \t]/.exec(l);
		if (!h) continue;
		const level = h[1].length - 2; // ## = 0 … ###### = 4
		if (level < 0) { count.fill(0); continue; }
		for (let k = level + 1; k < 5; k++) count[k] = 0;
		const m = NUMBERED.exec(l);
		if (!m) continue;
		count[level]++;
		out[i] = m[1] + fmt(count, level) + l.slice(m[0].length);
	}
	return out;
}

/** The changes that put every numbered heading of the view back in order (one undo step with the edit that called it). */
function renumberChanges(doc, lines) {
	const fixed = renumberLines(lines);
	const changes = [];
	for (let i = 0; i < lines.length; i++) if (fixed[i] !== lines[i]) { const l = doc.line(i + 1); changes.push({ from: l.from, to: l.to, insert: fixed[i] }); }
	return changes;
}

function renumberEditor(editor) {
	const view = editor.cm;
	const lines = view.state.doc.toString().split("\n");
	const changes = renumberChanges(view.state.doc, lines);
	if (changes.length) view.dispatch({ changes });
	return changes.length;
}

/** Puts a block at the cursor: on its own line, after a blank line when the line above has text. Cursor between before and after. */
function put(editor, pos, before, after = "") {
	const text = editor.getLine(pos.line);
	const left = text.slice(0, pos.ch);
	const quote = /^(\s*>\s*)*$/.test(left) ? left : null; // empty line, or an empty line inside a callout
	let at = pos, lead = "";
	const block = /^(>|\$\$|```|\||#)/.test(before);
	if (quote === null) { at = { line: pos.line, ch: text.length }; lead = block ? "\n\n" : "\n"; }
	else if (block && !quote && pos.line > 0 && editor.getLine(pos.line - 1).trim() && !/^\s*[-*+]\s|^\s*\d+[.)]\s/.test(before)) lead = "\n";
	const start = editor.posToOffset(at);
	editor.replaceRange(lead + before + after, at);
	editor.setCursor(editor.offsetToPos(start + lead.length + before.length));
}

function folderOf(file, sub) {
	const root = file.parent && file.parent.name === "Lectures" ? file.parent.parent : file.parent;
	return `${root && root.path !== "/" ? `${root.path}/` : ""}${sub}`;
}
async function ensureFolder(app, path) {
	if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path).catch(() => {});
}
function freeName(app, folder, base, ext) {
	let name = base;
	for (let n = 2; app.vault.getAbstractFileByPath(`${folder}/${name}.${ext}`); n++) name = `${base} ${n}`;
	return name;
}

// ---------- the / menu ----------

/** A numbered heading at the cursor; the numbers of the note fall back in order. */
function heading(ed, p, hashes) {
	put(ed, p, `${hashes} 1. `);
	renumberEditor(ed);
	const line = ed.getCursor().line;
	ed.setCursor({ line, ch: ed.getLine(line).length });
}

const callout = (type, title, body = true) => [`> [!${type}] ${title}`, body ? "\n> " : ""];
// [label, hint, icon, search words, action]
const BLOCKS = [
	["Part", () => STYLES[STYLE].label.split(" · ")[0], "heading-2", "heading title chapter h2", (ed, p) => heading(ed, p, "##")],
	["Section", () => STYLES[STYLE].label.split(" · ")[1], "heading-3", "heading subtitle h3", (ed, p) => heading(ed, p, "###")],
	["Subsection", () => STYLES[STYLE].label.split(" · ")[2], "heading-4", "heading h4", (ed, p) => heading(ed, p, "####")],
	["Sub-subsection", () => STYLES[STYLE].label.split(" · ")[3], "heading-5", "heading h5", (ed, p) => heading(ed, p, "#####")],
	["Definition", "the term, Enter, its meaning", "book-a", "def meaning term", (ed, p) => put(ed, p, "> [!definition] ")],
	["Example", "", "lightbulb", "eg instance", (ed, p) => put(ed, p, ...callout("example", "Example"))],
	["Important", "key point to remember", "star", "key remember highlight", (ed, p) => put(ed, p, ...callout("important", "Remember"))],
	["Exam tip", "trap, likely question", "triangle-alert", "warning exam trap", (ed, p) => put(ed, p, ...callout("warning", "Exam"))],
	["Exercise", "numbered by itself", "pencil-line", "exercise problem td practice", (ed, p) => {
		const n = ed.getValue().split("\n").slice(0, p.line).filter((l) => /^>\s*\[!exercise\]/.test(l)).length + 1;
		put(ed, p, ...callout("exercise", `Exercise ${n}`));
	}],
	["Solution", "folded: try first, then open", "check-check", "correction answer solution", (ed, p) => put(ed, p, "> [!solution]- Solution", "")],
	["Theorem", "property, rule, law", "sigma", "property rule law proposition lemma", (ed, p) => put(ed, p, "> [!theorem] ")],
	["Method", "steps, algorithm", "list-ordered", "steps algorithm procedure how", (ed, p) => put(ed, p, "> [!method] ", "\n> 1. ")],
	["Summary", "after class, in your own words", "scroll-text", "summary recap key ideas resume", (ed, p) => put(ed, p, ...callout("summary", "Summary"))],
	["Self-test", "questions for the review, folded", "circle-help", "quiz test questions review", (ed, p) => put(ed, p, "> [!quiz]- Self-test\n> - Q: ")],
	["Note", "remark, aside", "info", "remark aside info", (ed, p) => put(ed, p, ...callout("note", "Note"))],
	["Not clear", "to ask the teacher", "circle-help", "question ask unclear", (ed, p) => put(ed, p, ...callout("question", "Not clear yet"))],
	["Table", "pick the size", "table", "grid array columns rows", (ed, p, pl) => new TableModal(pl.app, ed, p).open()],
	["Add row", "below the cursor (or hover the table)", "arrow-down-to-line", "table row line", (ed) => tableCommand(ed, "rowBelow")],
	["Add column", "right of the cursor (or hover the table)", "arrow-right-to-line", "table column col", (ed) => tableCommand(ed, "colRight")],
	["Formula", "LaTeX block", "square-function", "math equation latex", (ed, p) => put(ed, p, "$$\n", "\n$$")],
	["Bullet list", "", "list", "bullets list", (ed, p) => put(ed, p, "- ")],
	["Numbered list", "", "list-ordered", "ordered numbers list", (ed, p) => put(ed, p, "1. ")],
	["Lettered list", "a) b) c)", "list-tree", "letters alphabet list", (ed, p) => put(ed, p, "a) ")],
	["Code", "", "code", "program snippet", (ed, p) => put(ed, p, "```\n", "\n```")],
	["Drawing", "Excalidraw, opens beside", "pen-tool", "draw sketch excalidraw diagram figure", (ed, p, pl) => pl.drawing(ed, p)],
	["Mind map", "Canvas, opens beside", "layout-dashboard", "canvas map", (ed, p, pl) => pl.canvas(ed, p)],
	["Board photo", "read, placed in the right lecture", "camera", "photo picture snap image", (ed, p, pl) => pl.photos.capture()],
	["Divider", "", "minus", "line separator hr", (ed, p) => put(ed, p, "---\n")],
].filter((b) => FULL || b[0] !== "Board photo");

function score(words, q) {
	if (!q) return 1;
	q = q.toLowerCase();
	let best = 0;
	for (const w of words) {
		const lw = w.toLowerCase();
		if (lw === q) best = Math.max(best, 4);
		else if (lw.startsWith(q)) best = Math.max(best, 3);
		else if (lw.includes(q)) best = Math.max(best, 1);
	}
	return best;
}

class SlashSuggest extends EditorSuggest {
	constructor(plugin) { super(plugin.app); this.plugin = plugin; this.limit = 30; }
	onTrigger(cursor, editor) {
		const left = editor.getLine(cursor.line).slice(0, cursor.ch);
		const m = /(?:^|[\s>])\/([\w-]{0,20})$/.exec(left);
		if (!m || inCode(editor.cm.state, editor.posToOffset(cursor))) return null;
		return { start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 }, end: cursor, query: m[1] };
	}
	getSuggestions(ctx) {
		return BLOCKS.map((b) => ({ b, s: score([b[0], ...b[3].split(" ")], ctx.query) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.b);
	}
	renderSuggestion(b, el) {
		el.addClass("sn-item");
		setIcon(el.createSpan({ cls: "sn-icon" }), b[2]);
		el.createSpan({ cls: "sn-label", text: b[0] });
		const hint = typeof b[1] === "function" ? b[1]() : b[1];
		if (hint) el.createSpan({ cls: "sn-hint", text: hint });
	}
	selectSuggestion(b) {
		const { editor, start, end } = this.context;
		editor.replaceRange("", start, end);
		Promise.resolve(b[4](editor, start, this.plugin)).catch((e) => new Notice(e.message || String(e)));
	}
}

// ---------- \ symbols ----------

// Likely in class before any history: arrows, relations, sets, logic, the Greek of math and CS.
const LIKELY = "→⇒≤≥≠≈∈∉⊆∪∩∅∀∃¬∧∨εΣδλαβπθμσΔ∞±×÷√∑²³₀₁✓";

class SymbolSuggest extends EditorSuggest {
	constructor(plugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.limit = 14;
		this.all = [];
		for (const [, list] of plugin.symbols) for (const [c, names] of list) if (!this.all.some((x) => x.c === c)) this.all.push({ c, words: names.split(" ") });
	}
	onTrigger(cursor, editor) {
		const left = editor.getLine(cursor.line).slice(0, cursor.ch);
		const m = /\\([A-Za-z0-9^_+\-/=()]{0,20})$/.exec(left);
		if (!m || inCode(editor.cm.state, editor.posToOffset(cursor))) return null;
		return { start: { line: cursor.line, ch: cursor.ch - m[1].length - 1 }, end: cursor, query: m[1] };
	}
	/** Ranked: the name you typed, then the symbols already in this note, the ones you use (often, lately), the likely ones. */
	getSuggestions(ctx) {
		const q = ctx.query;
		const text = ctx.editor.getValue();
		const usage = this.plugin.usage();
		const now = Date.now();
		const out = [];
		for (const x of this.all) {
			let s = 0;
			if (q) {
				s = score(x.words, q) * 10;
				if (x.words[0] === q) s = 60; // exact case: \Sigma → Σ before σ
				if (!s) continue;
			}
			const u = usage[x.c];
			const here = text.includes(x.c) ? 4 : 0;
			const used = u ? Math.log2(1 + u.n) * 2 + (now - u.t < 3 * 864e5 ? 3 : 0) : 0;
			const k = LIKELY.indexOf(x.c), likely = k < 0 ? 0 : 1 + (LIKELY.length - k) / LIKELY.length; // earlier in the list = more likely
			if (!q && !here && !used && !likely) continue;
			out.push({ ...x, s: s + here + used + likely, here, used });
		}
		return out.sort((a, b) => b.s - a.s);
	}
	renderSuggestion(x, el) {
		el.addClass("sn-item");
		el.createSpan({ cls: "sn-char", text: x.c });
		el.createSpan({ cls: "sn-label", text: `\\${x.words[0]}` });
		const tag = x.used ? "recent" : x.here ? "in this note" : x.words.slice(1, 3).join(", ");
		if (tag) el.createSpan({ cls: "sn-hint", text: tag });
	}
	selectSuggestion(x) {
		const { editor, start, end } = this.context;
		editor.replaceRange(x.c, start, end);
		editor.setCursor({ line: start.line, ch: start.ch + x.c.length });
		this.plugin.remember(x.c);
	}
}

// ---------- tables ----------

class TableModal extends Modal {
	constructor(app, editor, pos) { super(app); this.editor = editor; this.pos = pos; }
	onOpen() {
		this.modalEl.addClass("sn-table-modal");
		this.titleEl.setText("Table");
		const label = this.contentEl.createDiv({ cls: "sn-table-size", text: "3 columns × 3 rows" });
		const grid = this.contentEl.createDiv({ cls: "sn-table-grid" });
		const C = 8, R = 10;
		let pick = [3, 3];
		const cells = [];
		const show = () => {
			for (const c of cells) c.el.toggleClass("is-on", c.x <= pick[0] && c.y <= pick[1]);
			label.setText(`${pick[0]} column${pick[0] > 1 ? "s" : ""} × ${pick[1]} row${pick[1] > 1 ? "s" : ""} (plus the header)`);
		};
		for (let y = 1; y <= R; y++) for (let x = 1; x <= C; x++) {
			const el = grid.createDiv({ cls: "sn-cell" });
			cells.push({ el, x, y });
			el.addEventListener("mouseenter", () => { pick = [x, y]; show(); });
			el.addEventListener("click", () => this.insert(x, y));
		}
		this.contentEl.createDiv({ cls: "sn-table-help", text: "Arrows then Enter, or click. In the table: Tab next cell, Shift+Tab back. Hover the table for a bar that adds or removes rows and columns." });
		this.scope.register([], "ArrowRight", () => { pick[0] = Math.min(C, pick[0] + 1); show(); return false; });
		this.scope.register([], "ArrowLeft", () => { pick[0] = Math.max(1, pick[0] - 1); show(); return false; });
		this.scope.register([], "ArrowDown", () => { pick[1] = Math.min(R, pick[1] + 1); show(); return false; });
		this.scope.register([], "ArrowUp", () => { pick[1] = Math.max(1, pick[1] - 1); show(); return false; });
		this.scope.register([], "Enter", () => { this.insert(pick[0], pick[1]); return false; });
		show();
	}
	insert(cols, rows) {
		this.close();
		const row = `|${"   |".repeat(cols)}`;
		const text = [row, `|${" --- |".repeat(cols)}`, ...Array(rows).fill(row)].join("\n");
		put(this.editor, this.pos, "| ", text.slice(2) + "\n");
		this.editor.focus();
	}
	onClose() { this.contentEl.empty(); }
}

// ---------- tables: rows and columns after the table is made ----------

const cellsOf = (line) => {
	let t = line.trim();
	if (t.startsWith("|")) t = t.slice(1);
	if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
	// Split on | but not on \| (no lookbehind: older iPhones do not support it).
	return t.replace(/\\\|/g, "\u0000").split("|").map((x) => x.replace(/\u0000/g, "\\|").trim());
};
const rowOf = (cells) => `| ${cells.join(" | ")} |`;
const isTableLine = (l) => /^\s*\|/.test(l);

/** The table around a line: its first and last line numbers (1-based), or null. */
function tableAt(doc, lineNo) {
	if (lineNo < 1 || lineNo > doc.lines || !isTableLine(doc.line(lineNo).text)) return null;
	let a = lineNo, b = lineNo;
	while (a > 1 && isTableLine(doc.line(a - 1).text)) a--;
	while (b < doc.lines && isTableLine(doc.line(b + 1).text)) b++;
	return b - a >= 1 ? { a, b } : null;
}

/** row: 0 = header, 1… = body rows. col: 0-based. op: rowBelow, rowAbove, colRight, colLeft, delRow, delCol. */
function editTable(view, t, op, row, col) {
	const doc = view.state.doc;
	const rows = [];
	for (let n = t.a; n <= t.b; n++) rows.push(cellsOf(doc.line(n).text));
	const cols = rows[0].length;
	row = Math.max(0, Math.min(row, rows.length - 2));
	col = Math.max(0, Math.min(col, cols - 1));
	const blank = () => Array(cols).fill("");
	const line = row === 0 ? 0 : row + 1; // the separator is rows[1]
	if (op === "rowBelow") rows.splice(row === 0 ? 2 : line + 1, 0, blank());
	else if (op === "rowAbove") rows.splice(row === 0 ? 2 : line, 0, blank());
	else if (op === "colRight" || op === "colLeft") rows.forEach((r, i) => r.splice(op === "colRight" ? col + 1 : col, 0, i === 1 ? "---" : ""));
	else if (op === "delRow") { if (row === 0 || rows.length <= 3) return false; rows.splice(line, 1); }
	else if (op === "delCol") { if (cols <= 1) return false; rows.forEach((r) => r.splice(col, 1)); }
	const from = doc.line(t.a).from, to = doc.line(t.b).to;
	view.dispatch({ changes: { from, to, insert: rows.map(rowOf).join("\n") }, userEvent: "input" });
	return true;
}

const TABLE_OPS = [["rowAbove", "arrow-up-to-line", "Row above"], ["rowBelow", "arrow-down-to-line", "Row below"], ["colLeft", "arrow-left-to-line", "Column left"], ["colRight", "arrow-right-to-line", "Column right"], ["delRow", "trash", "Delete row"], ["delCol", "trash-2", "Delete column"]];

/** Hover a table: a small bar above it adds or removes the row / column under the mouse. */
function tableBar() {
	return ViewPlugin.fromClass(class {
		constructor(view) {
			this.view = view;
			this.at = null;
			this.bar = document.body.createDiv({ cls: "sn-table-bar" });
			this.bar.hide();
			for (const [op, icon, title] of TABLE_OPS) {
				const b = this.bar.createEl("button", { attr: { "aria-label": title } });
				setIcon(b, icon);
				if (op.startsWith("del")) b.addClass("is-del");
				b.addEventListener("mousedown", (e) => { e.preventDefault(); this.run(op); });
			}
			this.label = this.bar.createSpan({ cls: "sn-table-where" });
			this.over = (e) => this.hover(e);
			this.hide = () => this.bar.hide();
			view.dom.addEventListener("mouseover", this.over);
			view.scrollDOM.addEventListener("scroll", this.hide, { passive: true });
			this.bar.addEventListener("mouseenter", () => clearTimeout(this.timer));
			this.bar.addEventListener("mouseleave", () => this.later());
		}
		later() { clearTimeout(this.timer); this.timer = setTimeout(this.hide, 500); }
		hover(e) {
			const widget = e.target.closest && e.target.closest(".cm-table-widget");
			const cell = e.target.closest && e.target.closest("td, th");
			if (!widget || !cell) return this.later();
			clearTimeout(this.timer);
			const tr = cell.parentElement;
			this.at = { widget, row: tr.parentElement.tagName === "THEAD" ? 0 : (tr.parentElement.tagName === "TBODY" ? [...tr.parentElement.children].indexOf(tr) + 1 : tr.rowIndex), col: [...tr.children].filter((c) => /^T[DH]$/.test(c.tagName)).indexOf(cell) };
			this.label.setText(this.at.row === 0 ? `header · column ${this.at.col + 1}` : `row ${this.at.row} · column ${this.at.col + 1}`);
			const r = widget.getBoundingClientRect();
			this.bar.show();
			this.bar.setCssStyles({ top: `${Math.max(4, r.top - this.bar.offsetHeight - 4)}px`, left: `${Math.max(4, r.left)}px` });
		}
		run(op) {
			if (!this.at) return;
			let pos;
			try { pos = this.view.posAtDOM(this.at.widget); } catch (e) { return; }
			const doc = this.view.state.doc;
			let n = doc.lineAt(pos).number;
			if (!isTableLine(doc.line(n).text) && n < doc.lines) n++;
			const t = tableAt(doc, n);
			if (!t || !editTable(this.view, t, op, this.at.row, this.at.col)) new Notice(op === "delRow" ? "A table keeps its header and one row." : "A table keeps one column.");
			this.bar.hide();
		}
		destroy() {
			this.view.dom.removeEventListener("mouseover", this.over);
			this.view.scrollDOM.removeEventListener("scroll", this.hide);
			clearTimeout(this.timer);
			this.bar.remove();
		}
	});
}

/** The same from the keyboard, for the table under the cursor (source mode, or the line of a table). */
function tableCommand(editor, op) {
	const view = editor.cm;
	const pos = view.state.selection.main.head;
	const line = view.state.doc.lineAt(pos);
	const t = tableAt(view.state.doc, line.number);
	if (!t) return new Notice("Put the cursor in a table, or hover the table for its bar.");
	const k = line.number - t.a;
	const row = k < 2 ? 0 : k - 1;
	const col = Math.max(0, line.text.slice(0, pos - line.from).split("|").length - 2);
	editTable(view, t, op, row, col);
}

// ---------- typing: arrows, x^2, q_0, numbered headings, lettered lists ----------

const AUTO = [ // [typed, text before, replacement of both]
	[">", "<-", "↔"], [">", "≤", "⇔"], [">", "-", "→"], [">", "=", "⇒"],
	["=", "<", "≤"], ["=", ">", "≥"], ["=", "!", "≠"],
];
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", n: "ⁿ" };
const SUB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉" };
const SUP_CHARS = new Set(Object.values(SUP)), SUB_CHARS = new Set(Object.values(SUB));

function typing(plugin) {
	return EditorView.inputHandler.of((view, from, to, text) => {
		if (text.length !== 1 || view.composing || from !== to) return false;
		const s = plugin.settings;
		const state = view.state;
		const line = state.doc.lineAt(from);
		const left = line.text.slice(0, from - line.from);
		if (inCode(state, from)) return false;
		const word = (/\S*$/.exec(left) || [""])[0];
		if (/\[\[|:\/\/|\]\(/.test(word)) return false; // links and file names stay as typed
		// "## " on an empty line: the next part number (I., II.), and the numbers below move up.
		if (s.numbering && text === " " && plugin.isCourseNote(state) && /^#{2,6}$/.test(left) && !line.text.slice(left.length).trim()) {
			const placeholder = "1.";
			const lines = state.doc.toString().split("\n");
			const idx = line.number - 1;
			lines[idx] = `${left} ${placeholder} `;
			const fixed = renumberLines(lines);
			const changes = [{ from: line.from, to: line.to, insert: fixed[idx] }];
			for (let i = 0; i < lines.length; i++) if (i !== idx && fixed[i] !== lines[i]) { const l = state.doc.line(i + 1); changes.push({ from: l.from, to: l.to, insert: fixed[i] }); }
			view.dispatch({ changes, selection: { anchor: line.from + fixed[idx].length }, userEvent: "input.type" });
			return true;
		}
		let rep = null, back = 0;
		const braced = text === "}" && s.scripts && /(?:[\p{L}\p{N})\]}>])([\^_])\{([^{}]{1,40})$/u.exec(left);
		if (braced) { rep = toScript(braced[2], braced[1] === "^" ? "sup" : "sub"); back = braced[2].length + 2; }
		if (!rep && s.arrows) for (const [t, b, r] of AUTO) if (text === t && left.endsWith(b)) { rep = r; back = b.length; break; }
		if (!rep && s.scripts) {
			const p = left.slice(-1), pp = left.slice(-2, -1);
			const base = /[\p{L}\p{N})\]}]/u.test(pp) && pp !== "[";
			if (p === "^" && SUP[text] && base && left.slice(-3, -2) !== "[") { rep = SUP[text]; back = 1; }
			else if (p === "_" && SUB[text] && /[\p{L}\p{N})]/u.test(pp)) { rep = SUB[text]; back = 1; }
			else if (SUP_CHARS.has(p) && SUP[text] && /\d/.test(text)) { rep = SUP[text]; back = 0; }
			else if (SUB_CHARS.has(p) && SUB[text]) { rep = SUB[text]; back = 0; }
		}
		if (!rep) return false;
		// Two steps: the key as typed, then the symbol. Ctrl+Z takes back only the symbol.
		view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + 1 }, userEvent: "input.type" });
		view.dispatch({ changes: { from: from - back, to: from + 1, insert: rep }, selection: { anchor: from - back + rep.length }, annotations: isolateHistory.of("before"), userEvent: "input.type" });
		return true;
	});
}

/** Enter in a lettered list "a) …" starts "b) "; Enter on an empty item leaves the list. */
function letteredLists() {
	return Prec.high(keymap.of([{
		key: "Enter",
		run: (view) => {
			const sel = view.state.selection.main;
			if (!sel.empty) return false;
			const line = view.state.doc.lineAt(sel.head);
			if (sel.head !== line.to) return false;
			const m = /^((?:\s*>)*\s*)([a-zA-Z])\)\s(.*)$/.exec(line.text);
			if (!m || inCode(view.state, sel.head) || m[2] === "z" || m[2] === "Z") return false;
			if (!m[3].trim()) { view.dispatch({ changes: { from: line.from, to: line.to, insert: m[1].replace(/\s+$/, "") }, userEvent: "input" }); return true; }
			const next = `\n${m[1]}${String.fromCharCode(m[2].charCodeAt(0) + 1)}) `;
			view.dispatch({ changes: { from: sel.head, insert: next }, selection: { anchor: sel.head + next.length }, userEvent: "input" });
			return true;
		},
	}]));
}

// ---------- exponents and indices: x^{n+1}, a_{ij}, or the x² / x₂ buttons of the selection bar ----------

const SUP_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", k: "ᵏ", x: "ˣ", T: "ᵀ", "*": "*" };
const SUB_MAP = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", i: "ᵢ", j: "ⱼ", k: "ₖ", n: "ₙ", m: "ₘ", x: "ₓ" };

/** Up or down: small Unicode characters when every character has one (x², q₀, aⁿ⁺¹), else <sup>…</sup> / <sub>…</sub>
 * (readable for words: element<sup>element</sup>). */
function toScript(text, kind) {
	const map = kind === "sup" ? SUP_MAP : SUB_MAP;
	const chars = [...text];
	if (chars.length && chars.every((c) => map[c])) return chars.map((c) => map[c]).join("");
	return `<${kind}>${text}</${kind}>`;
}

/** The selection goes up (sup) or down (sub); pressed again, it comes back. */
function toggleScript(view, kind) {
	const { from, to } = view.state.selection.main;
	const doc = view.state.doc;
	const inner = doc.sliceString(from, to);
	const open = `<${kind}>`, close = `</${kind}>`;
	const map = kind === "sup" ? SUP_MAP : SUB_MAP;
	const back = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
	let out;
	if (doc.sliceString(from - open.length, from) === open && doc.sliceString(to, to + close.length) === close) {
		view.dispatch({ changes: { from: from - open.length, to: to + close.length, insert: inner }, selection: { anchor: from - open.length, head: to - open.length } });
		return view.focus();
	}
	if (inner.startsWith(open) && inner.endsWith(close)) out = inner.slice(open.length, -close.length);
	else if ([...inner].every((c) => back[c] && c !== "*")) out = [...inner].map((c) => back[c]).join("");
	else out = toScript(inner, kind);
	view.dispatch({ changes: { from, to, insert: out }, selection: { anchor: from, head: from + out.length } });
	view.focus();
}

/** Formatting off: the marks around and inside the selection go. */
function clearMarks(view) {
	const { from, to } = view.state.selection.main;
	const doc = view.state.doc;
	let a = from, b = to;
	for (let grew = true; grew;) {
		grew = false;
		for (const m of ["**", "==", "~~", "*", "`", "$", "<sup>", "<sub>"]) {
			const end = m.startsWith("<") ? m.replace("<", "</") : m;
			if (doc.sliceString(a - m.length, a) === m && doc.sliceString(b, b + end.length) === end) { a -= m.length; b += end.length; grew = true; }
		}
	}
	const clean = doc.sliceString(a, b).replace(/<\/?su[pb]>|\*\*|==|~~|\*|`|\$/g, "");
	view.dispatch({ changes: { from: a, to: b, insert: clean }, selection: { anchor: a, head: a + clean.length } });
	view.focus();
}

// ---------- highlighting: the bar over a selection ----------

function toggleWrap(view, mark) {
	const { from, to } = view.state.selection.main;
	const doc = view.state.doc;
	const inner = doc.sliceString(from, to);
	const n = mark.length;
	if (doc.sliceString(from - n, from) === mark && doc.sliceString(to, to + n) === mark) {
		view.dispatch({ changes: [{ from: from - n, to: from, insert: "" }, { from: to, to: to + n, insert: "" }], selection: { anchor: from - n, head: to - n } });
	} else if (inner.length > 2 * n && inner.startsWith(mark) && inner.endsWith(mark)) {
		view.dispatch({ changes: { from, to, insert: inner.slice(n, -n) }, selection: { anchor: from, head: to - 2 * n } });
	} else {
		// Spaces stay outside the marks (== word == does not render).
		const lead = inner.length - inner.trimStart().length, trail = inner.length - inner.trimEnd().length;
		const a = from + lead, b = to - trail;
		view.dispatch({ changes: [{ from: a, insert: mark }, { from: b, insert: mark }], selection: { anchor: a + n, head: b + n } });
	}
	view.focus();
}

const MARKS = [["bold", "**", "Bold (Ctrl+B)"], ["highlighter", "==", "Highlight (Ctrl+Shift+H)"], ["italic", "*", "Italic (Ctrl+I)"], ["strikethrough", "~~", "Strike"], ["code", "`", "Code"]];
const MORE = [
	["superscript", "Exponent: x² (or type x^{…})", (v) => toggleScript(v, "sup")],
	["subscript", "Index: x₂ (or type x_{…})", (v) => toggleScript(v, "sub")],
	["sigma", "Math: $…$", (v) => toggleWrap(v, "$")],
	["remove-formatting", "Clear formatting", (v) => clearMarks(v)],
];

function selectionBar(plugin) {
	const tips = (state) => {
		const r = state.selection.main;
		if (!plugin.settings.toolbar || r.empty || state.doc.lineAt(r.from).number !== state.doc.lineAt(r.to).number || inCode(state, r.from)) return [];
		return [{
			pos: r.from, above: true, strictSide: false, arrow: false,
			create: (view) => {
				const dom = document.createElement("div");
				dom.className = "sn-bar";
				for (const [icon, mark, title] of MARKS) {
					const b = dom.createEl("button", { attr: { "aria-label": title } });
					setIcon(b, icon);
					b.addEventListener("mousedown", (e) => { e.preventDefault(); toggleWrap(view, mark); });
				}
				dom.createSpan({ cls: "sn-bar-sep" });
				for (const [icon, title, run] of MORE) {
					const b = dom.createEl("button", { attr: { "aria-label": title } });
					setIcon(b, icon);
					b.addEventListener("mousedown", (e) => { e.preventDefault(); run(view); });
				}
				return { dom };
			},
		}];
	};
	return StateField.define({
		create: tips,
		update: (v, tr) => (tr.docChanged || tr.selection ? tips(tr.state) : v),
		provide: (f) => showTooltip.computeN([f], (s) => s.field(f)),
	});
}

// ---------- plugin ----------

module.exports = class StudyOSNotes extends Plugin {
	async onload() {
		try { await this.start(); }
		catch (e) { this.report("load", e); }
	}
	/** Errors go to error.log next to this file, and on screen. */
	report(where, e) {
		console.error("[StudyOS Notes]", where, e);
		new Notice(`StudyOS Notes: ${where} failed: ${e && e.message}`, 10000);
		const path = `${this.manifest.dir}/error.log`;
		const line = `${new Date().toISOString()} ${where}: ${e && e.stack || e}
`;
		this.app.vault.adapter.read(path).catch(() => "").then((old) => this.app.vault.adapter.write(path, old + line));
	}
	async start() {
		this.settings = Object.assign({}, DEFAULTS, await this.loadData());
		setStyle(this.settings.style);
		this.symbols = SYMBOLS;
		this.registerEditorSuggest(new SlashSuggest(this));
		this.registerEditorSuggest(new SymbolSuggest(this));
		this.registerEditorExtension([typing(this), letteredLists(), selectionBar(this), tableBar()]);
		// Default hotkeys only inside StudyOS (community plugins leave hotkeys to the user).
		const cmd = (id, name, run, hotkeys) => this.addCommand({ id, name, editorCallback: (ed) => run(ed), hotkeys: FULL ? hotkeys : undefined });
		cmd("highlight", "Highlight the selection", (ed) => toggleWrap(ed.cm, "=="), [{ modifiers: ["Mod", "Shift"], key: "H" }]);
		cmd("row-below", "Table: add a row below", (ed) => tableCommand(ed, "rowBelow"), [{ modifiers: ["Mod", "Alt"], key: "ArrowDown" }]);
		cmd("col-right", "Table: add a column on the right", (ed) => tableCommand(ed, "colRight"), [{ modifiers: ["Mod", "Alt"], key: "ArrowRight" }]);
		cmd("del-row", "Table: delete this row", (ed) => tableCommand(ed, "delRow"));
		cmd("del-col", "Table: delete this column", (ed) => tableCommand(ed, "delCol"));
		cmd("table", "Insert a table", (ed) => new TableModal(this.app, ed, ed.getCursor()).open(), [{ modifiers: ["Mod", "Alt"], key: "T" }]);
		cmd("renumber", "Renumber headings (I. / 1. / a))", (ed) => new Notice(renumberEditor(ed) ? "Headings renumbered." : "Headings already in order."));
		cmd("insert", "Insert a block", (ed) => { const p = ed.getCursor(); ed.replaceRange("/", p); ed.setCursor({ line: p.line, ch: p.ch + 1 }); });
		this.addSettingTab(new Settings(this));
		if (FULL) this.startStudyOS();
	}
	startStudyOS() {
		// Photos → notes: camera / import, an offline queue read when online, a review before inserting.
		this.photos = new Photos(this);
		this.addRibbonIcon("camera", "Photos → notes", () => this.photos.capture());
		this.photoStatus = this.addStatusBarItem();
		this.photoStatus.addClass("mod-clickable");
		this.photoStatus.addEventListener("click", () => this.photos.reviewNext());
		this.addCommand({ id: "photo-camera", name: "Photos → notes: take photos", callback: () => this.photos.capture({ camera: true }) });
		this.addCommand({ id: "photo-import", name: "Photos → notes: import photos (gallery, a friend's notes)", callback: () => this.photos.capture({ camera: false }) });
		this.addCommand({ id: "photo-review", name: "Photos → notes: review what was read", callback: () => this.photos.reviewNext() });
		// Phone ↔ PC: conflict copies merged as Syncthing drops them, duplicate lectures merged, numbers kept unique.
		this.sync = new SyncGuard(this);
		this.addCommand({ id: "setup", name: "Set up StudyOS (term, courses, keys)", callback: () => this.setup() });
		this.app.workspace.onLayoutReady(async () => {
			// StudyOS commands before any board is opened (a new vault opens on an empty tab), then the first-run setup.
			const core = await this.photos.loadCore().catch((e) => { this.report("StudyOS core", e); return null; });
			if (core && core.registerCommands(this.app) && window.__studyos) window.__studyosCmds = window.__studyos.key;
			const dismissed = this.app.loadLocalStorage && this.app.loadLocalStorage("studyos-setup-later");
			if (core && !dismissed &&await needsSetup(this.app, core).catch(() => false)) this.setup(core);
			this.photos.process();
			this.sync.scan().catch((e) => console.error("[StudyOS Notes] sync", e));
			let later = 0;
			this.registerEvent(this.app.vault.on("create", (f) => {
				if (CONFLICT.test(f.path)) setTimeout(() => this.sync.conflict(f), 2000);
				else if (/\/Lectures\//.test(f.path)) { clearTimeout(later); later = setTimeout(() => this.sync.lectures(), 8000); }
			}));
		});
		this.registerDomEvent(window, "online", () => this.photos.process());
		this.registerInterval(window.setInterval(() => this.photos.process(), 5 * 60 * 1000));
	}
	async save() { await this.saveData(this.settings); }
	async setup(core) {
		core = core || await this.photos.loadCore();
		if (!core) return new Notice("StudyOS is missing from this vault (00 System/scripts/studyos).");
		new SetupWizard(this, core).open();
	}
	/** Numbered headings only in class notes (lectures, anything under 02 Academics/Courses except the course pages). */
	isCourseNote(state) {
		const info = state.field(editorInfoField, false);
		const f = info && info.file;
		if (!f) return false;
		const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
		if (this.settings.numberEverywhere || fm.numbered === true) return true;
		return ["lecture", "class-note"].includes(fm.type) || (fm.type !== "course" && f.path.startsWith("02 Academics/Courses/"));
	}
	/** Symbols you use, per device: kept out of the synced settings so phone and PC never fight over it. */
	usage() {
		if (!this._usage) this._usage = (this.app.loadLocalStorage && this.app.loadLocalStorage("studyos-notes-usage")) || {};
		return this._usage;
	}
	remember(c) {
		const u = this.usage();
		u[c] = { n: ((u[c] && u[c].n) || 0) + 1, t: Date.now() };
		if (this.app.saveLocalStorage) this.app.saveLocalStorage("studyos-notes-usage", u);
	}
	run(id, missing) {
		if (this.app.commands.findCommand(id)) this.app.commands.executeCommandById(id);
		else new Notice(missing);
	}
	async beside(ed, pos, path) {
		put(ed, pos, `![[${path}]]`, "\n");
		const f = this.app.vault.getAbstractFileByPath(path);
		if (f) await this.app.workspace.getLeaf("split", "vertical").openFile(f);
	}
	/** A dark Excalidraw drawing in <Course>/Drawings, shown in the note, opened beside it. */
	async drawing(ed, pos) {
		const file = this.app.workspace.getActiveFile();
		const EA = window.ExcalidrawAutomate;
		const ea = EA && EA.getAPI ? EA.getAPI() : EA;
		if (!file) return;
		if (!ea || typeof ea.create !== "function") { new Notice("Drawings use the free Excalidraw plugin: install and enable it, then try again.", 8000); window.open("obsidian://show-plugin?id=obsidian-excalidraw-plugin"); return; }
		const folder = folderOf(file, "Drawings");
		await ensureFolder(this.app, folder);
		const name = freeName(this.app, folder, `${file.basename} · drawing`, "excalidraw.md");
		ea.canvas.theme = "dark"; // Excalidraw's dark mode (the white page is shown dark)
		const path = await ea.create({ filename: name, foldername: folder, silent: true });
		await this.beside(ed, pos, path);
	}
	/** A canvas in <Course>/Maps with the note on it, linked in the note, opened beside it. */
	async canvas(ed, pos) {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		const folder = folderOf(file, "Maps");
		await ensureFolder(this.app, folder);
		const path = `${folder}/${freeName(this.app, folder, `${file.basename} · map`, "canvas")}.canvas`;
		await this.app.vault.create(path, JSON.stringify({ nodes: [{ id: "note", type: "file", file: file.path, x: -200, y: -150, width: 400, height: 300 }], edges: [] }, null, "\t"));
		await this.beside(ed, pos, path);
	}
};

class Settings extends PluginSettingTab {
	constructor(plugin) { super(plugin.app, plugin); this.plugin = plugin; }
	display() {
		const el = this.containerEl;
		el.empty();
		const s = this.plugin.settings;
		const toggle = (key, name, desc) => new Setting(el).setName(name).setDesc(desc).addToggle((t) => t.setValue(s[key]).onChange(async (v) => { s[key] = v; await this.plugin.save(); }));
		toggle("numbering", "Numbered headings", "## + space starts a numbered part, ### a section, #### a subsection…; the numbers stay in order.");
		new Setting(el).setName("Numbering style").setDesc("Parts · sections · subsections · sub-subsections. Changing it renumbers the note you are in.")
			.addDropdown((d) => {
				for (const [k, v] of Object.entries(STYLES)) d.addOption(k, v.label);
				d.setValue(s.style).onChange(async (v) => {
					s.style = v; setStyle(v); await this.plugin.save();
					const ed = this.app.workspace.activeEditor && this.app.workspace.activeEditor.editor;
					if (ed) renumberEditor(ed);
				});
			});
		toggle("arrows", "Arrows and signs", "-> → · => ⇒ · <-> ↔ · <=> ⇔ · <= ≤ · >= ≥ · != ≠ (Ctrl+Z gives the text back).");
		toggle("scripts", "Powers and indices", "x^2 → x² · q_0 → q₀ · x^{n+1} → xⁿ⁺¹ · e^{word} → e<sup>word</sup>");
		toggle("toolbar", "Bar over a selection", "Bold, highlight, italic, strike, code.");

		toggle("numberEverywhere", "Numbered headings in every note", "Off: only in class notes (type: lecture, or numbered: true in the note's properties, or notes under 02 Academics/Courses).");
		if (!FULL) {
			new Setting(el).setName("StudyOS").setDesc("Photos of the board turned into notes, your timetable, deadlines, marks and reviews: StudyOS, the complete vault for students.").addButton((b) => b.setButtonText("See StudyOS").onClick(() => window.open(STUDYOS_URL)));
			return;
		}
		new Setting(el).setName("Photos → notes").setHeading();
		new Setting(el).setName("Reader").setDesc("The vision model that reads the photos and places them in your lectures.")
			.addDropdown((d) => d.addOption("claude", "Claude (Anthropic)").addOption("gemini", "Gemini (Google)").setValue(s.provider).onChange(async (v) => { s.provider = v; await this.plugin.save(); this.display(); }));
		new Setting(el).setName("API key").setDesc(s.provider === "gemini" ? "From aistudio.google.com. Stored in this vault's plugin settings." : "From console.anthropic.com. Stored in this vault's plugin settings.")
			.addText((t) => { t.inputEl.type = "password"; t.setPlaceholder("paste the key").setValue(s.apiKey).onChange(async (v) => { s.apiKey = v.trim(); await this.plugin.save(); }); });
		if (s.provider === "gemini") new Setting(el).setName("Model").setDesc("Gemini model name.").addText((t) => t.setValue(s.geminiModel).onChange(async (v) => { s.geminiModel = v.trim(); await this.plugin.save(); }));
		else new Setting(el).setName("Model").setDesc("Opus reads handwriting and math best; Haiku costs the least.").addDropdown((d) => { for (const [k, v] of CLAUDE_MODELS) d.addOption(k, v); d.setValue(s.photoModel).onChange(async (v) => { s.photoModel = v; await this.plugin.save(); }); });
		new Setting(el).setName("Check").setDesc("Sends a tiny request to see that the key and model work.").addButton((b) => b.setButtonText("Test").onClick(async () => {
			b.setDisabled(true);
			try { await testReader(s); new Notice("The reader works."); } catch (e) { new Notice(`Not working: ${e.message}`, 8000); }
			b.setDisabled(false);
		}));
	}
}
