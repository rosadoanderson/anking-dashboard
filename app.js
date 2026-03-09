
const STORAGE_KEY = "anking_pro_stats_v5";
const EXTRA_DECKS_KEY = "anking_pro_extra_decks_v5";
const DECK_TIME_KEY = "anking_pro_deck_time_v5";
const TOTAL_TIME_KEY = "anking_pro_total_time_v5";
const GOAL_KEY = "anking_pro_daily_goal_v5";
const REVIEW_LOG_KEY = "anking_pro_review_log_v5";
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
  dailyGoal: 50,
  reviewLog: {}
};

const el = (id) => document.getElementById(id);

function defaultCardStats() {
  return {
    reviewed: 0,
    correct: 0,
    wrong: 0,
    activeWrong: false,
    lastReviewedDate: "",
    srs: { state: "new", dueAt: 0, intervalDays: 0, ease: 2.5, reps: 0 }
  };
}

async function boot() {
  setLoading(10, "Lendo arquivo base...");
  const response = await fetch("base_cards.json");
  const baseCards = await response.json();

  setLoading(30, "Lendo decks adicionais...");
  const extraCards = loadExtraDecks();

  setLoading(50, "Preparando dados locais...");
  const savedStats = loadSavedStats();
  state.deckTime = loadDeckTime();
  state.totalTime = loadTotalTime();
  state.dailyGoal = loadDailyGoal();
  state.reviewLog = loadReviewLog();

  state.cards = baseCards.concat(extraCards).map(card => ({
    ...card,
    sourceType: card.sourceType || "extra",
    title: card.title || String(card.deck || "").split("::").slice(-1)[0],
    stats: savedStats[card.id] || defaultCardStats()
  }));

  bindEvents();
  renderAllStatic();
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
function nowTs() { return Date.now(); }
function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function isDue(card) { return (card.stats?.srs?.dueAt || 0) <= nowTs(); }
function queueName(card) { return card.stats?.srs?.state || "new"; }
function reviewedToday(card) { return card.stats?.lastReviewedDate === todayKey(); }
function hasWrong(card) { return !!card.stats?.activeWrong; }
function hasCorrect(card) { return (card.stats?.correct || 0) > 0; }

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function loadSavedStats() { return loadJson(STORAGE_KEY, {}); }
function saveStats() {
  const payload = {};
  state.cards.forEach(card => payload[card.id] = card.stats);
  saveJson(STORAGE_KEY, payload);
  renderAllViews();
}
function loadExtraDecks() { return loadJson(EXTRA_DECKS_KEY, []); }
function saveExtraDecks() {
  const extras = state.cards.filter(c => c.sourceType === "extra").map(({id, deck, title, front, back, sourceType}) => ({id, deck, title, front, back, sourceType}));
  saveJson(EXTRA_DECKS_KEY, extras);
}
function loadDeckTime() { return loadJson(DECK_TIME_KEY, {}); }
function saveDeckTime() { saveJson(DECK_TIME_KEY, state.deckTime); }
function loadTotalTime() { return Number(localStorage.getItem(TOTAL_TIME_KEY) || 0); }
function saveTotalTime() { localStorage.setItem(TOTAL_TIME_KEY, String(state.totalTime)); }
function loadDailyGoal() { return Number(localStorage.getItem(GOAL_KEY) || 50); }
function saveDailyGoal() { localStorage.setItem(GOAL_KEY, String(state.dailyGoal)); }
function loadReviewLog() { return loadJson(REVIEW_LOG_KEY, {}); }
function saveReviewLog() { saveJson(REVIEW_LOG_KEY, state.reviewLog); }

function formatSeconds(sec) {
  sec = Math.max(0, Number(sec || 0));
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function formatDateShort(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleString("pt-BR");
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  el("clearDeckBtn").addEventListener("click", clearDeckFilter);
  el("resetStatsBtn").addEventListener("click", resetAll);
  el("exportStatsBtn").addEventListener("click", exportBackup);
  el("dashboardDeckSearch").addEventListener("input", renderDashboard);
  el("subjectFilterInput").addEventListener("input", renderSubjectCards);

  el("dailyGoalInput").value = String(state.dailyGoal);
  el("saveGoalBtn").addEventListener("click", () => {
    state.dailyGoal = Math.max(1, Number(el("dailyGoalInput").value || 50));
    saveDailyGoal();
    renderDashboard();
  });

  el("cardSearchInput").addEventListener("input", () => { state.searchPage = 1; renderSearch(); });
  el("searchDeckSelect").addEventListener("change", () => { state.searchPage = 1; renderSearch(); });
  el("searchQueueSelect").addEventListener("change", () => { state.searchPage = 1; renderSearch(); });

  el("studyDeckSelect").addEventListener("change", () => {
    state.selectedDeck = el("studyDeckSelect").value || "";
    updateSelectedDeckUI();
    renderAllViews();
  });
  el("studyModeSelect").addEventListener("change", handleStudyModeChange);
  el("manualCardSearch").addEventListener("input", renderManualPicker);
  el("selectVisibleBtn").addEventListener("click", selectVisibleManualCards);
  el("clearManualSelectionBtn").addEventListener("click", () => {
    state.manualSelection = new Set();
    renderManualPicker();
  });
  el("startStudyBtn").addEventListener("click", startStudy);
  el("endSessionBtn").addEventListener("click", () => endSession(true));
  el("showAnswerBtn").addEventListener("click", showAnswer);
  el("againBtn").addEventListener("click", () => answerCard("again"));
  el("hardBtn").addEventListener("click", () => answerCard("hard"));
  el("goodBtn").addEventListener("click", () => answerCard("good"));
  el("easyBtn").addEventListener("click", () => answerCard("easy"));
  el("nextBtn").addEventListener("click", () => {
    state.studyIndex += 1;
    state.revealed = false;
    renderStudyCard();
  });

  el("importJsonInput").addEventListener("change", handleJsonImport);
  el("importCsvInput").addEventListener("change", handleCsvImport);
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  el(viewName + "View").classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName));
  if (viewName === "search") renderSearch();
  if (viewName === "stats") renderStatsPage();
  if (viewName === "subjects") renderSubjectCards();
  if (viewName === "study") renderManualPicker();
}

function updateSelectedDeckUI() {
  el("currentDeckName").textContent = state.selectedDeck || "Todos os decks";
  el("studyDeckSelect").value = state.selectedDeck;
  el("searchDeckSelect").value = state.selectedDeck;
}

function clearDeckFilter() {
  state.selectedDeck = "";
  updateSelectedDeckUI();
  renderAllViews();
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
function computeAccuracy(cards) {
  const t = computeTotals(cards);
  const attempts = t.correct + t.wrong;
  return attempts ? Math.round((t.correct / attempts) * 100) : 0;
}
function countQueues(cards) {
  const q = { new: 0, learning: 0, review: 0, due: 0 };
  cards.forEach(card => {
    const stateName = queueName(card);
    if (q[stateName] !== undefined) q[stateName] += 1;
    if (isDue(card)) q.due += 1;
  });
  return q;
}
function addReviewLog() {
  const key = todayKey();
  state.reviewLog[key] = (state.reviewLog[key] || 0) + 1;
  saveReviewLog();
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
function endSession(showMsg = false) {
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
  const total = state.studyQueue.length || 0;
  const current = Math.min(state.studyIndex, total);
  const p = total ? Math.round((current / total) * 100) : 0;
  el("sessionProgressBar").style.width = p + "%";
}

function renderDashboard() {
  const deckQuery = (el("dashboardDeckSearch").value || "").trim().toLowerCase();
  const filteredCards = getFilteredCards();
  const totals = computeTotals(filteredCards);
  const accuracy = computeAccuracy(filteredCards);
  const studiedUnique = filteredCards.filter(c => (c.stats.reviewed || 0) > 0).length;
  const progress = filteredCards.length ? Math.round((studiedUnique / filteredCards.length) * 100) : 0;
  const queues = countQueues(filteredCards);

  el("totalCards").textContent = filteredCards.length.toLocaleString("pt-BR");
  el("reviewedCards").textContent = totals.reviewed.toLocaleString("pt-BR");
  el("correctCards").textContent = totals.correct.toLocaleString("pt-BR");
  el("wrongCards").textContent = totals.wrong.toLocaleString("pt-BR");
  el("accuracyRate").textContent = accuracy + "%";
  el("totalTimeValue").textContent = formatSeconds(state.totalTime);
  el("studiedUniqueText").textContent = studiedUnique.toLocaleString("pt-BR") + " estudados";
  el("overallProgress").style.width = progress + "%";
  el("overallProgressText").textContent = progress + "% dos cards do filtro atual já foram estudados pelo menos uma vez.";
  el("queueSummary").innerHTML = [["new", queues.new], ["learning", queues.learning], ["review", queues.review], ["due hoje", queues.due]]
    .map(([k,v]) => `<div class="summary-item"><div class="muted">${k}</div><strong>${Number(v).toLocaleString("pt-BR")}</strong></div>`).join("");

  const reviewsToday = state.reviewLog[todayKey()] || 0;
  const pGoal = Math.min(100, Math.round((reviewsToday / state.dailyGoal) * 100));
  el("goalProgressBar").style.width = pGoal + "%";
  el("goalProgressText").textContent = `${reviewsToday.toLocaleString("pt-BR")} revisões hoje de uma meta de ${state.dailyGoal.toLocaleString("pt-BR")} (${pGoal}%).`;

  renderHeatmap();

  const byDeck = {};
  filteredCards.forEach(card => {
    if (deckQuery && !card.deck.toLowerCase().includes(deckQuery)) return;
    if (!byDeck[card.deck]) byDeck[card.deck] = { total: 0, reviewed: 0, correct: 0, wrong: 0, new: 0, due: 0 };
    byDeck[card.deck].total += 1;
    byDeck[card.deck].reviewed += card.stats.reviewed || 0;
    byDeck[card.deck].correct += card.stats.correct || 0;
    byDeck[card.deck].wrong += card.stats.wrong || 0;
    if (queueName(card) === "new") byDeck[card.deck].new += 1;
    if (isDue(card)) byDeck[card.deck].due += 1;
  });

  const rows = Object.entries(byDeck).sort((a,b) => a[0].localeCompare(b[0]));
  el("visibleDecksText").textContent = rows.length.toLocaleString("pt-BR") + " decks";
  el("dashboardTableBody").innerHTML = rows.map(([deck, info]) => {
    const attempts = info.correct + info.wrong;
    const acc = attempts ? Math.round((info.correct / attempts) * 100) : 0;
    const deckTime = formatSeconds(state.deckTime[deck] || 0);
    return `<tr>
      <td><button class="deck-link" data-deck="${escapeHtmlAttr(deck)}">${escapeHtml(deck)}</button></td>
      <td>${info.total.toLocaleString("pt-BR")}</td>
      <td>${info.reviewed.toLocaleString("pt-BR")}</td>
      <td>${info.correct.toLocaleString("pt-BR")}</td>
      <td>${info.wrong.toLocaleString("pt-BR")}</td>
      <td>${info.new.toLocaleString("pt-BR")}</td>
      <td>${info.due.toLocaleString("pt-BR")}</td>
      <td>${deckTime}</td>
      <td>${acc}%</td>
    </tr>`;
  }).join("") || `<tr><td colspan="9">Nenhum deck encontrado.</td></tr>`;
  document.querySelectorAll("#dashboardTableBody .deck-link").forEach(btn => btn.addEventListener("click", () => selectDeck(btn.dataset.deck)));
}

function renderHeatmap() {
  const start = new Date();
  start.setHours(0,0,0,0);
  start.setDate(start.getDate() - 139);
  const cells = [];
  for (let i = 0; i < 140; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = todayKey(d.getTime());
    const count = state.reviewLog[key] || 0;
    let level = 0;
    if (count > 0 && count < 10) level = 1;
    else if (count < 30) level = 2;
    else if (count < 60) level = 3;
    else if (count >= 60) level = 4;
    cells.push(`<div class="heat-cell" data-level="${level}"><div class="heat-tip">${key}: ${count} revisão(ões)</div></div>`);
  }
  el("heatmap").innerHTML = cells.join("");
}

function renderSubjectCards() {
  const q = (el("subjectFilterInput").value || "").trim().toLowerCase();
  const decks = getDecks().filter(deck => !q || deck.toLowerCase().includes(q));
  el("subjectCardsGrid").innerHTML = decks.map(deck => {
    const cards = state.cards.filter(c => c.deck === deck);
    const totals = computeTotals(cards);
    const wrongOnly = cards.filter(hasWrong).length;
    const reviewedTodayCount = cards.filter(reviewedToday).length;
    const queues = countQueues(cards);
    const acc = computeAccuracy(cards);
    const displayTitle = cards[0]?.title || deck.split("::").slice(-1)[0];
    return `<div class="subject-card">
      <h3>${escapeHtml(displayTitle)}</h3>
      <div class="muted">${escapeHtml(deck)}</div>
      <div class="subject-meta">
        <span class="tag">${cards.length.toLocaleString("pt-BR")} cards</span>
        <span class="tag">${queues.due.toLocaleString("pt-BR")} due</span>
        <span class="tag">${wrongOnly.toLocaleString("pt-BR")} erradas ativas</span>
        <span class="tag">${reviewedTodayCount.toLocaleString("pt-BR")} hoje</span>
        <span class="tag">${formatSeconds(state.deckTime[deck] || 0)}</span>
        <span class="tag">${acc}% retenção</span>
      </div>
      <div class="toolbar">
        <button class="btn btn-secondary subject-open" data-deck="${escapeHtmlAttr(deck)}">Due</button>
        <button class="btn btn-primary subject-random" data-deck="${escapeHtmlAttr(deck)}">Mistura adaptativa</button>
        <button class="btn btn-danger subject-wrong" data-deck="${escapeHtmlAttr(deck)}">Erradas</button>
        <button class="btn btn-secondary subject-today" data-deck="${escapeHtmlAttr(deck)}">Hoje</button>
        <button class="btn btn-success subject-manual" data-deck="${escapeHtmlAttr(deck)}">Selecionar cards</button>
      </div>
    </div>`;
  }).join("") || `<div class="panel">Nenhuma matéria encontrada.</div>`;

  document.querySelectorAll(".subject-open").forEach(btn => btn.addEventListener("click", () => configureSubjectMode(btn.dataset.deck, "due")));
  document.querySelectorAll(".subject-random").forEach(btn => btn.addEventListener("click", () => {
    configureSubjectMode(btn.dataset.deck, "adaptiveMix");
    el("studyOrderSelect").value = "random";
    el("studyCountInput").value = 25;
  }));
  document.querySelectorAll(".subject-wrong").forEach(btn => btn.addEventListener("click", () => configureSubjectMode(btn.dataset.deck, "wrong")));
  document.querySelectorAll(".subject-today").forEach(btn => btn.addEventListener("click", () => configureSubjectMode(btn.dataset.deck, "reviewedToday")));
  document.querySelectorAll(".subject-manual").forEach(btn => btn.addEventListener("click", () => {
    configureSubjectMode(btn.dataset.deck, "manual");
    state.manualSelection = new Set();
    renderManualPicker();
  }));
}

function configureSubjectMode(deck, mode) {
  state.selectedDeck = deck;
  updateSelectedDeckUI();
  el("studyModeSelect").value = mode;
  handleStudyModeChange();
  renderAllViews();
  switchView("study");
}

function handleStudyModeChange() {
  const mode = el("studyModeSelect").value;
  const manual = mode === "manual";
  const count = mode === "count" || mode === "adaptiveMix";
  el("manualPickerWrap").classList.toggle("hidden", !manual);
  el("studyCountInput").disabled = !count;

  const source = getCardsByModePreview(mode);
  let label = "";
  if (mode === "adaptiveMix") {
    const ratio = getAdaptiveWrongRatio(getCardsForSelectedDeck());
    label = `Mistura adaptativa: ${Math.round(ratio * 100)}% de erradas ativas e ${Math.round((1-ratio) * 100)}% de novas/due. Quanto menor a retenção da matéria, mais erradas entram no meio.`;
  } else if (mode === "wrong") label = `Há ${source.length.toLocaleString("pt-BR")} card(s) em erradas ativas no filtro atual. Quando você acerta um card errado, ele sai automaticamente dessa fila.`;
  else if (mode === "correct") label = `Há ${source.length.toLocaleString("pt-BR")} card(s) com acerto no filtro atual.`;
  else if (mode === "reviewedToday") label = `Há ${source.length.toLocaleString("pt-BR")} card(s) revisados hoje no filtro atual.`;
  else if (mode === "new") label = `Há ${source.length.toLocaleString("pt-BR")} card(s) novos no filtro atual.`;
  else if (mode === "learning") label = `Há ${source.length.toLocaleString("pt-BR")} card(s) na fila learning.`;
  else if (mode === "review") label = `Há ${source.length.toLocaleString("pt-BR")} card(s) na fila review.`;
  else if (mode === "due") label = `Há ${source.length.toLocaleString("pt-BR")} card(s) due agora no filtro atual.`;
  else if (mode === "manual") label = `${state.manualSelection.size.toLocaleString("pt-BR")} card(s) selecionado(s) manualmente.`;
  else label = `Modo atual: ${mode}.`;
  el("studyInfoBox").classList.remove("hidden");
  el("studyInfoBox").textContent = label;
  renderManualPicker();
}

function getCardsForSelectedDeck() {
  return state.selectedDeck ? state.cards.filter(c => c.deck === state.selectedDeck) : state.cards;
}
function getCardsByModePreview(mode) {
  let source = getCardsForSelectedDeck();
  if (mode === "wrong") source = source.filter(hasWrong);
  else if (mode === "correct") source = source.filter(hasCorrect);
  else if (mode === "reviewedToday") source = source.filter(reviewedToday);
  else if (mode === "new") source = source.filter(c => queueName(c) === "new");
  else if (mode === "learning") source = source.filter(c => queueName(c) === "learning");
  else if (mode === "review") source = source.filter(c => queueName(c) === "review");
  else if (mode === "due") source = source.filter(isDue);
  else if (mode === "manual") source = source.filter(c => state.manualSelection.has(c.id));
  else if (mode === "adaptiveMix") source = buildAdaptiveQueue(source, Math.max(1, Number(el("studyCountInput").value || 25)), "random");
  return source;
}

function getAdaptiveWrongRatio(cards) {
  const acc = computeAccuracy(cards);
  if (acc < 50) return 0.65;
  if (acc < 70) return 0.45;
  return 0.25;
}

function buildAdaptiveQueue(cards, count, order) {
  const wrong = cards.filter(hasWrong);
  const newOrDue = cards.filter(c => queueName(c) === "new" || isDue(c));
  const ratio = getAdaptiveWrongRatio(cards);
  let wrongTarget = Math.round(count * ratio);
  wrongTarget = Math.min(wrongTarget, wrong.length);
  let normalTarget = Math.max(0, count - wrongTarget);

  const wrongCopy = wrong.slice();
  const normalCopy = newOrDue.slice();
  if (order === "random") { shuffle(wrongCopy); shuffle(normalCopy); }
  else { wrongCopy.sort((a,b)=>a.id-b.id); normalCopy.sort((a,b)=>a.id-b.id); }

  const chosenWrong = wrongCopy.slice(0, wrongTarget);
  const chosenNormal = normalCopy.slice(0, normalTarget);

  // Interleave wrong cards among normal cards
  const mixed = [];
  const maxLen = Math.max(chosenWrong.length, chosenNormal.length);
  for (let i = 0; i < maxLen; i++) {
    if (chosenNormal[i]) mixed.push(chosenNormal[i]);
    if (chosenWrong[i]) mixed.push(chosenWrong[i]);
  }
  return mixed.slice(0, count);
}

function renderManualPicker() {
  const wrap = el("manualPickerWrap");
  if (!wrap || wrap.classList.contains("hidden")) return;
  const q = (el("manualCardSearch").value || "").trim().toLowerCase();
  const cards = getCardsForSelectedDeck().filter(card => !q || card.front.toLowerCase().includes(q) || card.back.toLowerCase().includes(q) || card.title.toLowerCase().includes(q));
  const limited = cards.slice(0, 150);
  el("manualSelectedCount").textContent = `${state.manualSelection.size} card(s) selecionado(s). Mostrando ${limited.length} do filtro atual.`;
  el("manualCardList").innerHTML = limited.map(card => `
    <div class="manual-card-item">
      <label>
        <input type="checkbox" class="manual-check" data-id="${card.id}" ${state.manualSelection.has(card.id) ? "checked" : ""} />
        <div class="manual-card-text">
          <div class="tag">${escapeHtml(card.title || card.deck.split("::").slice(-1)[0])}</div>
          <div class="muted">${escapeHtml(card.deck)}</div>
          <div><strong>${escapeHtml(card.front.slice(0, 220))}</strong></div>
          <div class="muted">${escapeHtml(card.back.slice(0, 160))}</div>
        </div>
      </label>
    </div>
  `).join("") || `<div class="muted">Nenhum card encontrado.</div>`;
  document.querySelectorAll(".manual-check").forEach(chk => {
    chk.addEventListener("change", () => {
      const id = Number(chk.dataset.id);
      if (chk.checked) state.manualSelection.add(id); else state.manualSelection.delete(id);
      el("manualSelectedCount").textContent = `${state.manualSelection.size} card(s) selecionado(s). Mostrando ${limited.length} do filtro atual.`;
      if (el("studyModeSelect").value === "manual") handleStudyModeChange();
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
  let source = getCardsForSelectedDeck();

  if (mode === "count") {
    if (order === "random") shuffle(source); else source.sort((a,b) => a.id - b.id);
    source = source.slice(0, Math.max(1, Number(el("studyCountInput").value || 20)));
  } else if (mode === "wrong") source = source.filter(hasWrong);
  else if (mode === "correct") source = source.filter(hasCorrect);
  else if (mode === "reviewedToday") source = source.filter(reviewedToday);
  else if (mode === "new") source = source.filter(c => queueName(c) === "new");
  else if (mode === "learning") source = source.filter(c => queueName(c) === "learning");
  else if (mode === "review") source = source.filter(c => queueName(c) === "review");
  else if (mode === "manual") source = source.filter(c => state.manualSelection.has(c.id));
  else if (mode === "due") source = source.filter(isDue);
  else if (mode === "adaptiveMix") source = buildAdaptiveQueue(source, Math.max(1, Number(el("studyCountInput").value || 25)), order);

  if (!["count", "adaptiveMix"].includes(mode)) {
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
  updateSessionTimer();
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
  el("studyStateTag").textContent = queueName(card);
  el("studyDueTag").textContent = "Due: " + formatDateShort(card.stats?.srs?.dueAt || 0);
  el("studyTitle").textContent = card.title || card.deck.split("::").slice(-1)[0];
  el("studyFront").textContent = card.front;
  el("studyBack").textContent = card.back;
  el("studyBack").classList.toggle("hidden", !state.revealed);
  el("showAnswerBtn").classList.toggle("hidden", state.revealed);
  ["againBtn","hardBtn","goodBtn","easyBtn"].forEach(id => el(id).classList.toggle("hidden", !state.revealed));
  el("nextBtn").classList.add("hidden");
}

function showAnswer() {
  state.revealed = true;
  renderStudyCard();
}

function applySm2(card, grade) {
  const srs = card.stats.srs || { state: "new", dueAt: 0, intervalDays: 0, ease: 2.5, reps: 0 };
  const now = nowTs();

  if (grade === "again") {
    srs.state = "learning";
    srs.reps = 0;
    srs.intervalDays = 0;
    srs.ease = Math.max(1.3, (srs.ease || 2.5) - 0.2);
    srs.dueAt = now + 10 * 60 * 1000;
    card.stats.wrong = (card.stats.wrong || 0) + 1;
    card.stats.activeWrong = true;
  } else if (grade === "hard") {
    srs.state = "learning";
    srs.reps = Math.max(1, (srs.reps || 0));
    srs.intervalDays = Math.max(1, Math.round(Math.max(1, srs.intervalDays || 1)));
    srs.ease = Math.max(1.3, (srs.ease || 2.5) - 0.05);
    srs.dueAt = now + 24 * 60 * 60 * 1000;
    card.stats.correct = (card.stats.correct || 0) + 1;
    card.stats.activeWrong = false;
  } else if (grade === "good") {
    srs.reps = (srs.reps || 0) + 1;
    const interval = srs.reps === 1 ? 1 : srs.reps === 2 ? 3 : Math.round((srs.intervalDays || 3) * (srs.ease || 2.5));
    srs.intervalDays = Math.max(1, interval);
    srs.ease = Math.min(3.0, (srs.ease || 2.5) + 0.03);
    srs.state = "review";
    srs.dueAt = now + srs.intervalDays * 24 * 60 * 60 * 1000;
    card.stats.correct = (card.stats.correct || 0) + 1;
    card.stats.activeWrong = false;
  } else if (grade === "easy") {
    srs.reps = (srs.reps || 0) + 1;
    const interval = srs.reps === 1 ? 4 : Math.round((Math.max(2, srs.intervalDays || 3)) * ((srs.ease || 2.5) + 0.35));
    srs.intervalDays = Math.max(4, interval);
    srs.ease = Math.min(3.2, (srs.ease || 2.5) + 0.08);
    srs.state = "review";
    srs.dueAt = now + srs.intervalDays * 24 * 60 * 60 * 1000;
    card.stats.correct = (card.stats.correct || 0) + 1;
    card.stats.activeWrong = false;
  }

  card.stats.srs = srs;
  card.stats.reviewed = (card.stats.reviewed || 0) + 1;
  card.stats.lastReviewedDate = todayKey();
}

function answerCard(grade) {
  const queueCard = state.studyQueue[state.studyIndex];
  const realCard = state.cards.find(c => c.id === queueCard.id);
  if (!realCard) return;
  applySm2(realCard, grade);
  addReviewLog();
  saveStats();
  ["againBtn","hardBtn","goodBtn","easyBtn"].forEach(id => el(id).classList.add("hidden"));
  el("nextBtn").classList.remove("hidden");
  handleStudyModeChange();
}

function renderSearch() {
  const query = (el("cardSearchInput").value || "").trim().toLowerCase();
  const deck = el("searchDeckSelect").value || state.selectedDeck || "";
  const queueFilter = el("searchQueueSelect").value || "";
  let cards = state.cards;
  if (deck) cards = cards.filter(card => card.deck === deck);
  if (queueFilter === "new") cards = cards.filter(c => queueName(c) === "new");
  else if (queueFilter === "learning") cards = cards.filter(c => queueName(c) === "learning");
  else if (queueFilter === "review") cards = cards.filter(c => queueName(c) === "review");
  else if (queueFilter === "wrong") cards = cards.filter(hasWrong);
  else if (queueFilter === "today") cards = cards.filter(reviewedToday);

  if (query) {
    cards = cards.filter(card =>
      card.front.toLowerCase().includes(query) ||
      card.back.toLowerCase().includes(query) ||
      card.deck.toLowerCase().includes(query) ||
      (card.title || "").toLowerCase().includes(query)
    );
  }

  el("searchCountText").textContent = cards.length.toLocaleString("pt-BR") + " resultados";
  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  if (state.searchPage > totalPages) state.searchPage = totalPages;
  const start = (state.searchPage - 1) * PAGE_SIZE;
  const pageCards = cards.slice(start, start + PAGE_SIZE);

  el("searchResults").innerHTML = pageCards.map(card => `
    <div class="result-item">
      <div class="toolbar">
        <span class="tag">${escapeHtml(card.title || card.deck.split("::").slice(-1)[0])}</span>
        <span class="tag">${queueName(card)}</span>
        <span class="tag">${hasWrong(card) ? "errada ativa" : "ok"}</span>
      </div>
      <div class="muted">${escapeHtml(card.deck)}</div>
      <div class="result-front">${escapeHtml(card.front)}</div>
      <div class="result-back">${escapeHtml(card.back)}</div>
      <div class="muted">Respondido: ${(card.stats.reviewed || 0).toLocaleString("pt-BR")} • Acertos: ${(card.stats.correct || 0).toLocaleString("pt-BR")} • Erros: ${(card.stats.wrong || 0).toLocaleString("pt-BR")} • Due: ${formatDateShort(card.stats?.srs?.dueAt || 0)}</div>
    </div>
  `).join("") || `<div class="muted">Nenhum resultado encontrado.</div>`;

  const totalPagesList = [];
  for (let i = 1; i <= totalPages; i++) if (i === 1 || i === totalPages || Math.abs(i - state.searchPage) <= 2) totalPagesList.push(i);
  el("searchPagination").innerHTML = [...new Set(totalPagesList)].map(page => `
    <button class="page-btn ${page === state.searchPage ? "active" : ""}" data-page="${page}">${page}</button>
  `).join("");
  document.querySelectorAll("#searchPagination .page-btn").forEach(btn => btn.addEventListener("click", () => {
    state.searchPage = Number(btn.dataset.page);
    renderSearch();
  }));
}

function renderStatsPage() {
  const cards = getFilteredCards();
  const totals = computeTotals(cards);
  const accuracy = computeAccuracy(cards);
  const studiedUnique = cards.filter(c => (c.stats.reviewed || 0) > 0).length;
  const wrongOnly = cards.filter(hasWrong).length;
  const queues = countQueues(cards);
  const currentDeckTime = state.selectedDeck ? formatSeconds(state.deckTime[state.selectedDeck] || 0) : formatSeconds(state.totalTime);
  const adaptiveRatio = Math.round(getAdaptiveWrongRatio(cards) * 100);

  el("statsSummary").innerHTML = [
    ["Cards no filtro", cards.length.toLocaleString("pt-BR")],
    ["Revisões", totals.reviewed.toLocaleString("pt-BR")],
    ["Acertos", totals.correct.toLocaleString("pt-BR")],
    ["Erros", totals.wrong.toLocaleString("pt-BR")],
    ["Erradas ativas", wrongOnly.toLocaleString("pt-BR")],
    ["Retenção", accuracy + "%"],
    ["new", queues.new.toLocaleString("pt-BR")],
    ["learning", queues.learning.toLocaleString("pt-BR")],
    ["review", queues.review.toLocaleString("pt-BR")],
    ["due", queues.due.toLocaleString("pt-BR")],
    ["Estudados ao menos 1x", studiedUnique.toLocaleString("pt-BR")],
    ["Tempo no filtro", currentDeckTime],
    ["Peso adaptativo de erradas", adaptiveRatio + "%"]
  ].map(([label, value]) => `<div class="summary-item"><div class="muted">${label}</div><strong>${value}</strong></div>`).join("");

  const byDeck = {};
  state.cards.forEach(card => {
    if (!byDeck[card.deck]) byDeck[card.deck] = { total: 0, reviewed: 0, wrong: 0 };
    byDeck[card.deck].total += 1;
    byDeck[card.deck].reviewed += card.stats.reviewed || 0;
    if (card.stats.activeWrong) byDeck[card.deck].wrong += 1;
  });

  const topDecks = Object.entries(byDeck).sort((a,b) => b[1].total - a[1].total).slice(0, 12);
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

  const worstRows = Object.entries(byDeck).sort((a,b) => b[1].wrong - a[1].wrong).slice(0, 20);
  el("worstDecksList").innerHTML = worstRows.map(([deck, info], idx) => `
    <div class="rank-item">
      <div class="muted">#${idx + 1}</div>
      <div><strong>${escapeHtml(deck)}</strong></div>
      <div class="muted">${info.wrong.toLocaleString("pt-BR")} errada(s) ativa(s)</div>
    </div>
  `).join("") || `<div class="muted">Ainda não há erros ativos.</div>`;
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
      <div class="toolbar top-space-sm">
        <button class="btn btn-danger delete-extra-deck" data-deck="${escapeHtmlAttr(deck)}">Excluir deck adicionado</button>
      </div>
    </div>
  `).join("") || `<div class="muted">Nenhum deck adicional foi importado ainda.</div>`;
  document.querySelectorAll(".delete-extra-deck").forEach(btn => btn.addEventListener("click", () => deleteExtraDeck(btn.dataset.deck)));
}

function deleteExtraDeck(deck) {
  if (!confirm(`Excluir o deck adicional "${deck}"?`)) return;
  state.cards = state.cards.filter(c => !(c.sourceType === "extra" && c.deck === deck));
  delete state.deckTime[deck];
  saveExtraDecks();
  saveStats();
  saveDeckTime();
  renderAllStatic();
}

function renderAllStatic() {
  renderDeckSelects();
  renderDeckTree();
  renderDeckBadges();
  renderDeckManager();
  renderAllViews();
  el("dailyGoalInput").value = String(state.dailyGoal);
  el("aboutCardCount").textContent = state.cards.length.toLocaleString("pt-BR");
  el("aboutDeckCount").textContent = getDecks().length.toLocaleString("pt-BR");
}
function renderAllViews() {
  renderDashboard();
  renderSearch();
  renderStatsPage();
  renderSubjectCards();
  renderManualPicker();
  updateSelectedDeckUI();
  updateSessionTimer();
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
function buildDeckTree() {
  const root = {};
  getDecks().forEach(deck => {
    const parts = deck.split("::");
    let node = root;
    parts.forEach(part => { if (!node[part]) node[part] = {}; node = node[part]; });
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
function renderDeckSelects() {
  const decks = getDecks();
  const options = ['<option value="">Todos os decks</option>'].concat(decks.map(deck => `<option value="${escapeHtmlAttr(deck)}">${escapeHtml(deck)}</option>`)).join("");
  el("studyDeckSelect").innerHTML = options;
  el("searchDeckSelect").innerHTML = options;
  updateSelectedDeckUI();
}
function selectDeck(deck) {
  state.selectedDeck = deck || "";
  updateSelectedDeckUI();
  renderAllViews();
  switchView("study");
}

function exportBackup() {
  const backup = {
    stats: Object.fromEntries(state.cards.map(card => [card.id, card.stats])),
    extraDecks: state.cards.filter(c => c.sourceType === "extra").map(({id, deck, title, front, back, sourceType}) => ({id, deck, title, front, back, sourceType})),
    deckTime: state.deckTime,
    totalTime: state.totalTime,
    dailyGoal: state.dailyGoal,
    reviewLog: state.reviewLog
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "anking_dashboard_pro_backup_v5.json";
  link.click();
  URL.revokeObjectURL(url);
}

function resetAll() {
  if (!confirm("Deseja zerar estatísticas, filas, tempo, heatmap e meta diária?")) return;
  state.cards = state.cards.map(card => ({ ...card, stats: defaultCardStats() }));
  state.deckTime = {};
  state.totalTime = 0;
  state.dailyGoal = 50;
  state.reviewLog = {};
  state.manualSelection = new Set();
  [STORAGE_KEY, DECK_TIME_KEY, TOTAL_TIME_KEY, GOAL_KEY, REVIEW_LOG_KEY].forEach(k => localStorage.removeItem(k));
  saveStats(); saveDeckTime(); saveTotalTime(); saveDailyGoal(); saveReviewLog();
  endSession(false);
  renderAllStatic();
}

function saveDailyGoal() { localStorage.setItem(GOAL_KEY, String(state.dailyGoal)); }
function saveReviewLog() { saveJson(REVIEW_LOG_KEY, state.reviewLog); }

function normalizeImportedJson(data) {
  if (!Array.isArray(data)) throw new Error("JSON inválido: esperado array de cards.");
  return data.map((item, idx) => {
    const deck = item.deck || item.subject || item.materia || item["matéria"];
    const front = item.front || item.question || item.pergunta;
    const back = item.back || item.answer || item.resposta;
    if (!deck || !front || !back) throw new Error("Cada card precisa de deck/front/back.");
    return {
      id: Date.now() + idx + Math.floor(Math.random() * 100000),
      deck: String(deck),
      title: String(deck).split("::").slice(-1)[0],
      front: String(front),
      back: String(back),
      sourceType: "extra",
      stats: defaultCardStats()
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
      renderAllStatic();
      alert(`Importação concluída: ${normalized.length} card(s) adicionados.`);
      evt.target.value = "";
    } catch (e) {
      alert("Não foi possível importar o JSON: " + e.message);
    }
  };
  reader.readAsText(file, "utf-8");
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const rows = lines.map(line => line.split(","));
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const body = rows.slice(1);
  const findIndex = (names) => headers.findIndex(h => names.includes(h));
  const deckIdx = findIndex(["deck","subject","materia","matéria"]);
  const frontIdx = findIndex(["front","question","pergunta"]);
  const backIdx = findIndex(["back","answer","resposta"]);
  if (deckIdx < 0 || frontIdx < 0 || backIdx < 0) throw new Error("CSV precisa de colunas deck/front/back ou equivalentes.");
  return body.map((cols, idx) => {
    const deck = String(cols[deckIdx] || "").trim();
    const front = String(cols[frontIdx] || "").trim();
    const back = String(cols[backIdx] || "").trim();
    return deck && front && back ? {
      id: Date.now() + idx + Math.floor(Math.random() * 100000),
      deck, title: deck.split("::").slice(-1)[0], front, back, sourceType: "extra", stats: defaultCardStats()
    } : null;
  }).filter(Boolean);
}
function handleCsvImport(evt) {
  const file = evt.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const normalized = parseCsv(String(reader.result));
      state.cards = state.cards.concat(normalized);
      saveExtraDecks();
      saveStats();
      renderAllStatic();
      alert(`Importação concluída: ${normalized.length} card(s) adicionados.`);
      evt.target.value = "";
    } catch (e) {
      alert("Não foi possível importar o CSV: " + e.message);
    }
  };
  reader.readAsText(file, "utf-8");
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

boot();
