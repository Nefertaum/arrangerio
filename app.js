/* Arrangerio - multi-track phrase arranger */

let tracks = [];
let selectedTrackId = null;
let selectedPhrase = null;
let dragPhrase = null;
let isPlaying = false;
let playTimer = null;
let playPos = 0;
const BAR_UNIT = 40;

const PHRASE_COLORS = {
  Intro: "#6c5ce7",
  Verse: "#00b894",
  "Pre-Chorus": "#fdcb6e",
  Chorus: "#e17055",
  Bridge: "#74b9ff",
  Solo: "#fd79a8",
  Break: "#b2bec3",
  Outro: "#a29bfe",
};

const TRACK_PRESETS = [
  { name: "Drums", color: "#e17055" },
  { name: "Bass", color: "#6c5ce7" },
  { name: "Guitar", color: "#00b894" },
  { name: "Keys", color: "#f39c12" },
  { name: "Vocals", color: "#fd79a8" },
  { name: "FX", color: "#74b9ff" },
];

const totalBarsEl = document.getElementById("total-bars");
const barRuler = document.getElementById("bar-ruler");
const playhead = document.getElementById("playhead");
const playheadContainer = document.getElementById("playhead-container");
const playBtn = document.getElementById("play-btn");
const saveProjectBtn = document.getElementById("save-project-btn");
const loadProjectBtn = document.getElementById("load-project-btn");
const exportImageBtn = document.getElementById("export-image-btn");
const projectFileInput = document.getElementById("project-file-input");
const labelsColumn = document.getElementById("labels-column");
const tracksLanes = document.getElementById("tracks-lanes");
const tracksCanvas = document.getElementById("tracks-canvas");
const tracksViewport = document.getElementById("tracks-viewport");
const tracksBoard = document.querySelector(".tracks-board");
const emptyHint = document.getElementById("empty-hint");
const labelEmpty = document.getElementById("label-empty");
const detailPanel = document.getElementById("detail-panel");

let nextId = 1;

function uid() {
  return nextId++;
}

function save() {
  localStorage.setItem("arrangerio_tracks", JSON.stringify(tracks));
  localStorage.setItem(
    "arrangerio_title",
    document.getElementById("song-title").value,
  );
}

function load() {
  try {
    const rawTracks = localStorage.getItem("arrangerio_tracks");
    if (rawTracks) {
      tracks = JSON.parse(rawTracks);
      tracks.forEach((track) => {
        if (track.id >= nextId) nextId = track.id + 1;
        track.phrases.forEach((phrase) => {
          if (phrase.id >= nextId) nextId = phrase.id + 1;
        });
      });
    }
    const title = localStorage.getItem("arrangerio_title");
    if (title) document.getElementById("song-title").value = title;
  } catch (_) {
    tracks = [];
  }
}

function createTrack(name, color) {
  return { id: uid(), name: name.trim(), color, phrases: [] };
}

function createPhrase(name, bars, color) {
  return { id: uid(), name: name.trim(), bars: clampBars(bars), color };
}

function getTrack(trackId) {
  return tracks.find((track) => track.id === trackId);
}

function getPhrase(trackId, phraseId) {
  const track = getTrack(trackId);
  return track ? track.phrases.find((phrase) => phrase.id === phraseId) : null;
}

function trackBars(track) {
  return track.phrases.reduce((sum, phrase) => sum + phrase.bars, 0);
}

function totalBars() {
  return tracks.reduce(
    (maxBars, track) => Math.max(maxBars, trackBars(track)),
    0,
  );
}

function displayBars() {
  return Math.max(totalBars(), 32);
}

function render() {
  const bars = displayBars();
  totalBarsEl.textContent = totalBars();
  renderTrackSelect();
  renderPresetState();
  renderLabels();
  renderRuler(bars);
  renderTrackRows(bars);
  updateCanvasMetrics(bars);
  updateEmptyState();
  syncDetailPanel();
  save();
}

function renderTrackSelect() {
  const select = document.getElementById("phrase-track");
  select.innerHTML = "";

  if (tracks.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No tracks available";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;
  tracks.forEach((track) => {
    const option = document.createElement("option");
    option.value = track.id;
    option.textContent = track.name;
    if (track.id === selectedTrackId) option.selected = true;
    select.appendChild(option);
  });

  if (selectedTrackId === null || !getTrack(selectedTrackId)) {
    selectedTrackId = tracks[0].id;
    select.value = String(selectedTrackId);
  }
}

function renderPresetState() {
  const names = new Set(tracks.map((track) => track.name.toLowerCase()));
  document.querySelectorAll(".track-preset").forEach((button) => {
    button.classList.toggle(
      "added",
      names.has(button.dataset.name.toLowerCase()),
    );
  });
}

function renderLabels() {
  labelsColumn.querySelectorAll(".track-label").forEach((el) => el.remove());

  tracks.forEach((track) => {
    const label = document.createElement("div");
    label.className =
      "track-label" + (track.id === selectedTrackId ? " selected" : "");
    label.style.borderLeftColor = track.color;
    label.innerHTML = `
      <div class="track-label-name">
        <span class="track-label-title">${escHtml(track.name)}</span>
        <span class="track-label-meta">${trackBars(track)} bars</span>
      </div>
      <button class="track-remove-btn" title="Remove track">&#10005;</button>
    `;

    label.addEventListener("click", () => {
      selectedTrackId = track.id;
      render();
    });

    label
      .querySelector(".track-remove-btn")
      .addEventListener("click", (event) => {
        event.stopPropagation();
        removeTrack(track.id);
      });

    labelsColumn.appendChild(label);
  });
}

function renderRuler(bars) {
  barRuler.innerHTML = "";
  for (let bar = 1; bar <= bars; bar += 4) {
    const tick = document.createElement("div");
    tick.className = "ruler-tick";
    tick.style.left = `${(bar - 1) * BAR_UNIT + 16}px`;
    tick.textContent = bar;
    barRuler.appendChild(tick);
  }
}

function renderTrackRows(bars) {
  tracksLanes.innerHTML = "";
  const laneWidth = bars * BAR_UNIT + 32;

  tracks.forEach((track) => {
    const row = document.createElement("div");
    row.className = "track-row";

    const lane = document.createElement("div");
    lane.className = "track-lane";
    lane.style.width = `${laneWidth}px`;
    lane.addEventListener("dragover", handleLaneDragOver);
    lane.addEventListener("drop", (event) =>
      handleLaneDrop(event, track.id, null),
    );

    track.phrases.forEach((phrase, index) => {
      const block = document.createElement("div");
      block.className =
        "phrase-block" +
        (selectedPhrase && selectedPhrase.phraseId === phrase.id
          ? " selected"
          : "");
      block.style.background = phrase.color;
      block.style.width = `${Math.max(phrase.bars * BAR_UNIT - 6, BAR_UNIT * 2)}px`;
      block.draggable = true;
      block.innerHTML = `
        <span class="phrase-name">${escHtml(phrase.name)}</span>
        <span class="phrase-bars">${phrase.bars} bar${phrase.bars !== 1 ? "s" : ""}</span>
      `;

      block.addEventListener("click", () => selectPhrase(track.id, phrase.id));
      block.addEventListener("dragstart", (event) =>
        handlePhraseDragStart(event, track.id, phrase.id),
      );
      block.addEventListener("dragend", handlePhraseDragEnd);
      block.addEventListener("dragover", (event) => {
        event.preventDefault();
        block.classList.add("drag-over");
      });
      block.addEventListener("dragleave", () =>
        block.classList.remove("drag-over"),
      );
      block.addEventListener("drop", (event) => {
        block.classList.remove("drag-over");
        handleLaneDrop(event, track.id, index);
      });

      lane.appendChild(block);
    });

    const filler = document.createElement("div");
    filler.className = "lane-filler";
    filler.style.width = `${Math.max(laneWidth - trackBars(track) * BAR_UNIT - 32, 0)}px`;
    lane.appendChild(filler);

    row.appendChild(lane);
    tracksLanes.appendChild(row);
  });
}

function updateCanvasMetrics(bars) {
  const width = bars * BAR_UNIT + 32;
  barRuler.style.width = `${width}px`;
  tracksCanvas.style.width = `${width}px`;
  playheadContainer.style.width = `${width}px`;
  playheadContainer.style.height = `${tracksLanes.offsetHeight}px`;
  playhead.style.height = `${tracksLanes.offsetHeight}px`;
}

function updateEmptyState() {
  const empty = tracks.length === 0;
  emptyHint.style.display = empty ? "block" : "none";
  labelEmpty.style.display = empty ? "flex" : "none";
}

function addTrack(name, color) {
  if (!name.trim()) return;
  const track = createTrack(name, color);
  tracks.push(track);
  selectedTrackId = track.id;
  render();
}

function removeTrack(trackId) {
  tracks = tracks.filter((track) => track.id !== trackId);

  if (selectedTrackId === trackId) {
    selectedTrackId = tracks[0] ? tracks[0].id : null;
  }

  if (selectedPhrase && selectedPhrase.trackId === trackId) {
    selectedPhrase = null;
  }

  stopPlayback();
  render();
}

function addPhrase(trackId, name, bars, color, index = null) {
  const track = getTrack(trackId);
  if (!track || !name.trim()) return;

  const phrase = createPhrase(name, bars, color);
  if (index === null || index > track.phrases.length) {
    track.phrases.push(phrase);
  } else {
    track.phrases.splice(index, 0, phrase);
  }

  selectedTrackId = trackId;
  selectedPhrase = { trackId, phraseId: phrase.id };
  render();
}

function removePhrase(trackId, phraseId) {
  const track = getTrack(trackId);
  if (!track) return;

  track.phrases = track.phrases.filter((phrase) => phrase.id !== phraseId);
  if (selectedPhrase && selectedPhrase.phraseId === phraseId) {
    selectedPhrase = null;
  }
  render();
}

function updatePhrase(trackId, phraseId, patch) {
  const phrase = getPhrase(trackId, phraseId);
  if (!phrase) return;
  Object.assign(phrase, patch);
  phrase.bars = clampBars(phrase.bars);
  render();
}

function movePhrase(sourceTrackId, phraseId, targetTrackId, targetIndex) {
  const sourceTrack = getTrack(sourceTrackId);
  const targetTrack = getTrack(targetTrackId);
  if (!sourceTrack || !targetTrack) return;

  const sourceIndex = sourceTrack.phrases.findIndex(
    (phrase) => phrase.id === phraseId,
  );
  if (sourceIndex < 0) return;

  const [phrase] = sourceTrack.phrases.splice(sourceIndex, 1);
  let insertIndex =
    targetIndex === null ? targetTrack.phrases.length : targetIndex;

  if (sourceTrackId === targetTrackId && sourceIndex < insertIndex) {
    insertIndex -= 1;
  }

  targetTrack.phrases.splice(insertIndex, 0, phrase);
  selectedTrackId = targetTrackId;
  selectedPhrase = { trackId: targetTrackId, phraseId };
  render();
}

function selectPhrase(trackId, phraseId) {
  selectedTrackId = trackId;
  selectedPhrase = { trackId, phraseId };
  syncDetailPanel();
  render();
}

function syncDetailPanel() {
  if (!selectedPhrase) {
    detailPanel.style.display = "none";
    return;
  }

  const track = getTrack(selectedPhrase.trackId);
  const phrase = getPhrase(selectedPhrase.trackId, selectedPhrase.phraseId);
  if (!track || !phrase) {
    selectedPhrase = null;
    detailPanel.style.display = "none";
    return;
  }

  document.getElementById("edit-track").value = track.name;
  document.getElementById("edit-name").value = phrase.name;
  document.getElementById("edit-bars").value = phrase.bars;
  document.getElementById("edit-color").value = phrase.color;
  detailPanel.style.display = "flex";
}

function handlePhraseDragStart(event, trackId, phraseId) {
  dragPhrase = { trackId, phraseId };
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/phrase-id", String(phraseId));
}

function handlePhraseDragEnd() {
  dragPhrase = null;
  document.querySelectorAll(".phrase-block").forEach((block) => {
    block.classList.remove("drag-over");
  });
}

function handleLaneDragOver(event) {
  event.preventDefault();
}

function handleLaneDrop(event, trackId, index) {
  event.preventDefault();

  const paletteType = event.dataTransfer.getData("application/palette-type");
  const paletteColor = event.dataTransfer.getData("application/palette-color");
  if (paletteType) {
    addPhrase(trackId, paletteType, 8, paletteColor, index);
    return;
  }

  if (dragPhrase) {
    movePhrase(dragPhrase.trackId, dragPhrase.phraseId, trackId, index);
  }
}

document.querySelectorAll(".palette-item").forEach((item) => {
  item.style.background = item.dataset.color;
  item.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("application/palette-type", item.dataset.type);
    event.dataTransfer.setData("application/palette-color", item.dataset.color);
    event.dataTransfer.effectAllowed = "copy";
  });
});

document.querySelectorAll(".track-preset").forEach((button) => {
  button.addEventListener("click", () =>
    addTrack(button.dataset.name, button.dataset.color),
  );
});

document.getElementById("track-add").addEventListener("click", () => {
  const nameEl = document.getElementById("track-name");
  const colorEl = document.getElementById("track-color");
  if (!nameEl.value.trim()) {
    flash(nameEl);
    return;
  }
  addTrack(nameEl.value, colorEl.value);
  nameEl.value = "";
});

document.getElementById("phrase-add").addEventListener("click", () => {
  const trackEl = document.getElementById("phrase-track");
  const nameEl = document.getElementById("phrase-name");
  const barsEl = document.getElementById("phrase-bars");
  const colorEl = document.getElementById("phrase-color");

  if (!trackEl.value) return;
  if (!nameEl.value.trim()) {
    flash(nameEl);
    return;
  }

  addPhrase(
    Number(trackEl.value),
    nameEl.value,
    clampBars(parseInt(barsEl.value, 10)),
    colorEl.value,
  );

  nameEl.value = "";
  barsEl.value = "8";
});

document.getElementById("phrase-name").addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("phrase-add").click();
});

document.getElementById("track-name").addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("track-add").click();
});

document.getElementById("phrase-track").addEventListener("change", (event) => {
  selectedTrackId = Number(event.target.value) || null;
  render();
});

document.getElementById("detail-close").addEventListener("click", () => {
  selectedPhrase = null;
  detailPanel.style.display = "none";
  render();
});

document.getElementById("detail-save").addEventListener("click", () => {
  if (!selectedPhrase) return;
  const name = document.getElementById("edit-name").value.trim();
  const bars = clampBars(
    parseInt(document.getElementById("edit-bars").value, 10),
  );
  const color = document.getElementById("edit-color").value;
  if (!name) {
    flash(document.getElementById("edit-name"));
    return;
  }
  updatePhrase(selectedPhrase.trackId, selectedPhrase.phraseId, {
    name,
    bars,
    color,
  });
});

document.getElementById("detail-delete").addEventListener("click", () => {
  if (!selectedPhrase) return;
  removePhrase(selectedPhrase.trackId, selectedPhrase.phraseId);
});

document.getElementById("clear-btn").addEventListener("click", () => {
  if (tracks.length === 0) return;
  if (!confirm("Remove all tracks and phrases?")) return;
  tracks = [];
  selectedTrackId = null;
  selectedPhrase = null;
  stopPlayback();
  render();
});

document.getElementById("song-title").addEventListener("input", save);

saveProjectBtn.addEventListener("click", exportProjectJson);
loadProjectBtn.addEventListener("click", () => projectFileInput.click());
projectFileInput.addEventListener("change", (event) => {
  importProjectJson(event.target.files && event.target.files[0]);
});
exportImageBtn.addEventListener("click", exportArrangementImage);

tracksViewport.addEventListener("scroll", () => {
  labelsColumn.scrollTop = tracksViewport.scrollTop;
});

playBtn.addEventListener("click", () => {
  isPlaying ? stopPlayback() : startPlayback();
});

function startPlayback() {
  const length = totalBars();
  if (length === 0) return;
  isPlaying = true;
  playBtn.textContent = "⏹";
  playBtn.classList.add("playing");
  playhead.classList.add("visible");
  playPos = 0;

  const bpm = 120;
  const barsPerSecond = bpm / (4 * 60);
  const step = barsPerSecond / 30;

  function tick() {
    if (!isPlaying) return;
    playPos += step;
    if (playPos >= length) playPos = 0;
    const px = playPos * BAR_UNIT + 16;
    playhead.style.left = `${px}px`;
    tracksViewport.scrollLeft = Math.max(
      0,
      px - tracksViewport.clientWidth * 0.45,
    );
    playTimer = requestAnimationFrame(tick);
  }

  playTimer = requestAnimationFrame(tick);
}

function stopPlayback() {
  isPlaying = false;
  cancelAnimationFrame(playTimer);
  playBtn.textContent = "▶";
  playBtn.classList.remove("playing");
  playhead.classList.remove("visible");
  playhead.style.left = "0px";
}

function clampBars(value) {
  return Math.max(1, Math.min(128, Number.isNaN(value) ? 8 : value));
}

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flash(element) {
  element.style.borderColor = "#e74c3c";
  element.focus();
  setTimeout(() => {
    element.style.borderColor = "";
  }, 800);
}

function safeNameForFile(name) {
  const base = (name || "untitled-song").trim().toLowerCase();
  return (
    base.replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "") ||
    "untitled-song"
  );
}

function exportProjectJson() {
  const payload = {
    app: "arrangerio",
    version: 1,
    savedAt: new Date().toISOString(),
    title: document.getElementById("song-title").value,
    tracks,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeNameForFile(payload.title)}.arrangerio.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function isValidProject(data) {
  return (
    data &&
    Array.isArray(data.tracks) &&
    data.tracks.every(
      (track) =>
        typeof track.id === "number" &&
        typeof track.name === "string" &&
        typeof track.color === "string" &&
        Array.isArray(track.phrases) &&
        track.phrases.every(
          (phrase) =>
            typeof phrase.id === "number" &&
            typeof phrase.name === "string" &&
            typeof phrase.bars === "number" &&
            typeof phrase.color === "string",
        ),
    )
  );
}

function importProjectJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || "{}"));
      if (!isValidProject(data)) {
        alert("Invalid project file.");
        return;
      }

      tracks = data.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        color: track.color,
        phrases: track.phrases.map((phrase) => ({
          id: phrase.id,
          name: phrase.name,
          bars: clampBars(Number(phrase.bars)),
          color: phrase.color,
        })),
      }));

      let maxId = 0;
      tracks.forEach((track) => {
        maxId = Math.max(maxId, track.id);
        track.phrases.forEach((phrase) => {
          maxId = Math.max(maxId, phrase.id);
        });
      });
      nextId = maxId + 1;

      const title =
        typeof data.title === "string" ? data.title : "Untitled Song";
      document.getElementById("song-title").value = title;

      selectedTrackId = tracks[0] ? tracks[0].id : null;
      selectedPhrase = null;
      stopPlayback();
      render();
    } catch (_) {
      alert("Could not parse project file.");
    } finally {
      projectFileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function exportArrangementImage() {
  if (!tracksBoard) return;
  if (typeof html2canvas !== "function") {
    alert("Image export library is not loaded.");
    return;
  }

  const previousDetailDisplay = detailPanel.style.display;
  detailPanel.style.display = "none";

  const prevScrollLeft = tracksViewport.scrollLeft;
  const prevScrollTop = tracksViewport.scrollTop;
  tracksViewport.scrollLeft = 0;
  tracksViewport.scrollTop = 0;

  html2canvas(tracksBoard, {
    backgroundColor: "#1a1a2e",
    useCORS: true,
    scale: 2,
  })
    .then((canvas) => {
      const link = document.createElement("a");
      const title = document.getElementById("song-title").value;
      link.download = `${safeNameForFile(title)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    })
    .catch(() => {
      alert("Could not export image.");
    })
    .finally(() => {
      detailPanel.style.display = previousDetailDisplay;
      tracksViewport.scrollLeft = prevScrollLeft;
      tracksViewport.scrollTop = prevScrollTop;
    });
}

document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT" || event.target.tagName === "SELECT")
    return;

  if ((event.key === "Delete" || event.key === "Backspace") && selectedPhrase) {
    removePhrase(selectedPhrase.trackId, selectedPhrase.phraseId);
  }

  if (event.key === " ") {
    event.preventDefault();
    isPlaying ? stopPlayback() : startPlayback();
  }

  if (event.key === "Escape") {
    selectedPhrase = null;
    render();
  }
});

load();

if (tracks.length === 0) {
  const drums = createTrack("Drums", TRACK_PRESETS[0].color);
  drums.phrases.push(createPhrase("Intro Groove", 8, PHRASE_COLORS.Intro));
  drums.phrases.push(createPhrase("Verse Beat", 16, PHRASE_COLORS.Verse));
  drums.phrases.push(createPhrase("Half-Time Fill", 8, PHRASE_COLORS.Bridge));

  const bass = createTrack("Bass", TRACK_PRESETS[1].color);
  bass.phrases.push(createPhrase("Root Notes", 8, PHRASE_COLORS.Intro));
  bass.phrases.push(createPhrase("Walking Verse", 16, PHRASE_COLORS.Verse));
  bass.phrases.push(createPhrase("Octave Hook", 12, PHRASE_COLORS.Chorus));

  const guitar = createTrack("Guitar", TRACK_PRESETS[2].color);
  guitar.phrases.push(createPhrase("Ambient Swells", 4, PHRASE_COLORS.Intro));
  guitar.phrases.push(createPhrase("Palm Mute Verse", 12, PHRASE_COLORS.Verse));
  guitar.phrases.push(createPhrase("Open Chords", 8, PHRASE_COLORS.Chorus));
  guitar.phrases.push(createPhrase("Lead Tag", 6, PHRASE_COLORS.Solo));

  const vocals = createTrack("Vocals", TRACK_PRESETS[4].color);
  vocals.phrases.push(createPhrase("Verse Lead", 16, PHRASE_COLORS.Verse));
  vocals.phrases.push(createPhrase("Chorus Stack", 8, PHRASE_COLORS.Chorus));
  vocals.phrases.push(createPhrase("Ad Lib Outro", 4, PHRASE_COLORS.Outro));

  tracks = [drums, bass, guitar, vocals];
  selectedTrackId = drums.id;
}

render();
