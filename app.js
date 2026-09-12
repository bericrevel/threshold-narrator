/* Threshold Narrator — client-side book reader + dramatic TTS */

const $ = (id) => document.getElementById(id);
const state = {
  title: "",
  chapters: [],
  chapter: 0,
  para: 0,
  playing: false,
  voices: [],
};

const SAMPLE = {
  title: "The Modern Maker — Dedication & Foreword",
  chapters: [
    {
      title: "Dedication",
      text: `To my beloved children—Triston, Hayden, Beric, Layne, Lily, Willow, Attikus, Atlas, and the Twins—and to my grandchildren yet to come. This book is my heart laid bare, forged from a lifetime of curiosity and love. May these words be your shield, your spark, and your guide. Build boldly, my dears, for the future is yours to reclaim.`,
    },
    {
      title: "Foreword: A Father's Whisper in the Wind",
      text: `My children, as I write this under the glow of a salvaged LED array powered by a battery I brought back from the dead, know this: this is no ordinary manual. It is a love letter written in circuits and wires, in plants and earth, in survival and ingenuity. If the world crumbles, these pages carry the light of knowledge so you may rise again.\n\nBut first, let me tell you who I am—not the father you deserved, but the one you got.\n\nI was born into a world that didn't want me. San Antonio ghettos, parents whose demons were stronger than their love for us five kids. We moved between relatives who took us in out of duty rather than desire. I was the oldest, which meant I learned early that childhood was a luxury we couldn't afford.\n\nWhile other kids worried about homework, I worried about whether the lights would stay on. While they played video games, I was taking apart broken radios and TVs, trying to understand the magic inside the circuits. Not because I was brilliant, but because broken things were all we had, and if I couldn't fix them, we went without.\n\nAt thirteen, I made a choice that changed everything. I stole a car. I got caught, of course. The day I was supposed to come home—to my grandmother's place in Junction, Texas—my grandmother walked up to the judge and told him she couldn't control me. That I couldn't come back to her house.\n\nI will never forget that moment. The one person I thought would always stand by me had given up.\n\nGod was there in those dark times, even when I couldn't see Him. Every circuit that finally worked, every broken appliance that came back to life, every small victory against impossible odds—those were His whispers.\n\nYou are enough. You have always been enough. And when the world tries to break you—and it will—remember that broken things can be fixed, discarded things can find new purpose, and even in the darkest times, there's always light if you know where to look for it.`,
    },
  ],
};

const THRESHOLD_OPENERS = [
  "The latch is warm from someone else's hand.",
  "You are already inside the page. Do not look for the door behind you.",
  "Rain finds the hole in the roof before you do.",
  "You taste copper. That is how you know the chapter has started.",
];

if (window["pdfjsLib"]) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function setStatus(msg) {
  $("status").textContent = msg || "";
}

function cleanText(s) {
  return String(s || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitChapters(raw, fallbackTitle) {
  const text = cleanText(raw);
  if (!text) return [];

  const patterns = [
    /(?:^|\n)(#{1,3}\s+[^\n]+)/g,
    /(?:^|\n)((?:CHAPTER|Chapter|BOOK|Book|PART|Part|VOLUME|Volume|FOREWORD|Foreword|DEDICATION|Dedication|PROLOGUE|Prologue|EPILOGUE|Epilogue)[^\n]{0,80})/g,
  ];

  let cuts = [];
  for (const re of patterns) {
    const found = [];
    let m;
    const r = new RegExp(re.source, "g");
    while ((m = r.exec(text))) {
      found.push({ i: m.index + (m[0].startsWith("\n") ? 1 : 0), title: m[1].replace(/^#+\s*/, "").trim() });
    }
    if (found.length >= 2) {
      cuts = found;
      break;
    }
  }

  if (!cuts.length) {
    const chunks = chunkByWords(text, 900);
    return chunks.map((t, n) => ({ title: chunks.length === 1 ? fallbackTitle : `Section ${n + 1}`, text: t }));
  }

  const chapters = [];
  if (cuts[0].i > 80) {
    const pre = text.slice(0, cuts[0].i).trim();
    if (pre) chapters.push({ title: fallbackTitle || "Opening", text: pre });
  }
  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i].i;
    const end = i + 1 < cuts.length ? cuts[i + 1].i : text.length;
    const body = text.slice(start, end).trim();
    if (body.length > 20) chapters.push({ title: cuts[i].title || `Chapter ${i + 1}`, text: body });
  }
  return chapters;
}

function chunkByWords(text, size) {
  const paras = text.split(/\n{2,}/);
  const out = [];
  let buf = "";
  let words = 0;
  for (const p of paras) {
    const w = p.split(/\s+/).length;
    if (words + w > size && buf) {
      out.push(buf.trim());
      buf = "";
      words = 0;
    }
    buf += (buf ? "\n\n" : "") + p;
    words += w;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parasOf(chapter) {
  return chapter.text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function renderBook() {
  $("bookMeta").textContent = state.title || "Untitled";
  const ch = state.chapters[state.chapter];
  $("chapterTitle").textContent = ch ? ch.title : "—";
  const toc = $("toc");
  toc.innerHTML = "";
  state.chapters.forEach((c, i) => {
    const li = document.createElement("li");
    li.className = i === state.chapter ? "on" : "";
    li.innerHTML = `${escapeHtml(c.title)}<small>${c.text.split(/\s+/).length} words</small>`;
    li.onclick = () => {
      stopSpeech();
      state.chapter = i;
      state.para = 0;
      persist();
      renderBook();
    };
    toc.appendChild(li);
  });
  renderReader();
  updateBar();
}

function renderReader() {
  const ch = state.chapters[state.chapter];
  const box = $("reader");
  if (!ch) {
    box.innerHTML = "";
    return;
  }
  const parts = parasOf(ch);
  box.innerHTML = parts
    .map((p, i) => `<p class="${i === state.para ? "now" : ""}" data-i="${i}">${escapeHtml(p)}</p>`)
    .join("");
  const now = box.querySelector(".now");
  if (now) now.scrollIntoView({ block: "center", behavior: "smooth" });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;" }[c]));
}

function updateBar() {
  const total = state.chapters.reduce((n, c) => n + parasOf(c).length, 0) || 1;
  let done = 0;
  for (let i = 0; i < state.chapter; i++) done += parasOf(state.chapters[i]).length;
  done += state.para;
  $("bar").style.width = Math.min(100, (done / total) * 100) + "%";
}

function persist() {
  try {
    localStorage.setItem(
      "tn-progress",
      JSON.stringify({ title: state.title, chapter: state.chapter, para: state.para })
    );
  } catch (_) {}
}

async function ingestFile(file) {
  setStatus("Opening " + file.name + "…");
  const name = file.name.replace(/\.[^.]+$/, "");
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  let raw = "";
  try {
    if (ext === "pdf") raw = await readPdf(file);
    else if (ext === "docx") raw = await readDocx(file);
    else if (ext === "epub") raw = await readEpub(file);
    else raw = await file.text();
  } catch (err) {
    setStatus("Could not read file: " + err.message);
    return;
  }
  raw = stripHtml(raw);
  const chapters = splitChapters(raw, name);
  if (!chapters.length) {
    setStatus("No readable text found. If this is a scanned PDF, it needs OCR first.");
    return;
  }
  state.title = name;
  state.chapters = chapters;
  state.chapter = 0;
  state.para = 0;
  persist();
  renderBook();
  setStatus(chapters.length + " section" + (chapters.length === 1 ? "" : "s") + " ready.");
}

async function readPdf(file) {
  if (!window.pdfjsLib) throw new Error("PDF engine failed to load");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    setStatus("Reading page " + i + " of " + pdf.numPages);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it) => it.str).join(" ");
    parts.push(line);
  }
  return parts.join("\n\n");
}

async function readDocx(file) {
  if (!window.mammoth) throw new Error("Word engine failed to load");
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return res.value || "";
}

async function readEpub(file) {
  if (!window.JSZip) throw new Error("EPUB engine failed to load");
  const zip = await JSZip.loadAsync(file);
  const names = Object.keys(zip.files)
    .filter((n) => /\.(xhtml|html|htm|xml)$/i.test(n) && !/meta-inf/i.test(n))
    .sort();
  const chunks = [];
  for (const n of names) {
    const html = await zip.files[n].async("string");
    chunks.push(stripHtml(html));
  }
  return chunks.join("\n\n");
}

function stripHtml(s) {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/"/g, '"');
}

function loadVoices() {
  const list = speechSynthesis.getVoices();
  state.voices = list;
  const sel = $("voice");
  const prev = sel.value;
  sel.innerHTML = "";
  if (!list.length) {
    const o = document.createElement("option");
    o.textContent = "System default";
    o.value = "";
    sel.appendChild(o);
    return;
  }
  const ranked = [...list].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  ranked.forEach((v) => {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = v.name + (v.lang ? " · " + v.lang : "");
    sel.appendChild(o);
  });
  if (prev && ranked.some((v) => v.name === prev)) sel.value = prev;
}

function scoreVoice(v) {
  const n = (v.name || "").toLowerCase();
  const lang = (v.lang || "").toLowerCase();
  let s = 0;
  if (lang.startsWith("en")) s += 5;
  if (/male|david|daniel|arthur|aaron|fred|ravi|guy|baritone|gordon/.test(n)) s += 4;
  if (/premium|enhanced|neural|natural/.test(n)) s += 3;
  if (/google/.test(n)) s += 2;
  if (/samantha|karen|moira|female|zira|siri/.test(n)) s -= 1;
  return s;
}

function currentVoice() {
  const name = $("voice").value;
  return state.voices.find((v) => v.name === name) || null;
}

function speakCurrent() {
  const ch = state.chapters[state.chapter];
  if (!ch) return;
  const parts = parasOf(ch);
  if (!parts.length) return;
  if (state.para >= parts.length) {
    if (state.chapter + 1 < state.chapters.length) {
      state.chapter += 1;
      state.para = 0;
      persist();
      renderBook();
      speakCurrent();
    } else {
      state.playing = false;
      setStatus("End of book.");
    }
    return;
  }

  let text = parts[state.para];
  if ($("mode").value === "threshold" && state.para === 0) {
    const line = THRESHOLD_OPENERS[state.chapter % THRESHOLD_OPENERS.length];
    text = line + " " + text;
  }

  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = currentVoice();
  if (voice) u.voice = voice;
  u.rate = Number($("rate").value);
  u.pitch = Number($("pitch").value);
  u.onend = () => {
    if (!state.playing) return;
    state.para += 1;
    persist();
    renderReader();
    updateBar();
    speakCurrent();
  };
  u.onerror = () => {
    state.playing = false;
    setStatus("Speech stopped.");
  };
  state.playing = true;
  renderReader();
  updateBar();
  speechSynthesis.speak(u);
}

function stopSpeech() {
  state.playing = false;
  speechSynthesis.cancel();
}

$("pick").onclick = () => $("file").click();
$("drop").onclick = () => $("file").click();
$("file").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) ingestFile(f);
};

["dragenter", "dragover"].forEach((ev) => {
  $("drop").addEventListener(ev, (e) => {
    e.preventDefault();
    $("drop").classList.add("hot");
  });
});
["dragleave", "drop"].forEach((ev) => {
  $("drop").addEventListener(ev, (e) => {
    e.preventDefault();
    $("drop").classList.remove("hot");
  });
});
$("drop").addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) ingestFile(f);
});

$("demo").onclick = () => {
  stopSpeech();
  state.title = SAMPLE.title;
  state.chapters = SAMPLE.chapters;
  state.chapter = 0;
  state.para = 0;
  renderBook();
  setStatus("Sample loaded. Press Play.");
};

$("play").onclick = () => {
  if (!state.chapters.length) {
    setStatus("Load a book first.");
    return;
  }
  speakCurrent();
};
$("pause").onclick = () => {
  state.playing = false;
  speechSynthesis.pause();
};
$("stop").onclick = () => {
  stopSpeech();
};
$("next").onclick = () => {
  stopSpeech();
  if (state.chapter + 1 < state.chapters.length) {
    state.chapter += 1;
    state.para = 0;
    persist();
    renderBook();
  }
};
$("prev").onclick = () => {
  stopSpeech();
  if (state.chapter > 0) {
    state.chapter -= 1;
    state.para = 0;
    persist();
    renderBook();
  }
};

$("rate").oninput = () => ($("rateVal").textContent = Number($("rate").value).toFixed(2));
$("pitch").oninput = () => ($("pitchVal").textContent = Number($("pitch").value).toFixed(2));

speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
setTimeout(loadVoices, 400);
setTimeout(loadVoices, 1200);
