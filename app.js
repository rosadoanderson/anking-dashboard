
const STORAGE_KEY = "anking_complete_site_stats_v3";
const EXTRA_DECKS_KEY = "anking_extra_decks_v3";
const DECK_TIME_KEY = "anking_deck_time_v3";
const TOTAL_TIME_KEY = "anking_total_time_v3";
const PAGE_SIZE = 30;

const state = {
  cards: [],
  selectedDeck: "",
  studyQueue: [],
  studyIndex: 0,
  revealed: false,
  searchPage: 1,
  manualSelection: new Set(),
  sessionSeconds: 0,
  sessionActive: false,
  sessionDeck: "",
  timerHandle: null,
  deckTime: {},
  totalTime: 0,
};

const el = (id) => document.getElementById(id);

async function boot() {
  setLoading(10, "Lendo arquivo de cards...");
  const response = await fetch("base_cards.json");
  const baseCards = await response.json();

  setLoading(35, "Lendo decks adicionais salvos...");
  const extraCards = loadExtraDecks();

  setLoading(55, "Preparando estatísticas locais...");
  const savedStats = loadSavedStats();
  state.deckTime = loadDeckTime();
  state.totalTime = loadTotalTime();

  const allCards = baseCards.concat(extraCards);
  state.cards = allCards.map(card => ({
    ...card,
    sourceType: card.sourceType || "extra",
    stats: savedStats[card.id] || { reviewed: 0, correct: 0, wrong: 0 }
  }));

  bindEvents();
  renderDeckTree();
  renderDeckSelects();
  renderSubjectCards();
  renderDashboard();
  renderSearch();
  renderDeckBadges();
  renderDeckManager();
  renderStatsPage();
  renderManualPicker();
  handleStudyModeChange();
  updateSessionTimer();
  el("aboutCardCount").textContent = state.cards.length.toLocaleString("pt-BR");
  el("aboutDeckCount").textContent = getDecks().length.toLocaleString("pt-BR");

  setLoading(100, "Concluído");
  setTimeout(() => {
    el("loadingScreen").classList.add("hidden");
    el("app").classList.remove("hidden");
  }, 250);
}

function setLoading(percent, text) {
  el("loadingBar").style.width = percent + "%";
  el("loadingText").textContent = text;
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  el("clearDeckBtn").addEventListener("click", clearDeckFilter);
  el("resetStatsBtn").addEventListener("click", resetStats);
  el("exportStatsBtn").addEventListener("click", exportStats);
  el("dashboardDeckSearch").addEventListener("input", renderDashboard);
  el("subjectFilterInput").addEventListener("input", renderSubjectCards);
  el("cardSearchInput").addEventListener("input", () => { state.searchPage = 1; renderSearch(); });
  el("searchDeckSelect").addEventListener("change", () => { state.searchPage = 1; renderSearch(); });

  el("studyDeckSelect").addEventListener("change", () => {
    state.selectedDeck = el("studyDeckSelect").value || "";
    updateSelectedDeckUI();
    renderAllViews();
  });

  el("studyModeSelect").addEventListener("change", handleStudyModeChange);
  el("manualCardSearch").addEventListener("input", renderManualPicker);
  el("selectVisibleBtn").addEventListener("click", selectVisibleManualCards);
  el("clearManualSelectionBtn").addEventListener("click", () => { state.manualSelection = new Set(); renderManualPicker(); });

  el("startStudyBtn").addEventListener("click", startStudy);
  el("endSessionBtn").addEventListener("click", endSession);
  el("showAnswerBtn").addEventListener("click", showAnswer);
  el("correctBtn").addEventListener("click", () => markAnswer(true));
  el("wrongBtn").addEventListener("click", () => markAnswer(false));
  el("nextBtn").addEventListener("click", nextCard);

  el("importJsonInput").addEventListener("change", handleJsonImport);
  el("importApkgInput").addEventListener("change", handleApkgImport);
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  el(viewName + "View").classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName));
  if (viewName === "search") renderSearch();
  if (viewName === "stats") renderStatsPage();
  if (viewName === "subjects") renderSubjectCards();
  if (viewName === "study") renderManualPicker();
  if (viewName === "decks") renderDeckManager();
}

function loadSavedStats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}
function saveStats() {
  const payload = {};
  state.cards.forEach(card => payload[card.id] = card.stats);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  renderAllViews();
}
function loadExtraDecks() {
  try { return JSON.parse(localStorage.getItem(EXTRA_DECKS_KEY) || "[]"); }
  catch { return []; }
}
function saveExtraDecks() {
  const extra = state.cards.filter(c => c.sourceType === "extra").map(({id, deck, front, back, sourceType}) => ({id, deck, front, back, sourceType}));
  localStorage.setItem(EXTRA_DECKS_KEY, JSON.stringify(extra));
}
function loadDeckTime() {
  try { return JSON.parse(localStorage.getItem(DECK_TIME_KEY) || "{}"); }
  catch { return {}; }
}
function saveDeckTime() {
  localStorage.setItem(DECK_TIME_KEY, JSON.stringify(state.deckTime));
}
function loadTotalTime() {
  return Number(localStorage.getItem(TOTAL_TIME_KEY) || 0);
}
function saveTotalTime() {
  localStorage.setItem(TOTAL_TIME_KEY, String(state.totalTime));
}

function formatSeconds(sec) {
  sec = Math.max(0, Number(sec || 0));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function startSessionTimer(deck) {
  endSession(false);
  state.sessionSeconds = 0;
  state.sessionActive = true;
  state.sessionDeck = deck || "__all__";
  updateSessionTimer();
  state.timerHandle = setInterval(() => {
    state.sessionSeconds += 1;
    state.totalTime += 1;
    state.deckTime[state.sessionDeck] = (state.deckTime[state.sessionDeck] || 0) + 1;
    updateSessionTimer();
    el("totalTimeValue").textContent = formatSeconds(state.totalTime);
    saveDeckTime();
    saveTotalTime();
  }, 1000);
}

function endSession(showMsg = true) {
  if (state.timerHandle) clearInterval(state.timerHandle);
  state.timerHandle = null;
  const elapsed = state.sessionSeconds;
  state.sessionSeconds = 0;
  state.sessionActive = false;
  state.sessionDeck = "";
  updateSessionTimer();
  if (showMsg && elapsed > 0) alert(`Sessão encerrada. Tempo estudado: ${formatSeconds(elapsed)}.`);
  renderAllViews();
}

function updateSessionTimer() {
  el("sessionTimer").textContent = formatSeconds(state.sessionSeconds);
}

function clearDeckFilter() {
  state.selectedDeck = "";
  updateSelectedDeckUI();
  renderAllViews();
}

function updateSelectedDeckUI() {
  el("currentDeckName").textContent = state.selectedDeck || "Todos os decks";
  el("studyDeckSelect").value = state.selectedDeck;
  el("searchDeckSelect").value = state.selectedDeck;
}

function getDecks() {
  return [...new Set(state.cards.map(c => c.deck))].sort((a, b) => a.localeCompare(b));
}
function getFilteredCards() {
  return state.selectedDeck ? state.cards.filter(c => c.deck === state.selectedDeck) : state.cards;
}
function computeTotals(cards) {
  let reviewed = 0, correct = 0, wrong = 0;
  cards.forEach(card => {
    reviewed += card.stats.reviewed || 0;
    correct += card.stats.correct || 0;
    wrong += card.stats.wrong || 0;
  });
  return { reviewed, correct, wrong };
}

function renderDashboard() {
  const deckQuery = (el("dashboardDeckSearch").value || "").trim().toLowerCase();
  const filteredCards = getFilteredCards();
  const totals = computeTotals(filteredCards);
  const attempts = totals.correct + totals.wrong;
  const accuracy = attempts ? Math.round((totals.correct / attempts) * 100) : 0;
  const studiedUnique = filteredCards.filter(c => (c.stats.reviewed || 0) > 0).length;
  const progress = filteredCards.length ? Math.round((studiedUnique / filteredCards.length) * 100) : 0;

  el("totalCards").textContent = filteredCards.length.toLocaleString("pt-BR");
  el("reviewedCards").textContent = totals.reviewed.toLocaleString("pt-BR");
  el("correctCards").textContent = totals.correct.toLocaleString("pt-BR");
  el("wrongCards").textContent = totals.wrong.toLocaleString("pt-BR");
  el("accuracyRate").textContent = accuracy + "%";
  el("studiedUniqueText").textContent = studiedUnique.toLocaleString("pt-BR") + " estudados";
  el("overallProgress").style.width = progress + "%";
  el("overallProgressText").textContent = progress + "% dos cards do filtro atual já foram estudados pelo menos uma vez.";
  el("totalTimeValue").textContent = formatSeconds(state.totalTime);

  const byDeck = {};
  filteredCards.forEach(card => {
    if (deckQuery && !card.deck.toLowerCase().includes(deckQuery)) return;
    if (!byDeck[card.deck]) byDeck[card.deck] = { total: 0, reviewed: 0, correct: 0, wrong: 0 };
    byDeck[card.deck].total += 1;
    byDeck[card.deck].reviewed += card.stats.reviewed || 0;
    byDeck[card.deck].correct += card.stats.correct || 0;
    byDeck[card.deck].wrong += card.stats.wrong || 0;
  });

  const rows = Object.entries(byDeck).sort((a,b) => a[0].localeCompare(b[0]));
  el("visibleDecksText").textContent = rows.length.toLocaleString("pt-BR") + " decks";

  el("dashboardTableBody").innerHTML = rows.map(([deck, info]) => {
    const att = info.correct + info.wrong;
    const acc = att ? Math.round((info.correct / att) * 100) : 0;
    const deckTime = formatSeconds(state.deckTime[deck] || 0);
    return `
      <tr>
        <td><button class="deck-link" data-deck="${escapeHtmlAttr(deck)}">${escapeHtml(deck)}</button></td>
        <td>${info.total.toLocaleString("pt-BR")}</td>
        <td>${info.reviewed.toLocaleString("pt-BR")}</td>
        <td>${info.correct.toLocaleString("pt-BR")}</td>
        <td>${info.wrong.toLocaleString("pt-BR")}</td>
        <td>${deckTime}</td>
        <td>${acc}%</td>
      </tr>`;
  }).join("") || `<tr><td colspan="7">Nenhum deck encontrado.</td></tr>`;

  document.querySelectorAll("#dashboardTableBody .deck-link").forEach(btn => btn.addEventListener("click", () => selectDeck(btn.dataset.deck)));
}

function selectDeck(deck) {
  state.selectedDeck = deck || "";
  updateSelectedDeckUI();
  renderAllViews();
  switchView("study");
}

function renderDeckSelects() {
  const decks = getDecks();
  const options = ['<option value="">Todos os decks</option>']
    .concat(decks.map(deck => `<option value="${escapeHtmlAttr(deck)}">${escapeHtml(deck)}</option>`))
    .join("");
  el("studyDeckSelect").innerHTML = options;
  el("searchDeckSelect").innerHTML = options;
  updateSelectedDeckUI();
}

function buildDeckTree() {
  const root = {};
  getDecks().forEach(deck => {
    const parts = deck.split("::");
    let node = root;
    parts.forEach(part => {
      if (!node[part]) node[part] = {};
      node = node[part];
    });
  });
  return root;
}
function treeHtml(node, path = "") {
  let html = "<ul>";
  Object.keys(node).sort((a,b) => a.localeCompare(b)).forEach(key => {
    const nextPath = path ? path + "::" + key : key;
    html += `<li><button class="deck-link" data-deck="${escapeHtmlAttr(nextPath)}">${escapeHtml(key)}</button>${Object.keys(node[key]).length ? treeHtml(node[key], nextPath) : ""}</li>`;
  });
  html += "</ul>";
  return html;
}
function renderDeckTree() {
  el("deckTree").innerHTML = treeHtml(buildDeckTree());
  document.querySelectorAll("#deckTree .deck-link").forEach(btn => btn.addEventListener("click", () => selectDeck(btn.dataset.deck)));
}

function renderDeckBadges() {
  const decks = getDecks();
  el("allDeckCountText").textContent = decks.length.toLocaleString("pt-BR") + " decks";
  el("deckBadgeList").innerHTML = decks.map(deck => {
    const total = state.cards.filter(c => c.deck === deck).length;
    return `<button class="deck-badge" data-deck="${escapeHtmlAttr(deck)}">${escapeHtml(deck)} (${total.toLocaleString("pt-BR")})</button>`;
  }).join("");
  document.querySelectorAll(".deck-badge").forEach(btn => btn.addEventListener("click", () => selectDeck(btn.dataset.deck)));
}

function renderDeckManager() {
  const extras = {};
  state.cards.filter(c => c.sourceType === "extra").forEach(card => {
    if (!extras[card.deck]) extras[card.deck] = 0;
    extras[card.deck] += 1;
  });
  const rows = Object.entries(extras).sort((a,b) => a[0].localeCompare(b[0]));
  el("addedDeckManager").innerHTML = rows.map(([deck, count]) => `
    <div class="result-item">
      <div class="tag">Deck adicionado</div>
      <div class="result-front">${escapeHtml(deck)}</div>
      <div class="muted">${count.toLocaleString("pt-BR")} cards</div>
      <div class="toolbar top-space">
        <button class="btn btn-danger delete-extra-deck" data-deck="${escapeHtmlAttr(deck)}">Excluir deck adicionado</button>
      </div>
    </div>
  `).join("") || `<div class="muted">Nenhum deck adicional foi importado ainda.</div>`;
  document.querySelectorAll(".delete-extra-deck").forEach(btn => {
    btn.addEventListener("click", () => deleteExtraDeck(btn.dataset.deck));
  });
}

function deleteExtraDeck(deck) {
  const ok = confirm(`Excluir o deck adicional "${deck}"?`);
  if (!ok) return;
  state.cards = state.cards.filter(c => !(c.sourceType === "extra" && c.deck === deck));
  delete state.deckTime[deck];
  saveExtraDecks();
  saveStats();
  saveDeckTime();
  renderDeckSelects();
  renderDeckTree();
  renderDeckBadges();
  renderDeckManager();
  renderAllViews();
}

function renderSubjectCards() {
  const q = (el("subjectFilterInput").value || "").trim().toLowerCase();
  const decks = getDecks().filter(deck => !q || deck.toLowerCase().includes(q));

  el("subjectCardsGrid").innerHTML = decks.map(deck => {
    const cards = state.cards.filter(c => c.deck === deck);
    const totals = computeTotals(cards);
    const wrongOnly = cards.filter(c => (c.stats.wrong || 0) > 0).length;
    const attempts = totals.correct + totals.wrong;
    const acc = attempts ? Math.round((totals.correct / attempts) * 100) : 0;

    return `
      <div class="subject-card">
        <h3>${escapeHtml(deck)}</h3>
        <div class="subject-meta">
          <span class="tag">${cards.length.toLocaleString("pt-BR")} cards</span>
          <span class="tag">${totals.reviewed.toLocaleString("pt-BR")} revisões</span>
          <span class="tag">${wrongOnly.toLocaleString("pt-BR")} errados</span>
          <span class="tag">${formatSeconds(state.deckTime[deck] || 0)}</span>
          <span class="tag">${acc}% retenção</span>
        </div>
        <div class="toolbar">
          <button class="btn btn-secondary subject-open" data-deck="${escapeHtmlAttr(deck)}">Abrir</button>
          <button class="btn btn-primary subject-random" data-deck="${escapeHtmlAttr(deck)}">Randomizar</button>
          <button class="btn btn-danger subject-wrong" data-deck="${escapeHtmlAttr(deck)}">Só errados</button>
          <button class="btn btn-success subject-manual" data-deck="${escapeHtmlAttr(deck)}">Selecionar cards</button>
        </div>
      </div>
    `;
  }).join("") || `<div class="panel">Nenhuma matéria encontrada.</div>`;

  document.querySelectorAll(".subject-open").forEach(btn => btn.addEventListener("click", () => {
    state.selectedDeck = btn.dataset.deck; updateSelectedDeckUI();
    el("studyModeSelect").value = "all"; handleStudyModeChange(); switchView("study");
  }));
  document.querySelectorAll(".subject-random").forEach(btn => btn.addEventListener("click", () => {
    state.selectedDeck = btn.dataset.deck; updateSelectedDeckUI();
    el("studyModeSelect").value = "count"; el("studyOrderSelect").value = "random"; el("studyCountInput").value = 20;
    handleStudyModeChange(); switchView("study");
  }));
  document.querySelectorAll(".subject-wrong").forEach(btn => btn.addEventListener("click", () => {
    state.selectedDeck = btn.dataset.deck; updateSelectedDeckUI();
    el("studyModeSelect").value = "wrong"; handleStudyModeChange(); switchView("study");
  }));
  document.querySelectorAll(".subject-manual").forEach(btn => btn.addEventListener("click", () => {
    state.selectedDeck = btn.dataset.deck; updateSelectedDeckUI();
    state.manualSelection = new Set(); el("studyModeSelect").value = "manual";
    handleStudyModeChange(); renderManualPicker(); switchView("study");
  }));
}

function handleStudyModeChange() {
  const mode = el("studyModeSelect").value;
  const manual = mode === "manual";
  const count = mode === "count";
  const wrong = mode === "wrong";
  el("manualPickerWrap").classList.toggle("hidden", !manual);
  el("studyCountInput").disabled = !count;
  el("wrongStudyInfo").classList.toggle("hidden", !wrong);
  if (wrong) {
    const source = state.selectedDeck ? state.cards.filter(c => c.deck === state.selectedDeck) : state.cards;
    const wrongCards = source.filter(c => (c.stats.wrong || 0) > 0);
    el("wrongStudyInfo").textContent = `Há ${wrongCards.length.toLocaleString("pt-BR")} card(s) com erro no filtro atual.`;
  }
  renderManualPicker();
}

function getCardsForSelectedDeck() {
  return state.selectedDeck ? state.cards.filter(c => c.deck === state.selectedDeck) : state.cards;
}

function renderManualPicker() {
  const wrap = el("manualPickerWrap");
  if (!wrap || wrap.classList.contains("hidden")) return;

  const q = (el("manualCardSearch").value || "").trim().toLowerCase();
  const cards = getCardsForSelectedDeck().filter(card => !q || card.front.toLowerCase().includes(q) || card.back.toLowerCase().includes(q));
  const limited = cards.slice(0, 150);
  el("manualSelectedCount").textContent = `${state.manualSelection.size} card(s) selecionado(s). Mostrando ${limited.length} do filtro atual.`;

  el("manualCardList").innerHTML = limited.map(card => `
    <div class="manual-card-item">
      <label>
        <input type="checkbox" class="manual-check" data-id="${card.id}" ${state.manualSelection.has(card.id) ? "checked" : ""} />
        <div class="manual-card-text">
          <div class="tag">${escapeHtml(card.deck)}</div>
          <div><strong>${escapeHtml(card.front.slice(0, 240))}</strong></div>
          <div class="muted">${escapeHtml(card.back.slice(0, 180))}</div>
        </div>
      </label>
    </div>
  `).join("") || `<div class="muted">Nenhum card encontrado.</div>`;

  document.querySelectorAll(".manual-check").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.id);
      if (chk.checked) state.manualSelection.add(id);
      else state.manualSelection.delete(id);
      el("manualSelectedCount").textContent = `${state.manualSelection.size} card(s) selecionado(s). Mostrando ${limited.length} do filtro atual.`;
    });
  });
}
function selectVisibleManualCards() {
  document.querySelectorAll(".manual-check").forEach(chk => {
    chk.checked = true;
    state.manualSelection.add(Number(chk.dataset.id));
  });
  renderManualPicker();
}

function startStudy() {
  const scopeDeck = el("studyDeckSelect").value || "";
  state.selectedDeck = scopeDeck;
  updateSelectedDeckUI();

  const order = el("studyOrderSelect").value;
  const mode = el("studyModeSelect").value;
  let source = scopeDeck ? state.cards.filter(c => c.deck === scopeDeck) : state.cards.slice();

  if (mode === "count") {
    const count = Math.max(1, Number(el("studyCountInput").value || 20));
    if (order === "random") shuffle(source); else source.sort((a,b) => a.id - b.id);
    source = source.slice(0, count);
  } else if (mode === "manual") {
    source = source.filter(c => state.manualSelection.has(c.id));
    if (order === "random") shuffle(source); else source.sort((a,b) => a.id - b.id);
  } else if (mode === "wrong") {
    source = source.filter(c => (c.stats.wrong || 0) > 0);
    if (order === "random") shuffle(source); else source.sort((a,b) => a.id - b.id);
  } else {
    if (order === "random") shuffle(source); else source.sort((a,b) => a.id - b.id);
  }

  state.studyQueue = source.slice();
  state.studyIndex = 0;
  state.revealed = false;

  if (!state.studyQueue.length) {
    el("studyEmpty").classList.remove("hidden");
    el("studyCard").classList.add("hidden");
    el("studyEmpty").textContent = "Nenhum card encontrado para esta configuração.";
    return;
  }

  startSessionTimer(scopeDeck || "__all__");
  el("studyEmpty").classList.add("hidden");
  el("studyCard").classList.remove("hidden");
  renderStudyCard();
  renderAllViews();
}

function renderStudyCard() {
  const card = state.studyQueue[state.studyIndex];
  if (!card) {
    el("studyCard").classList.add("hidden");
    el("studyEmpty").classList.remove("hidden");
    el("studyEmpty").textContent = "Revisão finalizada.";
    endSession(false);
    renderAllViews();
    return;
  }
  el("studyMeta").textContent = card.deck;
  el("studyCounter").textContent = `Card ${state.studyIndex + 1} / ${state.studyQueue.length}`;
  el("studyFront").textContent = card.front;
  el("studyBack").textContent = card.back;
  el("studyBack").classList.toggle("hidden", !state.revealed);
  el("showAnswerBtn").classList.toggle("hidden", state.revealed);
  el("correctBtn").classList.toggle("hidden", !state.revealed);
  el("wrongBtn").classList.toggle("hidden", !state.revealed);
  el("nextBtn").classList.add("hidden");
}

function showAnswer() {
  state.revealed = true;
  renderStudyCard();
}
function markAnswer(correct) {
  const queueCard = state.studyQueue[state.studyIndex];
  const realCard = state.cards.find(c => c.id === queueCard.id);
  if (!realCard) return;
  realCard.stats.reviewed = (realCard.stats.reviewed || 0) + 1;
  if (correct) realCard.stats.correct = (realCard.stats.correct || 0) + 1;
  else realCard.stats.wrong = (realCard.stats.wrong || 0) + 1;
  saveStats();
  el("correctBtn").classList.add("hidden");
  el("wrongBtn").classList.add("hidden");
  el("nextBtn").classList.remove("hidden");
}
function nextCard() {
  state.studyIndex += 1;
  state.revealed = false;
  renderStudyCard();
}

function renderSearch() {
  const query = (el("cardSearchInput").value || "").trim().toLowerCase();
  const deck = el("searchDeckSelect").value || state.selectedDeck || "";
  let cards = state.cards;
  if (deck) cards = cards.filter(card => card.deck === deck);
  if (query) {
    cards = cards.filter(card =>
      card.front.toLowerCase().includes(query) ||
      card.back.toLowerCase().includes(query) ||
      card.deck.toLowerCase().includes(query)
    );
  }

  el("searchCountText").textContent = cards.length.toLocaleString("pt-BR") + " resultados";
  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  if (state.searchPage > totalPages) state.searchPage = totalPages;
  const start = (state.searchPage - 1) * PAGE_SIZE;
  const pageCards = cards.slice(start, start + PAGE_SIZE);

  el("searchResults").innerHTML = pageCards.map(card => `
    <div class="result-item">
      <div class="tag">${escapeHtml(card.deck)}</div>
      <div class="result-front">${escapeHtml(card.front)}</div>
      <div class="result-back">${escapeHtml(card.back)}</div>
      <div class="muted">Respondido: ${(card.stats.reviewed || 0).toLocaleString("pt-BR")} • Acertos: ${(card.stats.correct || 0).toLocaleString("pt-BR")} • Erros: ${(card.stats.wrong || 0).toLocaleString("pt-BR")}</div>
    </div>
  `).join("") || `<div class="muted">Nenhum resultado encontrado.</div>`;

  const pagesToShow = [];
  for (let i = 1; i <= totalPages; i++) if (i === 1 || i === totalPages || Math.abs(i - state.searchPage) <= 2) pagesToShow.push(i);
  el("searchPagination").innerHTML = [...new Set(pagesToShow)].map(page => `
    <button class="page-btn ${page === state.searchPage ? "active" : ""}" data-page="${page}">${page}</button>
  `).join("");
  document.querySelectorAll("#searchPagination .page-btn").forEach(btn => btn.addEventListener("click", () => {
    state.searchPage = Number(btn.dataset.page);
    renderSearch();
  }));
}

function renderStatsPage() {
  const cards = state.selectedDeck ? state.cards.filter(c => c.deck === state.selectedDeck) : state.cards;
  const totals = computeTotals(cards);
  const attempts = totals.correct + totals.wrong;
  const accuracy = attempts ? Math.round((totals.correct / attempts) * 100) : 0;
  const studiedUnique = cards.filter(c => (c.stats.reviewed || 0) > 0).length;
  const wrongOnly = cards.filter(c => (c.stats.wrong || 0) > 0).length;
  const deckKey = state.selectedDeck || "__all__";
  const currentDeckTime = state.selectedDeck ? formatSeconds(state.deckTime[state.selectedDeck] || 0) : formatSeconds(state.totalTime);

  el("statsSummary").innerHTML = [
    ["Cards no filtro", cards.length.toLocaleString("pt-BR")],
    ["Revisões", totals.reviewed.toLocaleString("pt-BR")],
    ["Acertos", totals.correct.toLocaleString("pt-BR")],
    ["Erros", totals.wrong.toLocaleString("pt-BR")],
    ["Cards com erro", wrongOnly.toLocaleString("pt-BR")],
    ["Retenção", accuracy + "%"],
    ["Cards estudados ao menos uma vez", studiedUnique.toLocaleString("pt-BR")],
    ["Tempo no filtro", currentDeckTime]
  ].map(([label, value]) => `
    <div class="summary-item">
      <div class="muted">${label}</div>
      <strong>${value}</strong>
    </div>
  `).join("");

  const deckTotals = {};
  state.cards.forEach(card => {
    if (!deckTotals[card.deck]) deckTotals[card.deck] = { total: 0, reviewed: 0 };
    deckTotals[card.deck].total += 1;
    deckTotals[card.deck].reviewed += card.stats.reviewed || 0;
  });

  const topDecks = Object.entries(deckTotals).sort((a,b) => b[1].total - a[1].total).slice(0, 12);
  el("topDecks").innerHTML = topDecks.map(([deck, info], idx) => `
    <div class="rank-item">
      <div class="muted">#${idx + 1}</div>
      <div><strong>${escapeHtml(deck)}</strong></div>
      <div class="muted">${info.total.toLocaleString("pt-BR")} cards • ${info.reviewed.toLocaleString("pt-BR")} revisões</div>
    </div>
  `).join("");

  const timeRows = Object.entries(state.deckTime).sort((a,b) => b[1] - a[1]).slice(0, 20);
  el("timePerDeckList").innerHTML = timeRows.map(([deck, sec], idx) => `
    <div class="rank-item">
      <div class="muted">#${idx + 1}</div>
      <div><strong>${escapeHtml(deck === "__all__" ? "Sessões com todos os decks" : deck)}</strong></div>
      <div class="muted">${formatSeconds(sec)}</div>
    </div>
  `).join("") || `<div class="muted">Ainda não há tempo registrado.</div>`;
}

function exportStats() {
  const payload = {
    stats: Object.fromEntries(state.cards.map(card => [card.id, card.stats])),
    deckTime: state.deckTime,
    totalTime: state.totalTime
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "anking_stats_backup_v3.json";
  link.click();
  URL.revokeObjectURL(url);
}

function resetStats() {
  const ok = confirm("Deseja zerar todas as estatísticas de acertos, erros, revisões e tempo?");
  if (!ok) return;
  state.cards = state.cards.map(card => ({ ...card, stats: { reviewed: 0, correct: 0, wrong: 0 } }));
  state.deckTime = {};
  state.totalTime = 0;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DECK_TIME_KEY);
  localStorage.removeItem(TOTAL_TIME_KEY);
  saveStats();
  saveDeckTime();
  saveTotalTime();
  endSession(false);
  renderAllViews();
}

function renderAllViews() {
  renderDashboard();
  renderSearch();
  renderStatsPage();
  renderSubjectCards();
  renderDeckManager();
  renderDeckBadges();
  renderDeckTree();
  renderDeckSelects();
  updateSessionTimer();
  el("totalTimeValue").textContent = formatSeconds(state.totalTime);
  const wrongMode = el("studyModeSelect");
  if (wrongMode) handleStudyModeChange();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function escapeHtmlAttr(value) { return escapeHtml(value); }

function normalizeImportedJson(data) {
  if (!Array.isArray(data)) throw new Error("JSON inválido: esperado array de cards.");
  return data.map((item, idx) => {
    const deck = item.deck || item.subject || item.materia || item.matéria;
    const front = item.front || item.question || item.pergunta;
    const back = item.back || item.answer || item.resposta;
    if (!deck || !front || !back) throw new Error("JSON inválido: cada card precisa de deck/front/back.");
    return {
      id: Date.now() + idx + Math.floor(Math.random() * 100000),
      deck: String(deck),
      front: String(front),
      back: String(back),
      sourceType: "extra",
      stats: { reviewed: 0, correct: 0, wrong: 0 }
    };
  });
}

function handleJsonImport(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const normalized = normalizeImportedJson(parsed);
      state.cards = state.cards.concat(normalized);
      saveExtraDecks();
      saveStats();
      renderAllViews();
      alert(`Importação concluída: ${normalized.length} card(s) adicionados.`);
      evt.target.value = "";
    } catch (e) {
      alert("Não foi possível importar o JSON: " + e.message);
    }
  };
  reader.readAsText(file, "utf-8");
}

// Note: importing APKG directly in-browser is limited in this static version.
// We accept APKG upload field for future/hosted expansion and explain current limitation.
function handleApkgImport(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  alert("Nesta versão estática local, a importação direta de .apkg no navegador não foi habilitada. Use JSON com campos deck/front/back, ou me peça uma versão hospedada com conversão automática.");
  evt.target.value = "";
}

boot();
