(function () {
  "use strict";

  function initAnalytics() {
    // Placeholder: add analytics later
  }

  const Theme = {
    getPreference() {
      return localStorage.getItem("theme-preference");
    },
    apply(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      if (theme === "auto") localStorage.removeItem("theme-preference");
      else localStorage.setItem("theme-preference", theme);
    },
    init() {
      const stored = Theme.getPreference();
      document.documentElement.setAttribute(
        "data-theme",
        stored === "light" || stored === "dark" ? stored : "auto"
      );
      const toggle = document.getElementById("themeToggle");
      if (toggle) {
        toggle.addEventListener("click", () => {
          const current =
            document.documentElement.getAttribute("data-theme") || "auto";
          const next =
            current === "dark"
              ? "light"
              : current === "light"
              ? "auto"
              : "dark";
          Theme.apply(next);
          toggle.setAttribute("aria-pressed", String(next !== "auto"));
          toggle.querySelector(".theme-icon").textContent =
            next === "dark" ? "🌙" : next === "light" ? "☀️" : "🌓";
        });
      }
    },
  };

  const state = {
    apps: [],
    filtered: [],
    filters: {
      query: "",
      platforms: new Set(),
      stack: new Set(),
      yearMin: null,
      yearMax: null,
    },
    derived: { platforms: [], stack: [], yearMin: null, yearMax: null },
  };

  const els = {
    grid: document.getElementById("appsGrid"),
    error: document.getElementById("error"),
    retry: document.getElementById("retryBtn"),
    search: document.getElementById("search"),
    yearMin: document.getElementById("yearMin"),
    yearMax: document.getElementById("yearMax"),
    platformChips: document.getElementById("platformChips"),
    stackChips: document.getElementById("stackChips"),
    clearAll: document.getElementById("clearAll"),
    clearPlatforms: document.querySelector('[data-clear="platforms"]'),
    clearStack: document.querySelector('[data-clear="stack"]'),
    resultCount: document.getElementById("resultCount"),
    footerYear: document.getElementById("yearNow"),
    lastUpdated: document.getElementById("lastUpdated"),
    modal: document.getElementById("modal"),
    modalHero: document.getElementById("modalHero"),
    modalTitle: document.getElementById("modal-title"),
    modalTagline: document.getElementById("modal-tagline"),
    modalBadges: document.getElementById("modal-badges"),
    modalHighlights: document.getElementById("modal-highlights"),
    modalLinks: document.getElementById("modal-links"),
  };

  function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
  }
  function getPlatforms(apps) {
    const set = new Set();
    apps.forEach((a) => (a.platforms || []).forEach((p) => set.add(p)));
    const order = ["iOS", "Android", "Web", "Desktop"];
    return Array.from(set).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  function deriveStack(apps) {
    const set = new Set();
    apps.forEach((a) => (a.stack || []).forEach((s) => set.add(s)));
    return uniqueSorted([...set]);
  }
  function setBusy(el, busy) {
    if (el) el.setAttribute("aria-busy", String(!!busy));
  }
  function formatResultCount(n) {
    return `Showing ${n} app${n === 1 ? "" : "s"}`;
  }

  async function updateLastUpdated() {
    try {
      const res = await fetch("/apps.json", {
        method: "HEAD",
        cache: "no-cache",
      });
      const h = res.headers.get("last-modified");
      const d = h ? new Date(h) : new Date();
      els.lastUpdated.textContent = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    } catch {
      const d = new Date();
      els.lastUpdated.textContent = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    }
  }

  async function loadApps() {
    setBusy(els.grid, true);
    els.error.hidden = true;
    try {
      const res = await fetch("/apps.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("Load failed");
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid data");
      state.apps = data.slice().sort((a, b) => (b.year || 0) - (a.year || 0));
      deriveFilters();
      buildFiltersUI();
      applyFilters();
      injectPersonJsonLd();
      injectAppsJsonLd();
      await updateLastUpdated();
    } catch (err) {
      console.error(err);
      els.error.hidden = false;
    } finally {
      setBusy(els.grid, false);
    }
  }

  function deriveFilters() {
    state.derived.platforms = getPlatforms(state.apps);
    state.derived.stack = deriveStack(state.apps);
    const years = state.apps.map((a) => a.year).filter(Boolean);
    const min = Math.min(...years),
      max = Math.max(...years);
    state.derived.yearMin = isFinite(min) ? min : null;
    state.derived.yearMax = isFinite(max) ? max : null;
    state.filters.yearMin = state.derived.yearMin;
    state.filters.yearMax = state.derived.yearMax;
  }

  function buildFiltersUI() {
    els.search.value = "";
    els.search.addEventListener("input", () => {
      state.filters.query = els.search.value.trim().toLowerCase();
      applyFilters();
    });

    const { yearMin, yearMax } = state.derived;
    els.yearMin.min = yearMin || "";
    els.yearMin.max = yearMax || "";
    els.yearMax.min = yearMin || "";
    els.yearMax.max = yearMax || "";
    els.yearMin.value = yearMin || "";
    els.yearMax.value = yearMax || "";
    els.yearMin.addEventListener("input", () => {
      state.filters.yearMin = parseInt(els.yearMin.value || yearMin, 10);
      applyFilters();
    });
    els.yearMax.addEventListener("input", () => {
      state.filters.yearMax = parseInt(els.yearMax.value || yearMax, 10);
      applyFilters();
    });

    els.platformChips.innerHTML = "";
    state.derived.platforms.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = p;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        toggleSet(state.filters.platforms, p);
        btn.setAttribute(
          "aria-pressed",
          String(btn.getAttribute("aria-pressed") !== "true")
        );
        updateClearButtons();
        applyFilters();
      });
      els.platformChips.appendChild(btn);
    });

    els.stackChips.innerHTML = "";
    state.derived.stack.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = s;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        toggleSet(state.filters.stack, s);
        btn.setAttribute(
          "aria-pressed",
          String(btn.getAttribute("aria-pressed") !== "true")
        );
        updateClearButtons();
        applyFilters();
      });
      els.stackChips.appendChild(btn);
    });

    els.clearAll.addEventListener("click", clearAllFilters);
    els.clearPlatforms.addEventListener("click", () => clearGroup("platforms"));
    els.clearStack.addEventListener("click", () => clearGroup("stack"));
    els.retry.addEventListener("click", loadApps);

    els.footerYear.textContent = String(new Date().getFullYear());
  }

  function toggleSet(set, value) {
    set.has(value) ? set.delete(value) : set.add(value);
  }
  function clearGroup(group) {
    if (group === "platforms") {
      state.filters.platforms.clear();
      Array.from(els.platformChips.children).forEach((b) =>
        b.setAttribute("aria-pressed", "false")
      );
    }
    if (group === "stack") {
      state.filters.stack.clear();
      Array.from(els.stackChips.children).forEach((b) =>
        b.setAttribute("aria-pressed", "false")
      );
    }
    updateClearButtons();
    applyFilters();
  }
  function clearAllFilters() {
    els.search.value = "";
    state.filters.query = "";
    clearGroup("platforms");
    clearGroup("stack");
    state.filters.yearMin = state.derived.yearMin;
    state.filters.yearMax = state.derived.yearMax;
    els.yearMin.value = state.derived.yearMin || "";
    els.yearMax.value = state.derived.yearMax || "";
    updateClearButtons();
    applyFilters();
  }
  function updateClearButtons() {
    const anyPlatforms = state.filters.platforms.size > 0;
    const anyStack = state.filters.stack.size > 0;
    const query = state.filters.query.length > 0;
    const yearsChanged =
      state.filters.yearMin !== state.derived.yearMin ||
      state.filters.yearMax !== state.derived.yearMax;
    const any = anyPlatforms || anyStack || query || yearsChanged;
    els.clearAll.hidden = !any;
    els.clearPlatforms.hidden = !anyPlatforms;
    els.clearStack.hidden = !anyStack;
  }

  function matchesQuery(app, q) {
    if (!q) return true;
    return [app.name, app.tagline, ...(app.stack || [])]
      .join(" ")
      .toLowerCase()
      .includes(q);
  }
  function matchesPlatforms(app, sel) {
    if (sel.size === 0) return true;
    const has = new Set(app.platforms || []);
    for (const p of sel) {
      if (has.has(p)) return true;
    }
    return false;
  }
  function matchesStack(app, sel) {
    if (sel.size === 0) return true;
    const has = new Set(app.stack || []);
    for (const s of sel) {
      if (has.has(s)) return true;
    }
    return false;
  }
  function matchesYear(app, min, max) {
    if (!min && !max) return true;
    const y = app.year || 0;
    return (min ? y >= min : true) && (max ? y <= max : true);
  }

  function applyFilters() {
    const { query, platforms, stack, yearMin, yearMax } = state.filters;
    state.filtered = state.apps.filter(
      (app) =>
        matchesQuery(app, query) &&
        matchesPlatforms(app, platforms) &&
        matchesStack(app, stack) &&
        matchesYear(app, yearMin, yearMax)
    );
    renderGrid();
    els.resultCount.textContent = formatResultCount(state.filtered.length);
    updateClearButtons();
  }

  function renderGrid() {
    els.grid.innerHTML = "";
    if (state.filtered.length === 0) {
      const p = document.createElement("p");
      p.textContent = "No apps match your filters.";
      els.grid.appendChild(p);
      return;
    }
    const frag = document.createDocumentFragment();
    state.filtered.forEach((app, idx) =>
      frag.appendChild(createCard(app, idx))
    );
    els.grid.appendChild(frag);
  }

  function createBadge(text) {
    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = text;
    return span;
  }
  function platformIcon(name) {
    const map = { iOS: "", Android: "🤖", Web: "🌐", Desktop: "💻" };
    return map[name] || "📦";
  }

  function createCard(app, idx) {
    const article = document.createElement("article");
    article.className = "card";
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `Open details for ${app.name}`);
    const header = document.createElement("div");
    header.className = "card-header";
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = app.thumbnail;
    img.alt = `${app.name} thumbnail`;
    header.appendChild(img);
    const body = document.createElement("div");
    body.className = "card-body";
    const title = document.createElement("h3");
    title.className = "card-title";
    title.textContent = app.name;
    const tag = document.createElement("p");
    tag.className = "card-tag";
    tag.textContent = app.tagline;
    const metaRow = document.createElement("div");
    metaRow.className = "card-meta";
    const platforms = document.createElement("div");
    platforms.className = "platforms";
    (app.platforms || []).forEach((p) =>
      platforms.appendChild(createBadge(`${platformIcon(p)} ${p}`))
    );
    const year = document.createElement("span");
    year.className = "badge";
    year.textContent = String(app.year || "");
    metaRow.appendChild(platforms);
    metaRow.appendChild(year);
    const stack = document.createElement("div");
    stack.className = "badges";
    (app.stack || [])
      .slice(0, 4)
      .forEach((s) => stack.appendChild(createBadge(s)));
    const highlights = document.createElement("ul");
    highlights.className = "highlights";
    (app.highlights || []).slice(0, 3).forEach((h) => {
      const li = document.createElement("li");
      li.textContent = h;
      highlights.appendChild(li);
    });
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const learn = document.createElement("button");
    learn.type = "button";
    learn.className = "learn-more";
    learn.textContent = "Learn more";
    learn.addEventListener("click", () => openModal(app, article));
    article.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        openModal(app, article);
      }
    });
    article.addEventListener("click", (e) => {
      if (e.target === article) openModal(app, article);
    });
    actions.appendChild(learn);
    body.appendChild(title);
    body.appendChild(tag);
    body.appendChild(metaRow);
    body.appendChild(stack);
    body.appendChild(highlights);
    body.appendChild(actions);
    article.appendChild(header);
    article.appendChild(body);
    return article;
  }

  let lastFocused = null;
  function openModal(app, invoker) {
    lastFocused = invoker || document.activeElement;
    els.modalTitle.textContent = app.name;
    els.modalTagline.textContent = app.tagline || "";
    els.modalHero.src = app.hero;
    els.modalHero.alt = `${app.name} hero image`;
    els.modalBadges.innerHTML = "";
    (app.platforms || []).forEach((p) =>
      els.modalBadges.appendChild(createBadge(p))
    );
    (app.stack || []).forEach((s) =>
      els.modalBadges.appendChild(createBadge(s))
    );
    els.modalHighlights.innerHTML = "";
    (app.highlights || []).forEach((h) => {
      const li = document.createElement("li");
      li.textContent = h;
      els.modalHighlights.appendChild(li);
    });
    els.modalLinks.innerHTML = "";
    const links = [];
    if (app.links?.website) links.push(["Website", app.links.website]);
    if (app.links?.appStore) links.push(["App Store", app.links.appStore]);
    if (app.links?.playStore) links.push(["Play Store", app.links.playStore]);
    if (app.links?.github) links.push(["GitHub", app.links.github]);
    links.forEach(([label, href]) => {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "contact-link";
      a.style.width = "fit-content";
      a.textContent = label;
      els.modalLinks.appendChild(a);
    });
    els.modal.hidden = false;
    trapFocus(els.modal);
  }
  function closeModal() {
    els.modal.hidden = true;
    releaseFocusTrap();
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }
  els.modal.addEventListener("click", (e) => {
    if (e.target.hasAttribute("data-close")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (!els.modal.hidden && e.key === "Escape") closeModal();
  });

  let trapCleanup = null;
  function trapFocus(container) {
    const focusable = container.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    function onKeydown(e) {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeydown);
    trapCleanup = () => document.removeEventListener("keydown", onKeydown);
    const closeBtn = container.querySelector(".modal-close");
    if (closeBtn) closeBtn.focus();
  }
  function releaseFocusTrap() {
    if (trapCleanup) trapCleanup();
    trapCleanup = null;
  }

  function injectPersonJsonLd() {
    appendJsonLd({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Mark Webb",
      email: "mailto:apps.backflip.media@gmail.com",
      url: "https://testablekarma.github.io/",
      sameAs: [
        "https://github.com/testablekarma",
        "https://www.linkedin.com/in/testablekarma/",
        "https://x.com/testablekarma",
      ],
    });
  }
  function injectAppsJsonLd() {
    state.apps.forEach((app) =>
      appendJsonLd({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: app.name,
        description: app.tagline,
        operatingSystem: (app.platforms || []).join(", "),
        applicationCategory: "ProductivityApplication",
        url:
          app.links?.website ||
          app.links?.github ||
          "https://testablekarma.github.io/",
        datePublished: app.year ? String(app.year) : undefined,
        image: app.hero || app.thumbnail,
      })
    );
  }
  function appendJsonLd(obj) {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.text = JSON.stringify(obj);
    document.head.appendChild(s);
  }

  Theme.init();
  initAnalytics();
  loadApps();
})();
