'use strict';

// Toggle genérico
const elementToggleFunc = function (elem) { elem.classList.toggle("active"); };

// =========================================
// SIDEBAR
// =========================================
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");
sidebarBtn.addEventListener("click", function () { elementToggleFunc(sidebar); });

// =========================================
// NAVEGAÇÃO ENTRE PÁGINAS (com #hash, para poder compartilhar o link de uma aba)
// =========================================
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

const showPage = function (pageName, updateHash) {
  const exists = Array.from(pages).some(function (page) { return page.dataset.page === pageName; });
  if (!exists) pageName = pages[0].dataset.page;

  pages.forEach(function (page) { page.classList.toggle("active", page.dataset.page === pageName); });
  navigationLinks.forEach(function (link) {
    const isActive = link.dataset.navLink === pageName;
    link.classList.toggle("active", isActive);
    if (isActive) { link.setAttribute("aria-current", "page"); } else { link.removeAttribute("aria-current"); }
  });

  if (updateHash) history.replaceState(null, "", "#" + pageName);
};

navigationLinks.forEach(function (link) {
  link.addEventListener("click", function () {
    showPage(this.dataset.navLink, true);
    window.scrollTo(0, 0);
  });
});

if (location.hash) showPage(location.hash.slice(1), false);
window.addEventListener("hashchange", function () { showPage(location.hash.slice(1), false); });

// =========================================
// TAGS SECUNDÁRIAS DOS PROJETOS
// =========================================
// Para criar uma tag nova: adicione uma entrada aqui e use a chave em data-tags="..." no <li> do projeto.
// Projetos com data-demo recebem a tag "demo" automaticamente.
const PROJECT_TAGS = {
  premiado: { label: "Premiado", icon: "trophy-outline",      color: "#f5c46b", description: "Projeto com premiação ou reconhecimento" },
  dados:    { label: "Dados",    icon: "bar-chart-outline",   color: "#7cc4f0", description: "Análise ou simulação de dados" },
  ia:       { label: "IA",       icon: "sparkles-outline",    color: "#c4a6f5", description: "Envolve inteligência artificial" },
  web:      { label: "Web",      icon: "code-slash-outline",  color: "#8fb3ff", description: "Desenvolvimento web (interface e código)" },
  educacao: { label: "STEAM",    icon: "school-outline",      color: "#f29cc9", description: "Educação e inclusão em ciência e tecnologia" },
  demo:     { label: "Demo",     icon: "play-circle-outline", color: "#6ee7a8", description: "Tem visualização interativa aqui no portfólio" }
};

// =========================================
// FILTROS DE PROJETOS (categoria + tags)
// =========================================
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-select-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");
const filterItems = document.querySelectorAll("[data-filter-item]");

const tagFilter = document.querySelector("[data-tag-filter]");
const tagFilterList = document.querySelector("[data-tag-filter-list]");
const tagClearBtn = document.querySelector("[data-tag-clear]");
const projectsEmpty = document.querySelector("[data-projects-empty]");

select.addEventListener("click", function () { elementToggleFunc(this); });

let activeCategory = "todos";
const activeTags = new Set();
const projectTagMap = new Map(); // <li> do projeto -> Set com as chaves das tags

const getProjectTags = function (item) {
  const found = new Set((item.dataset.tags || "").split(/\s+/).filter(Boolean));
  if (item.dataset.demo) found.add("demo");
  return Object.keys(PROJECT_TAGS).filter(function (key) { return found.has(key); });
};

const tagChipHTML = function (key) {
  const tag = PROJECT_TAGS[key];
  return `<span class="tag-chip" style="--tag-color:${tag.color}" title="${tag.description}"><ion-icon name="${tag.icon}"></ion-icon>${tag.label}</span>`;
};

// Com mais de uma tag marcada, o projeto precisa ter TODAS.
const applyFilters = function () {
  let visibleCount = 0;
  filterItems.forEach(function (item) {
    const projectTags = projectTagMap.get(item);
    const categoryOk = activeCategory === "todos" || activeCategory === item.dataset.category;
    const tagsOk = Array.from(activeTags).every(function (key) { return projectTags.has(key); });
    const show = categoryOk && tagsOk;
    item.classList.toggle("active", show);
    if (show) visibleCount++;
  });
  projectsEmpty.hidden = visibleCount !== 0;
  tagClearBtn.hidden = activeTags.size === 0;
};

// Chips nos cards + contagem por tag
const tagCounts = {};
filterItems.forEach(function (item) {
  const tags = getProjectTags(item);
  projectTagMap.set(item, new Set(tags));
  tags.forEach(function (key) { tagCounts[key] = (tagCounts[key] || 0) + 1; });

  if (tags.length) {
    item.querySelector("[data-project-trigger]").insertAdjacentHTML(
      "beforeend",
      `<div class="project-tags">${tags.map(tagChipHTML).join("")}</div>`
    );
  }
});

// Menu de tags: só aparecem as tags que algum projeto usa
Object.keys(PROJECT_TAGS).forEach(function (key) {
  if (!tagCounts[key]) return;
  const tag = PROJECT_TAGS[key];
  const li = document.createElement("li");
  li.innerHTML = `<button type="button" class="tag-chip tag-chip-btn" style="--tag-color:${tag.color}" data-tag-key="${key}" aria-pressed="false" title="${tag.description}"><ion-icon name="${tag.icon}"></ion-icon>${tag.label}<span class="tag-count">${tagCounts[key]}</span></button>`;
  tagFilterList.appendChild(li);
});
if (!tagFilterList.children.length) tagFilter.hidden = true;

tagFilterList.addEventListener("click", function (event) {
  const btn = event.target.closest("[data-tag-key]");
  if (!btn) return;
  const key = btn.dataset.tagKey;
  const isOn = !activeTags.has(key);
  if (isOn) { activeTags.add(key); } else { activeTags.delete(key); }
  btn.setAttribute("aria-pressed", String(isOn));
  applyFilters();
});

tagClearBtn.addEventListener("click", function () {
  activeTags.clear();
  tagFilterList.querySelectorAll("[aria-pressed='true']").forEach(function (btn) {
    btn.setAttribute("aria-pressed", "false");
  });
  applyFilters();
});

// Categoria: botões (desktop) e select (mobile) ficam sincronizados
const setCategory = function (category, label) {
  activeCategory = category;
  selectValue.innerText = label;
  filterBtn.forEach(function (btn) { btn.classList.toggle("active", btn.dataset.filterBtn === category); });
  applyFilters();
};

selectItems.forEach(function (item) {
  item.addEventListener("click", function () {
    elementToggleFunc(select);
    setCategory(this.dataset.selectItem, this.innerText);
  });
});

filterBtn.forEach(function (btn) {
  btn.addEventListener("click", function () { setCategory(this.dataset.filterBtn, this.innerText); });
});

// =========================================
// FORMULÁRIO DE CONTATO
// =========================================
// Com data-endpoint (ex.: Formspree), envia em segundo plano.
// Sem endpoint, abre o app de email com a mensagem já preenchida.
const form = document.querySelector("[data-form]");
const formInputs = document.querySelectorAll("[data-form-input]");
const formBtn = document.querySelector("[data-form-btn]");
const formBtnText = formBtn.querySelector("span");
const FORM_BTN_LABEL = formBtnText.innerText;

formInputs.forEach(function (input) {
  input.addEventListener("input", function () {
    if (form.checkValidity()) { formBtn.removeAttribute("disabled"); } else { formBtn.setAttribute("disabled", ""); }
  });
});

const flashFormButton = function (text) {
  formBtnText.innerText = text;
  setTimeout(function () { formBtnText.innerText = FORM_BTN_LABEL; }, 4000);
};

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  const data = new FormData(form);
  const endpoint = (form.dataset.endpoint || "").trim();

  if (!endpoint) {
    const subject = "Contato pelo portfólio — " + data.get("nome");
    const body = data.get("mensagem") + "\n\n" + data.get("nome") + " (" + data.get("email") + ")";
    window.location.href = "mailto:" + form.dataset.mailto +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
    flashFormButton("Abrindo seu app de email…");
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      body: data,
      headers: { "Accept": "application/json" }
    });

    if (response.ok) {
      form.reset();
      formBtn.setAttribute("disabled", "");
      flashFormButton("Mensagem enviada! ✅");
    } else {
      alert("Ops! Ocorreu um problema ao enviar sua mensagem. Tente novamente.");
    }
  } catch (error) {
    alert("Ops! Ocorreu um problema na sua conexão.");
  }
});

// =========================================
// MODAL DE PROJETOS
// =========================================
const projectTriggers = document.querySelectorAll("[data-project-trigger]");
const projectModal = document.querySelector("[data-project-modal]");
const modalOverlay = document.querySelector("[data-modal-overlay]");
const modalCloseButton = document.querySelector("[data-modal-close]");
const modalTitle = projectModal.querySelector("#modal-title");
const modalImage = projectModal.querySelector("[data-modal-img]");
const modalCover = projectModal.querySelector("[data-modal-cover]");
const modalDescription = projectModal.querySelector("[data-modal-description]");
const modalDetails = projectModal.querySelector("[data-modal-details]");
const modalTags = projectModal.querySelector("[data-modal-tags]");
const modalLink = projectModal.querySelector("[data-modal-link]");
const modalLinkLabel = projectModal.querySelector("[data-modal-link-label]");
const modalDemo = projectModal.querySelector("[data-modal-demo]");
let lastFocusedTrigger = null;

const renderModalTags = function (item) {
  const tags = Array.from(projectTagMap.get(item) || []);
  modalTags.innerHTML = tags.map(function (key) {
    return `<li class="modal-tag-row">${tagChipHTML(key)}<span class="modal-tag-desc">${PROJECT_TAGS[key].description}</span></li>`;
  }).join("");
  modalTags.hidden = tags.length === 0;

  if (item.dataset.link) {
    modalLink.href = item.dataset.link;
    modalLinkLabel.innerText = item.dataset.linkLabel || "Saiba mais";
    modalLink.hidden = false;
  } else {
    modalLink.hidden = true;
  }
};

// Foto do projeto (se houver <img> no card) ou a capa ilustrada
const renderModalMedia = function (trigger) {
  const image = trigger.querySelector(".project-img img");
  const cover = trigger.querySelector(".project-cover");

  if (image) {
    modalImage.src = image.src;
    modalImage.alt = image.alt;
    modalImage.hidden = false;
    modalCover.hidden = true;
  } else {
    modalImage.hidden = true;
    modalImage.removeAttribute("src");
    modalCover.className = "modal-cover " + (cover ? cover.className.replace("project-cover", "").trim() : "");
    modalCover.innerHTML = cover ? cover.innerHTML : "";
    modalCover.hidden = !cover;
  }
};

// =========================================
// DEMO NO MODAL: ALCANCE DO TECMENINAS ABC
// =========================================
// Dados informados pelo projeto. Para atualizar, edite os números abaixo.
const TECMENINAS_REACH = {
  2026: {
    cities: 3,
    schools: [
      { name: "Jardim Zaira", city: "Mauá", girls: 35 },
      { name: "Santa Olímpia", city: "São Bernardo do Campo", girls: 35 },
      { name: "José Gonçalves", city: "São Bernardo do Campo", girls: 35 },
      { name: "Irene da Silva Costa", city: "Mauá", girls: 35 },
      { name: "Nadir", city: "", girls: 29 },
      { name: "Adamastor", city: "", girls: 16 }
    ]
  },
  2025: {
    cities: null,
    schools: [
      { name: "Nadir", city: "", girls: 29 },
      { name: "Adamastor", city: "", girls: 26 }
    ]
  }
};
const REACH_SCALE_MAX = 40; // eixo fixo para comparar os anos de forma honesta

const setupReachDemo = function () {
  const years = Object.keys(TECMENINAS_REACH).sort().reverse();

  modalDemo.innerHTML = `
    <div class="reach-demo" data-reach>
      <div class="reach-head">
        <div class="reach-stats" data-reach-stats></div>
        <div class="reach-toggle" role="group" aria-label="Ano">
          ${years.map(function (year, i) {
            return `<button type="button" data-reach-year="${year}" aria-pressed="${i === 0}">${year}</button>`;
          }).join("")}
        </div>
      </div>
      <p class="reach-title" data-reach-title></p>
      <div class="reach-chart" data-reach-chart role="list"></div>
      <div class="reach-axis" aria-hidden="true">
        <span></span>
        <div class="reach-ticks">${[0, 10, 20, 30, 40].map(function (t) { return `<span>${t}</span>`; }).join("")}</div>
      </div>
      <div class="reach-tooltip" data-reach-tooltip hidden></div>
      <details class="reach-table">
        <summary>Ver tabela</summary>
        <div data-reach-table></div>
      </details>
    </div>`;

  const root = modalDemo.querySelector("[data-reach]");
  const stats = root.querySelector("[data-reach-stats]");
  const title = root.querySelector("[data-reach-title]");
  const chart = root.querySelector("[data-reach-chart]");
  const tooltip = root.querySelector("[data-reach-tooltip]");
  const table = root.querySelector("[data-reach-table]");

  const showTooltip = function (row) {
    const rootBox = root.getBoundingClientRect();
    const bar = row.querySelector(".reach-bar").getBoundingClientRect();
    tooltip.innerHTML = `${row.dataset.label} · <strong>${row.dataset.value} meninas</strong>`;
    tooltip.hidden = false;
    const half = tooltip.offsetWidth / 2;
    const x = Math.min(Math.max(bar.right - rootBox.left, half + 6), rootBox.width - half - 6);
    tooltip.style.left = x + "px";
    tooltip.style.top = (bar.top - rootBox.top) + "px";
    chart.querySelectorAll(".is-active").forEach(function (r) { r.classList.remove("is-active"); });
    row.classList.add("is-active");
  };

  const hideTooltip = function () {
    tooltip.hidden = true;
    chart.querySelectorAll(".is-active").forEach(function (r) { r.classList.remove("is-active"); });
  };

  const render = function (year) {
    const data = TECMENINAS_REACH[year];
    const total = data.schools.reduce(function (sum, s) { return sum + s.girls; }, 0);
    const ranked = data.schools.slice().sort(function (a, b) { return b.girls - a.girls; });

    stats.innerHTML =
      `<div class="reach-stat"><strong>${total}</strong><span>meninas</span></div>` +
      `<div class="reach-stat"><strong>${data.schools.length}</strong><span>escolas</span></div>` +
      (data.cities ? `<div class="reach-stat"><strong>${data.cities}</strong><span>cidades</span></div>` : "");

    title.innerText = "Meninas alcançadas por escola · " + year;

    chart.innerHTML = ranked.map(function (s) {
      const label = s.city ? `${s.name} (${s.city})` : s.name;
      const width = (s.girls / REACH_SCALE_MAX) * 100;
      return `
        <div class="reach-row" role="listitem" tabindex="0" data-label="${label}" data-value="${s.girls}"
          aria-label="${label}: ${s.girls} meninas">
          <div class="reach-label">${s.name}${s.city ? `<small>${s.city}</small>` : ""}</div>
          <div class="reach-track"><span class="reach-bar" style="width:${width}%"></span></div>
        </div>`;
    }).join("");

    table.innerHTML = `
      <table>
        <thead><tr><th>Escola</th><th>Cidade</th><th>Meninas</th></tr></thead>
        <tbody>
          ${ranked.map(function (s) { return `<tr><td>${s.name}</td><td>${s.city || "—"}</td><td>${s.girls}</td></tr>`; }).join("")}
          <tr><td><strong>Total</strong></td><td></td><td><strong>${total}</strong></td></tr>
        </tbody>
      </table>`;

    hideTooltip();
  };

  chart.addEventListener("mouseover", function (event) {
    const row = event.target.closest(".reach-row");
    if (row) showTooltip(row);
  });
  chart.addEventListener("mouseleave", hideTooltip);
  chart.addEventListener("focusin", function (event) {
    const row = event.target.closest(".reach-row");
    if (row) showTooltip(row);
  });
  chart.addEventListener("focusout", hideTooltip);
  chart.addEventListener("click", function (event) {
    const row = event.target.closest(".reach-row");
    if (row) showTooltip(row);
  });

  root.querySelectorAll("[data-reach-year]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      root.querySelectorAll("[data-reach-year]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
      render(btn.dataset.reachYear);
    });
  });

  render(years[0]);
};

// Cada projeto com data-demo="nome" abre a demo correspondente acima do texto
const PROJECT_DEMOS = { tecmeninas: setupReachDemo };

const openProjectDemo = function (demoName) {
  modalDemo.classList.remove("active");
  modalDemo.innerHTML = "";

  if (PROJECT_DEMOS[demoName]) {
    PROJECT_DEMOS[demoName]();
    modalDemo.classList.add("active");
    modalImage.hidden = true; // a demo ocupa o lugar da imagem
    modalCover.hidden = true;
  }
};

const toggleProjectModal = function (isOpen) {
  projectModal.classList.toggle("active", isOpen);
  projectModal.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("modal-open", isOpen);

  if (isOpen) {
    projectModal.querySelector(".modal-content").scrollTop = 0;
    modalCloseButton.focus();
  } else if (lastFocusedTrigger) {
    lastFocusedTrigger.focus();
  }
};

projectTriggers.forEach(function (trigger) {
  trigger.addEventListener("click", function (event) {
    event.preventDefault();
    lastFocusedTrigger = this;

    const projectItem = this.closest("[data-filter-item]");
    modalTitle.innerText = projectItem.querySelector(".project-title").innerText;
    modalDescription.innerText = projectItem.dataset.description;
    modalDetails.innerText = projectItem.dataset.details;
    renderModalMedia(this);
    renderModalTags(projectItem);
    openProjectDemo(projectItem.dataset.demo);
    toggleProjectModal(true);
  });
});

modalCloseButton.addEventListener("click", function () { toggleProjectModal(false); });
modalOverlay.addEventListener("click", function () { toggleProjectModal(false); });

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && projectModal.classList.contains("active")) {
    toggleProjectModal(false);
  }
});
