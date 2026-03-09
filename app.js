
const STORAGE_KEY = "anking_complete_site_stats_v1";
const PAGE_SIZE = 30;

const state = {
  cards: [],
  selectedDeck: "",
  studyQueue: [],
  studyIndex: 0,
  revealed: false,
  searchPage: 1,
};

const el = (id) => document.getElementById(id);

async function boot() {
  setLoading(10, "Lendo arquivo de cards...");
  const response = await fetch("cards.json");
  const rawCards = await response.json();

  setLoading(45, "Preparando estatísticas locais...");
  const savedStats = loadSavedStats();
  state.cards = rawCards.map(card => ({
    ...card,
    stats: savedStats[card.id] || { reviewed: 0, correct: 0, wrong: 0 }
  }));

  bindEvents();
  renderDeckTree();
  renderDeckSelects();
  renderDashboard();
  renderSearch();
  renderDeckBadges();
  renderStatsPage();
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
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  el("clearDeckBtn").addEventListener("click", clearDeckFilter);
  el("resetStatsBtn").addEventListener("click", resetStats);
  el("exportStatsBtn").addEventListener("click", exportStats);
  el("dashboardDeckSearch").addEventListener("input", renderDashboard);
  el("cardSearchInput").addEventListener("input", () => {
    state.searchPage = 1;
    renderSearch();
  });
  el("searchDeckSelect").addEventListener("change", () => {
    state.searchPage = 1;
    renderSearch();
  });
  el("studyDeckSelect").addEventListener("change", (e) => {
    state.selectedDeck = e.target.value;
    updateSelectedDeckUI();
    renderDashboard();
    renderSearch();
    renderStatsPage();
  });
  el("startStudyBtn").addEventListener("click", startStudy);
  el("showAnswerBtn").addEventListener("click", showAnswer);
  el("correctBtn").addEventListener("click", () => markAnswer(true));
  el("wrongBtn").addEventListener("click", () => markAnswer(false));
  el("nextBtn").addEventListener("click", nextCard);
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  el(viewName + "View").classList.remove("hidden");
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.view === viewName));
  if (viewName === "search") renderSearch();
  if (viewName === "stats") renderStatsPage();
}

function loadSavedStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStats() {
  const payload = {};
  state.cards.forEach(card => {
    payload[card.id] = card.stats;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  renderDashboard();
  renderSearch();
  renderStatsPage();
}

function clearDeckFilter() {
  state.selectedDeck = "";
  updateSelectedDeckUI();
  renderDashboard();
  renderSearch();
  renderStatsPage();
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
    return `
      <tr>
        <td><button class="deck-link" data-deck="${escapeHtmlAttr(deck)}">${escapeHtml(deck)}</button></td>
        <td>${info.total.toLocaleString("pt-BR")}</td>
        <td>${info.reviewed.toLocaleString("pt-BR")}</td>
        <td>${info.correct.toLocaleString("pt-BR")}</td>
        <td>${info.wrong.toLocaleString("pt-BR")}</td>
        <td>${acc}%</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="6">Nenhum deck encontrado.</td></tr>`;

  document.querySelectorAll("#dashboardTableBody .deck-link").forEach(btn => {
    btn.addEventListener("click", () => selectDeck(btn.dataset.deck));
  });
}

function selectDeck(deck) {
  state.selectedDeck = deck || "";
  updateSelectedDeckUI();
  renderDashboard();
  renderSearch();
  renderStatsPage();
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
    html += `<li>
      <button class="deck-link" data-deck="${escapeHtmlAttr(nextPath)}">${escapeHtml(key)}</button>
      ${Object.keys(node[key]).length ? treeHtml(node[key], nextPath) : ""}
    </li>`;
  });
  html += "</ul>";
  return html;
}

function renderDeckTree() {
  el("deckTree").innerHTML = treeHtml(buildDeckTree());
  document.querySelectorAll("#deckTree .deck-link").forEach(btn => {
    btn.addEventListener("click", () => selectDeck(btn.dataset.deck));
  });
}

function renderDeckBadges() {
  const decks = getDecks();
  el("allDeckCountText").textContent = decks.length.toLocaleString("pt-BR") + " decks";
  el("deckBadgeList").innerHTML = decks.map(deck => {
    const total = state.cards.filter(c => c.deck === deck).length;
    return `<button class="deck-badge" data-deck="${escapeHtmlAttr(deck)}">${escapeHtml(deck)} (${total.toLocaleString("pt-BR")})</button>`;
  }).join("");
  document.querySelectorAll(".deck-badge").forEach(btn => {
    btn.addEventListener("click", () => selectDeck(btn.dataset.deck));
  });
}

function startStudy() {
  const scopeDeck = el("studyDeckSelect").value || "";
  state.selectedDeck = scopeDeck;
  updateSelectedDeckUI();

  const source = scopeDeck ? state.cards.filter(c => c.deck === scopeDeck) : state.cards.slice();
  const order = el("studyOrderSelect").value;
  state.studyQueue = source.slice();
  if (order === "random") shuffle(state.studyQueue);
  else state.studyQueue.sort((a,b) => a.id - b.id);

  state.studyIndex = 0;
  state.revealed = false;

  if (!state.studyQueue.length) {
    el("studyEmpty").classList.remove("hidden");
    el("studyCard").classList.add("hidden");
    el("studyEmpty").textContent = "Nenhum card encontrado para este filtro.";
    return;
  }

  el("studyEmpty").classList.add("hidden");
  el("studyCard").classList.remove("hidden");
  renderStudyCard();
  renderDashboard();
  renderSearch();
  renderStatsPage();
}

function renderStudyCard() {
  const card = state.studyQueue[state.studyIndex];
  if (!card) {
    el("studyCard").classList.add("hidden");
    el("studyEmpty").classList.remove("hidden");
    el("studyEmpty").textContent = "Revisão finalizada.";
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
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - state.searchPage) <= 2) pagesToShow.push(i);
  }
  const deduped = [...new Set(pagesToShow)];

  el("searchPagination").innerHTML = deduped.map(page => `
    <button class="page-btn ${page === state.searchPage ? "active" : ""}" data-page="${page}">${page}</button>
  `).join("");

  document.querySelectorAll("#searchPagination .page-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.searchPage = Number(btn.dataset.page);
      renderSearch();
    });
  });
}

function renderStatsPage() {
  const cards = getFilteredCards();
  const totals = computeTotals(cards);
  const attempts = totals.correct + totals.wrong;
  const accuracy = attempts ? Math.round((totals.correct / attempts) * 100) : 0;
  const studiedUnique = cards.filter(c => (c.stats.reviewed || 0) > 0).length;

  el("statsSummary").innerHTML = [
    ["Cards no filtro", cards.length.toLocaleString("pt-BR")],
    ["Revisões", totals.reviewed.toLocaleString("pt-BR")],
    ["Acertos", totals.correct.toLocaleString("pt-BR")],
    ["Erros", totals.wrong.toLocaleString("pt-BR")],
    ["Retenção", accuracy + "%"],
    ["Cards estudados ao menos uma vez", studiedUnique.toLocaleString("pt-BR")]
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

  const topDecks = Object.entries(deckTotals)
    .sort((a,b) => b[1].total - a[1].total)
    .slice(0, 12);

  el("topDecks").innerHTML = topDecks.map(([deck, info], idx) => `
    <div class="rank-item">
      <div class="muted">#${idx + 1}</div>
      <div><strong>${escapeHtml(deck)}</strong></div>
      <div class="muted">${info.total.toLocaleString("pt-BR")} cards • ${info.reviewed.toLocaleString("pt-BR")} revisões</div>
    </div>
  `).join("");
}

function exportStats() {
  const stats = {};
  state.cards.forEach(card => {
    stats[card.id] = card.stats;
  });

  const blob = new Blob([JSON.stringify(stats, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "anking_stats_backup.json";
  link.click();
  URL.revokeObjectURL(url);
}

function resetStats() {
  const ok = confirm("Deseja zerar todas as estatísticas de acertos, erros e revisões?");
  if (!ok) return;

  state.cards = state.cards.map(card => ({
    ...card,
    stats: { reviewed: 0, correct: 0, wrong: 0 }
  }));
  localStorage.removeItem(STORAGE_KEY);
  saveStats();
  if (!el("studyCard").classList.contains("hidden")) renderStudyCard();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}

boot();
