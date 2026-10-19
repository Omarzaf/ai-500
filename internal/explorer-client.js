import {
  spring,
  advanceSpring,
  advanceInertia,
  snapSpring,
  clamp,
  seed,
  readableInk,
  sceneFrame,
  nearestVisiblePoint,
} from "/motion-math.mjs";

/* A deterministic volume: positions never encode influence or similarity. */
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("universe");
  const ctx = canvas.getContext("2d");
  const scene = $("explorer");
  const panel = $("profile-panel");
  const search = $("search");
  const results = $("search-results");
  const category = $("category");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const palette = {
    research: ["#303bc8", "#e5e9ff"],
    industry: ["#a94022", "#fff0dd"],
    infrastructure: ["#674580", "#f0e3ff"],
    "open-source": ["#17685d", "#e1f6d9"],
    safety: ["#5b477d", "#f0e8ff"],
    governance: ["#235b89", "#e2f2ff"],
    society: ["#8b3a51", "#ffe9e7"],
    applications: ["#45632f", "#edf7db"],
  };
  let data,
    people = [],
    points = [],
    projected = [],
    filtered = [],
    selected = null;
  let byId = new Map(),
    related = [],
    hover = null;
  let width = innerWidth,
    height = innerHeight;
  const camera = {
    yaw: spring(0.3),
    pitch: spring(-0.12),
    zoom: spring(1),
    focus: spring(0),
  };
  const orbit = { yaw: spring(0.3), pitch: spring(-0.12) };
  let zoomTarget = 1,
    focus = 0,
    raf = 0,
    lastTime = 0,
    elapsed = 0,
    pointer = null;
  let paused = false,
    appliedMotionOff = null,
    dragging = false,
    ink = "#173f32",
    snapLayout = true;
  let keyboardPoint = null,
    keyboardAnnouncementTimer = 0,
    searchPoint = null,
    evidenceOrigin = null,
    focusedSource = null,
    evidenceScroll = null;
  let portraitRequest = 0,
    portraitImage = null;
  let frame = sceneFrame(width, height, 0);
  let paperColor = "#b5d4a9";
  let hoverX = -1000,
    hoverY = -1000,
    labelClock = 1,
    labelQueue = [],
    neighborPoints = [];
  const pointById = new Map();
  const theme = [181, 212, 169, 23, 63, 50].map(spring);
  let themeTarget = [181, 212, 169, 23, 63, 50],
    paintedTheme = "";
  let profileAnimation = null;
  let identityBounds = { left: 0, right: 0, top: 0, bottom: 0 };
  let edges = [];
  let reservedUiBounds = [];
  const debug = new URLSearchParams(location.search).get("debug") === "motion";
  const diagnostics = debug ? document.createElement("output") : null;
  const metrics = {
    frames: 0,
    draw: [],
    intervals: [],
    lastReport: 0,
    longFrames: 0,
    maxStep: 0,
    recentSamples: [],
  };
  if (diagnostics) {
    diagnostics.id = "motion-diagnostics";
    diagnostics.hidden = true;
    scene.append(diagnostics);
  }
  const norm = (value) =>
    value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const motionOff = () => paused || reduced.matches;
  const categoryName = (id) =>
    data.edition.categories.find((item) => item.id === id)?.title ?? id;
  const announce = (text) => {
    $("announcement").textContent = text;
  };
  function setMotion() {
    const stopped = motionOff();
    appliedMotionOff = stopped;
    scene.classList.toggle("no-motion", stopped);
    $("pause").textContent = stopped ? "▷" : "Ⅱ";
    $("pause").setAttribute(
      "aria-label",
      reduced.matches
        ? "Animation off: system reduced motion"
        : stopped
          ? "Resume animation"
          : "Pause animation"
    );
    $("pause").setAttribute("aria-pressed", String(stopped));
    $("pause").title = reduced.matches
      ? "Reduced motion is enabled in your system settings"
      : stopped
        ? "Resume animation"
        : "Pause animation";
    if (stopped) {
      profileAnimation?.cancel();
      profileAnimation = null;
      if (evidenceScroll?.target.isConnected) {
        const { target, block } = evidenceScroll;
        evidenceScroll = null;
        target.scrollIntoView({ behavior: "instant", block });
      }
      // CSS and Canvas must reach the same complete state when motion stops.
      snapLayout = true;
      theme.forEach((channel, index) =>
        snapSpring(channel, themeTarget[index])
      );
      for (const edge of edges) edge.opacity.velocity = 0;
      orbit.yaw.velocity = orbit.pitch.velocity = 0;
      camera.yaw.velocity =
        camera.pitch.velocity =
        camera.zoom.velocity =
        camera.focus.velocity =
          0;
      for (const point of points) {
        point.sx.velocity =
          point.sy.velocity =
          point.size.velocity =
          point.alpha.velocity =
          point.labelAlpha.velocity =
            0;
      }
    }
    labelClock = 1;
    cacheUiBounds();
    lastTime = 0;
    requestDraw();
  }
  function obscuresPoint(bounds, point) {
    const radius = point.size.value + 5;
    return (
      point.px + radius >= bounds.left &&
      point.px - radius <= bounds.right &&
      point.py + radius >= bounds.top &&
      point.py - radius <= bounds.bottom
    );
  }
  function cacheUiBounds(swept = false) {
    identityBounds = scene.querySelector(".identity").getBoundingClientRect();
    const discovery = scene.querySelector(".discovery").getBoundingClientRect();
    const controls = scene
      .querySelector(".view-controls")
      .getBoundingClientRect();
    // Reserve the controls' current-to-final path while CSS animates their right offset.
    const right = sceneFrame(width, height, focus).mobile
      ? selected
        ? 17
        : 19
      : !selected
        ? 30
        : width >= 1700
          ? 628
          : width <= 1000
            ? Math.max(width * 0.42, 350) + 22
            : width * 0.36 + 28;
    const finalLeft = width - right - controls.width;
    reservedUiBounds = [
      discovery,
      scene.querySelector(".scene-caption").getBoundingClientRect(),
      {
        left: swept ? Math.min(controls.left, finalLeft) : controls.left,
        right: swept ? Math.max(controls.right, width - right) : controls.right,
        top: controls.top,
        bottom: controls.bottom,
      },
    ];
    labelClock = 1;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    cacheUiBounds(true);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const point of points) {
      point.textWidths = [9, 10, 11, 12].map((size) => {
        ctx.font = size + "px ui-monospace, SFMono-Regular, Menlo, monospace";
        return ctx.measureText(point.label).width;
      });
    }
    if (motionOff()) snapLayout = true;
    labelClock = 1;
    requestDraw();
  }
  function writeUrl(replace = false) {
    const url = new URL(location.href);
    for (const [key, value] of [
      ["q", search.value.trim()],
      ["category", category.value],
      ["person", selected?.id],
    ]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== location.href)
      history[replace ? "replaceState" : "pushState"]({}, "", url);
  }
  function filterPeople() {
    const terms = norm(search.value.trim()).split(/\s+/).filter(Boolean);
    filtered = people.filter(
      (person) =>
        (!category.value || person.category === category.value) &&
        terms.every((term) => person.searchText.includes(term))
    );
    $("result-count").textContent =
      `${filtered.length} ${filtered.length === 1 ? "person" : "people"}`;
    const ids = new Set(filtered.map((person) => person.id));
    for (const point of points) point.visible = ids.has(point.person.id);
    searchPoint =
      terms.length && filtered.length === 1
        ? pointById.get(filtered[0].id)
        : null;
    if (selected && !ids.has(selected.id))
      selectPerson(null, { updateUrl: false });
    renderResults();
    if (motionOff()) snapLayout = true;
    labelClock = 1;
    requestDraw();
  }
  function renderResults() {
    results.replaceChildren();
    if (!search.value.trim()) {
      hideResults();
      return;
    }
    for (const person of filtered.slice(0, 30)) {
      const button = node("button", "search-result");
      button.type = "button";
      button.append(
        node("strong", "", person.name),
        node("span", "", person.role.organization)
      );
      button.addEventListener("click", () => openSearchResult(person.id));
      results.append(button);
    }
    if (!filtered.length)
      results.append(
        node(
          "p",
          "search-empty",
          "No matches. Try a name, organization, or tag."
        )
      );
    if (filtered.length > 30)
      results.append(
        node(
          "p",
          "search-summary",
          `First 30 of ${filtered.length} matches, A–Z. Keep typing to narrow your search.`
        )
      );
    results.hidden = false;
    search.setAttribute("aria-expanded", "true");
  }
  function hideResults() {
    results.hidden = true;
    search.setAttribute("aria-expanded", "false");
  }
  function openSearchResult(id) {
    search.value = "";
    filterPeople();
    selectPerson(id, { focusHeading: true });
  }
  function section(title, text) {
    const el = node("section", "profile-section");
    el.append(node("h3", "", title));
    if (text) el.append(node("p", "", text));
    return el;
  }
  function scrollToEvidence(target, block) {
    evidenceScroll = motionOff() ? null : { target, block };
    target.scrollIntoView({
      behavior: motionOff() ? "instant" : "smooth",
      block,
    });
  }
  const panelScroll = panel.querySelector(".panel-scroll");
  panelScroll.addEventListener("scrollend", () => {
    evidenceScroll = null;
  });
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
    panelScroll.addEventListener(
      event,
      () => {
        // A deliberate gesture takes ownership from the citation navigation.
        evidenceScroll = null;
      },
      { passive: true }
    );
  function revealSource(sourceId, trigger) {
    const target = document.getElementById(sourceId);
    if (!target) return;
    if (focusedSource) {
      focusedSource.classList.remove("source-focus");
      focusedSource.querySelector(".source-return").hidden = true;
    }
    evidenceOrigin = trigger;
    focusedSource = target;
    target.classList.add("source-focus");
    target.querySelector(".source-return").hidden = false;
    target.focus({ preventScroll: true });
    scrollToEvidence(target, "start");
  }
  function claimCitations(person, title, ids) {
    const citations = node("div", "claim-citations");
    citations.setAttribute("role", "group");
    citations.setAttribute("aria-label", `Sources for ${title.toLowerCase()}`);
    const sources = new Map(
      person.sources.map((source, index) => [
        source.id,
        { source, number: index + 1 },
      ])
    );
    for (const id of ids) {
      const entry = sources.get(id);
      if (!entry) continue;
      const targetId = `source-${person.id}-${id}`;
      const button = node(
        "button",
        "claim-citation",
        `Source ${entry.number} ↗`
      );
      button.type = "button";
      button.setAttribute(
        "aria-label",
        `${title}: source ${entry.number} — ${entry.source.title}`
      );
      button.setAttribute("aria-controls", targetId);
      button.addEventListener("click", () => revealSource(targetId, button));
      citations.append(button);
    }
    return citations;
  }
  function renderPortrait(person) {
    const request = ++portraitRequest;
    if (portraitImage) {
      portraitImage.onload = portraitImage.onerror = null;
      portraitImage.removeAttribute("src");
      portraitImage.remove();
      portraitImage = null;
    }
    const figure = $("profile-portrait");
    const fallback = $("portrait-fallback");
    const status = $("portrait-status");
    const source = $("portrait-source");
    const attribution = $("portrait-attribution");
    const credit = $("portrait-credit");
    figure.dataset.person = person?.id ?? "";
    figure.dataset.state = "unavailable";
    fallback.hidden = false;
    status.textContent = "Portrait unavailable";
    attribution.hidden = credit.hidden = true;
    source.removeAttribute("href");
    source.removeAttribute("aria-label");
    source.removeAttribute("title");
    credit.textContent = "";
    const words = person?.name.trim().split(/\s+/u) ?? [];
    const initials = words.length > 1 ? [words[0], words.at(-1)] : words;
    $("portrait-initials").textContent = initials
      .map((word) => Array.from(word)[0])
      .join("")
      .toLocaleUpperCase("en");
    if (!person) return;
    const portrait = data.portraits?.[person.id];
    if (
      !portrait ||
      !["webp", "jpg", "jpeg", "png", "avif"].some(
        (extension) => portrait.src === `/portraits/${person.id}.${extension}`
      ) ||
      typeof portrait.credit !== "string" ||
      !portrait.credit.trim()
    )
      return;
    let sourceUrl;
    try {
      sourceUrl = new URL(portrait.sourceUrl);
      if (!["https:", "http:"].includes(sourceUrl.protocol)) return;
    } catch {
      return;
    }
    const image = new Image(256, 256);
    portraitImage = image;
    image.id = "profile-portrait-image";
    image.alt = `Portrait of ${person.name}`;
    image.loading = "eager";
    image.decoding = "async";
    if (
      /^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$/.test(
        portrait.objectPosition || ""
      )
    )
      image.style.objectPosition = portrait.objectPosition;
    if (
      Number.isFinite(portrait.objectScale) &&
      portrait.objectScale >= 1 &&
      portrait.objectScale <= 3
    ) {
      image.style.transform = `scale(${portrait.objectScale})`;
      image.style.transformOrigin = image.style.objectPosition || "50% 25%";
    }
    figure.dataset.state = "loading";
    status.textContent = "Loading portrait…";
    const isCurrent = () =>
      request === portraitRequest &&
      selected?.id === person.id &&
      portraitImage === image;
    image.onload = () => {
      if (!isCurrent()) return;
      $("portrait-frame").append(image);
      fallback.hidden = true;
      figure.dataset.state = "ready";
      source.href = sourceUrl.href;
      source.setAttribute("aria-label", `Photo source for ${person.name}`);
      source.title =
        portrait.license && portrait.license !== "Rights not established"
          ? `${portrait.credit} · ${portrait.license}`
          : portrait.credit;
      credit.textContent = `Photo: ${portrait.credit}`;
      const licenseLink = document.createElement("a");
      licenseLink.href = `/photo-credits#${person.id}`;
      licenseLink.textContent = "License & attribution";
      licenseLink.target = "_blank";
      licenseLink.rel = "noopener noreferrer";
      credit.append(" · ", licenseLink);
      attribution.hidden = credit.hidden = false;
    };
    image.onerror = () => {
      if (!isCurrent()) return;
      image.onload = image.onerror = null;
      image.remove();
      portraitImage = null;
      figure.dataset.state = "unavailable";
      status.textContent = "Portrait unavailable";
    };
    image.src = portrait.src;
  }
  function buildProfile(person) {
    evidenceOrigin = focusedSource = null;
    evidenceScroll = null;
    $("profile-category").textContent = categoryName(person.category);
    $("profile-index").textContent =
      `${people.length} people · An alphabetical selection`;
    $("profile-name").textContent = person.name;
    renderPortrait(person);
    $("profile-role").textContent =
      `${person.role.title}\n${person.role.organization}`;
    $("role-date").textContent = person.role.asOf
      ? `Role evidence dated ${person.role.asOf}`
      : "Role date not established";
    $("role-citations").replaceChildren(
      claimCitations(person, "Role", person.role.sourceIds)
    );
    $("full-profile").href = `/people/${person.id}`;
    const body = $("profile-body");
    body.replaceChildren();
    const tags = node("div", "tags");
    person.tags.forEach((tag) => tags.append(node("span", "tag", tag)));
    const contribution = section("Contribution", person.contribution);
    contribution.append(
      claimCitations(person, "Contribution", person.claimSources.contribution)
    );
    const inclusion = section("Why included", person.influence);
    inclusion.append(
      claimCitations(person, "Why included", person.claimSources.influence)
    );
    body.append(tags, contribution, inclusion);
    const connections = section("Shared catalog tags");
    connections.append(
      node(
        "p",
        "fine",
        "Up to six people with shared catalog tags. Lines show shared tags, not collaborations."
      )
    );
    for (const connection of related) {
      const other = byId.get(connection.id);
      if (!other) continue;
      const button = node("button", "neighbor");
      button.type = "button";
      const name = node("span", "neighbor-name", other.name);
      name.append(node("span", "", "↗"));
      button.append(name, node("small", "", connection.sharedTags.join(" · ")));
      button.addEventListener("click", () => {
        search.value = "";
        category.value = "";
        filterPeople();
        selectPerson(other.id, { focusHeading: true });
      });
      connections.append(button);
    }
    if (!related.length)
      connections.append(
        node(
          "p",
          "fine",
          "No shared catalog tags with another entry in this edition."
        )
      );
    body.append(connections);
    const evidence = section(`${person.sources.length} sources & evidence`);
    const sources = node("ol", "sources-list");
    for (const [index, source] of person.sources.entries()) {
      const li = node("li", "source-item");
      li.id = `source-${person.id}-${source.id}`;
      li.tabIndex = -1;
      li.setAttribute("aria-label", `Source ${index + 1}: ${source.title}`);
      const link = node("a", "", `${source.title} ↗`);
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      li.append(
        link,
        node(
          "small",
          "",
          `${source.publisher} · ${source.kind} · ${source.publishedOn ? `Published ${source.publishedOn}` : "Publication date not established"} · Checked ${source.checkedOn}`
        )
      );
      li.append(node("p", "source-note", source.note));
      const back = node("button", "source-return", "← Back to the claim");
      back.type = "button";
      back.hidden = true;
      back.addEventListener("click", () => {
        if (!evidenceOrigin?.isConnected) return;
        evidenceOrigin.focus({ preventScroll: true });
        scrollToEvidence(evidenceOrigin, "center");
        li.classList.remove("source-focus");
        back.hidden = true;
        evidenceOrigin = focusedSource = null;
      });
      li.append(back);
      sources.append(li);
    }
    evidence.append(
      sources,
      node(
        "p",
        "fine",
        "Check dates record source review; they do not establish when a source was updated."
      )
    );
    body.append(evidence);
    if (person.uncertainties?.length) {
      const limits = section("Evidence limitations"),
        list = node("ul", "limitations");
      person.uncertainties.forEach((text) => list.append(node("li", "", text)));
      limits.append(list);
      body.append(limits);
    }
    body.append(
      section(
        "Review status",
        person.reviewStatus === "human-reviewed"
          ? "Human reviewed."
          : "AI-assisted source review. Human editorial review pending."
      )
    );
    panel.querySelector(".panel-scroll").scrollTop = 0;
  }
  function selectPerson(id, { updateUrl = true, focusHeading = false } = {}) {
    profileAnimation?.cancel();
    selected = byId.get(id) ?? null;
    orbit.yaw.velocity = orbit.pitch.velocity = 0;
    related = selected ? (data.related[selected.id] ?? []) : [];
    neighborPoints = [];
    for (const point of points) {
      point.neighbor = false;
      point.neighborIndex = -1;
    }
    related.forEach((entry, index) => {
      const point = pointById.get(entry.id);
      if (!point) return;
      point.neighbor = true;
      point.neighborIndex = index;
      // Even sectors prevent collisions; stable id jitter avoids a mechanical hexagon.
      point.angle =
        (index / Math.max(related.length, 1)) * Math.PI * 2 -
        Math.PI / 2 +
        (seed(entry.id, 31) - 0.5) * 0.58;
      point.distance = 0.69 + seed(entry.id, 47) * 0.48;
      point.neighborDepth = seed(entry.id, 97) * 0.7 - 0.35;
      neighborPoints.push(point);
    });
    for (const edge of edges) edge.target = 0;
    if (selected)
      for (const point of neighborPoints) {
        const previous = edges.find(
          (edge) => edge.from.person.id === selected.id && edge.to === point
        );
        if (previous) previous.target = 1;
        else
          edges.push({
            from: pointById.get(selected.id),
            to: point,
            opacity: spring(0),
            target: 1,
          });
      }
    const colors = selected
      ? (palette[selected.category] ?? palette.research)
      : ["#b5d4a9", "#173f32"];
    themeTarget = colors.flatMap((color) =>
      [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
    );
    document.querySelector('meta[name="theme-color"]').content = colors[0];
    scene.classList.toggle("selected", Boolean(selected));
    scene.querySelector(".identity").inert = Boolean(selected);
    panel.hidden = false;
    panel.inert = !selected;
    panel.setAttribute("aria-hidden", String(!selected));
    $("previous").disabled = filtered.length <= 1;
    $("next").disabled = filtered.length <= 1;
    if (selected) {
      buildProfile(selected);
      profileAnimation?.cancel();
      if (!motionOff())
        profileAnimation = $("profile-body").animate(
          [{ transform: "translateY(4px)" }, { transform: "translateY(0)" }],
          {
            duration: parseFloat(
              getComputedStyle(scene).getPropertyValue("--motion-standard")
            ),
            easing: getComputedStyle(scene)
              .getPropertyValue("--motion-enter-ease")
              .trim(),
          }
        );
      $("scene-instruction").textContent = related.length
        ? `${related.length} shared-tag connections · Up to six shown`
        : "No shared catalog tags in this edition";
      $("graph-note").textContent =
        "Lines are shared tags, not collaborations. Position and size do not rank influence.";
      announce(
        `${selected.name}. ${categoryName(selected.category)}. ${related.length} shared-tag connections.`
      );
      if (focusHeading) $("profile-name").focus({ preventScroll: true });
    } else {
      renderPortrait(null);
      $("scene-instruction").textContent = "Drag to rotate · Select a person";
      $("graph-note").textContent = "Position and size do not rank influence.";
    }
    if (motionOff()) snapLayout = true;
    labelClock = 1;
    hideResults();
    hover = null;
    if (updateUrl) writeUrl();
    cacheUiBounds(true);
    requestDraw();
  }
  function restoreUrl() {
    const url = new URL(location.href);
    search.value = (url.searchParams.get("q") ?? "").slice(0, 200);
    category.value = url.searchParams.get("category") ?? "";
    filterPeople();
    const id = url.searchParams.get("person");
    if (id && !byId.has(id))
      announce(
        "That person could not be found. Use the Directory link to browse all profiles."
      );
    selectPerson(id, { updateUrl: false });
  }
  function nextPerson(step) {
    const list = filtered.length ? filtered : people;
    const index = list.findIndex((person) => person.id === selected?.id);
    selectPerson(list[(index + step + list.length) % list.length]?.id, {
      focusHeading: true,
    });
  }
  function requestDraw() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(draw);
  }
  function paintTheme(dt, snap) {
    for (let i = 0; i < theme.length; i++) {
      if (snap) snapSpring(theme[i], themeTarget[i]);
      else if (!motionOff()) advanceSpring(theme[i], themeTarget[i], 16, dt);
    }
    const values = theme.map((channel) =>
      Math.round(clamp(channel.value, 0, 255))
    );
    const signature = values.join(",");
    if (signature === paintedTheme) return;
    paintedTheme = signature;
    const paper = `rgb(${values[0]},${values[1]},${values[2]})`;
    paperColor = paper;
    const background = values.slice(0, 3),
      preferred = values.slice(3);
    const foreground = readableInk(background, preferred);
    const panelForeground = readableInk(
      background.map((value) => value * 0.93 + 255 * 0.07),
      preferred
    );
    ink = "rgb(" + foreground.join(",") + ")";
    scene.style.setProperty(
      "--panel-ink",
      "rgb(" + panelForeground.join(",") + ")"
    );
    scene.style.setProperty("--paper", paper);
    scene.style.setProperty("--ink", ink);
    scene.style.setProperty("--line", `rgba(${foreground.join(",")},.22)`);
  }
  function reportMotion(now, start, interval) {
    if (!diagnostics) return;
    metrics.frames++;
    metrics.draw.push(performance.now() - start);
    if (interval > 0 && !motionOff()) metrics.intervals.push(interval);
    if (interval > 34 && !motionOff()) metrics.longFrames++;
    if (now - metrics.lastReport < 1000 && !motionOff()) return;
    const percentile = (values, fraction) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return +(
        sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
        ] || 0
      ).toFixed(2);
    };
    const mean =
      metrics.draw.reduce((sum, value) => sum + value, 0) / metrics.draw.length;
    const seconds =
      metrics.intervals.reduce((sum, value) => sum + value, 0) / 1000;
    const sample = {
      elapsedMs: Math.round(now),
      windowMs: Math.round(seconds * 1000),
      frames: metrics.draw.length,
      totalFrames: metrics.frames,
      meanDrawMs: +mean.toFixed(2),
      p95DrawMs: percentile(metrics.draw, 0.95),
      p95IntervalMs: percentile(metrics.intervals, 0.95),
      fps: +(metrics.intervals.length / (seconds || 1)).toFixed(1),
      longFrames: metrics.longFrames,
      maxNodeStepPx: +metrics.maxStep.toFixed(2),
      state: motionOff() ? "paused" : dragging ? "dragging" : "running",
      nodes: points.length,
      zoom: +camera.zoom.value.toFixed(3),
      cameraFocus: +camera.focus.value.toFixed(4),
      targetFocus: selected ? 1 : 0,
      selected: selected?.id ?? null,
      keyboardCandidate: keyboardPoint?.person.id ?? null,
      keyboardPosition: keyboardPoint
        ? {
            x: keyboardPoint.px,
            y: keyboardPoint.py,
            radius: keyboardPoint.size.value + 5,
          }
        : null,
      center: { x: frame.cx, y: frame.cy },
      edges: edges
        .filter((edge) => edge.target)
        .map((edge) => +edge.opacity.value.toFixed(4)),
      maxPositionError: +Math.max(
        0,
        ...points.map((point) =>
          Math.hypot(point.px - point.targetX, point.py - point.targetY)
        )
      ).toFixed(4),
    };
    metrics.recentSamples.push(sample);
    if (metrics.recentSamples.length > 15) metrics.recentSamples.shift();
    diagnostics.textContent = JSON.stringify({
      ...sample,
      recentSamples: metrics.recentSamples,
    });
    metrics.draw.length = metrics.intervals.length = 0;
    metrics.maxStep = 0;
    metrics.longFrames = 0;
    metrics.lastReport = now;
  }
  function layoutLabels(mobile, labelRight) {
    labelQueue.length = 0;
    const prominentSize = mobile ? 11 : 12;
    const quietSize = mobile ? 10 : 11;
    for (const point of points) {
      const active = point.person.id === selected?.id;
      point.prominence = active
        ? 3
        : point === hover ||
            point === searchPoint ||
            (document.activeElement === canvas && point === keyboardPoint)
          ? 2
          : point.neighbor && focus > 0.3
            ? 1
            : 0;
      // A depth dead band keeps slow rotation from toggling names at a threshold.
      point.labelDepthVisible =
        point.z > (point.labelDepthVisible ? 0.12 : 0.24);
      const candidate =
        point.visible &&
        point.labelDepthVisible &&
        point.labelRank < 0.2 &&
        focus < 0.55;
      point.labelTarget = 0;
      if (point.prominence || candidate) labelQueue.push(point);
    }
    labelQueue.sort(
      (a, b) =>
        b.prominence - a.prominence ||
        Number(b.labelVisible) - Number(a.labelVisible) ||
        a.labelRank - b.labelRank
    );
    let quietCount = 0,
      occupiedCount = 0;
    for (const point of labelQueue) {
      const size = point.prominence ? prominentSize : quietSize;
      const tw = point.textWidths[size - 9];
      const tx = clamp(point.px - tw / 2, 12, labelRight - tw - 12);
      const ty = point.py + point.size.value + (point.prominence ? 20 : 16);
      const box = point.labelBox;
      box[0] = tx - 6;
      box[1] = ty - size - 4;
      box[2] = tx + tw + 6;
      box[3] = ty + 5;
      let allowed =
        ty < Math.min(height - (mobile ? 125 : 90), frame.bottom - 14) &&
        ty > (mobile ? 118 : 100);
      // Cache the real DOM title bounds at resize; no layout reads in the render loop.
      if (
        !selected &&
        box[0] < identityBounds.right + 12 &&
        box[2] > identityBounds.left - 12 &&
        box[1] < identityBounds.bottom + 12 &&
        box[3] > identityBounds.top - 12
      )
        allowed = false;
      for (const reserved of reservedUiBounds) {
        if (
          box[0] < reserved.right + 12 &&
          box[2] > reserved.left - 12 &&
          box[1] < reserved.bottom + 12 &&
          box[3] > reserved.top - 12
        )
          allowed = false;
      }
      if (!point.prominence && quietCount >= (mobile ? 9 : 20)) allowed = false;
      if (allowed) {
        for (let i = 0; i < occupiedCount; i++) {
          const other = occupied[i].labelBox;
          if (
            box[0] < other[2] &&
            box[2] > other[0] &&
            box[1] < other[3] &&
            box[3] > other[1]
          ) {
            allowed = false;
            break;
          }
        }
      }
      point.labelVisible = allowed;
      if (!allowed) continue;
      point.labelTarget = 1;
      point.labelSize = size;
      point.labelTx = tx;
      point.labelTy = ty;
      if (!point.prominence) quietCount++;
      // Store accepted boxes in a separate fixed slot, avoiding allocations per frame.
      occupied[occupiedCount++] = point;
    }
  }
  const occupied = [];
  function draw(now) {
    const start = debug ? performance.now() : 0;
    raf = 0;
    // A media-query read can update before its change event is delivered.
    // Settle all owners before this frame decides to stop scheduling itself.
    if (motionOff() !== appliedMotionOff) setMotion();
    const interval = lastTime ? now - lastTime : 0;
    // Keep a blocked foreground frame from fast-forwarding the visual scene.
    // Diagnostics retain the raw interval; normal 30–144 Hz remains time based.
    const dt = Math.min(interval / 1000, 1 / 30);
    lastTime = now;
    const stopped = motionOff();
    const snap = snapLayout || !points[0]?.initialized;
    if (!stopped) {
      const reading =
        selected ||
        hover ||
        search.value.trim() ||
        document.activeElement === canvas ||
        panel.contains(document.activeElement) ||
        $("about").open;
      if (!reading) elapsed += dt;
      if (!dragging && !reading) {
        advanceInertia(orbit.yaw, 4.2, dt);
        advanceInertia(orbit.pitch, 4.8, dt);
        orbit.yaw.value += dt * 0.018;
      } else if (!dragging) {
        orbit.yaw.velocity = orbit.pitch.velocity = 0;
      }
      orbit.pitch.value = clamp(orbit.pitch.value, -1.25, 1.25);
      advanceSpring(camera.yaw, orbit.yaw.value, dragging ? 24 : 16, dt);
      advanceSpring(camera.pitch, orbit.pitch.value, dragging ? 24 : 16, dt);
      advanceSpring(camera.zoom, zoomTarget, 12, dt);
      if (camera.zoom.value < 0.6 || camera.zoom.value > 1.65)
        snapSpring(camera.zoom, clamp(camera.zoom.value, 0.6, 1.65));
      advanceSpring(camera.focus, selected ? 1 : 0, 16, dt);
    } else if (snap) {
      snapSpring(camera.yaw, orbit.yaw.value);
      snapSpring(camera.pitch, orbit.pitch.value);
      snapSpring(camera.zoom, zoomTarget);
      snapSpring(camera.focus, selected ? 1 : 0);
    }
    focus = camera.focus.value;
    paintTheme(dt, snap && stopped);
    frame = sceneFrame(width, height, focus);
    const { mobile, panelWidth, cx, cy, right: labelRight } = frame;
    const radius =
      Math.min(
        width * (mobile ? 0.57 : 0.34),
        height * (mobile ? 0.32 : 0.41)
      ) * camera.zoom.value;
    const sy = Math.sin(camera.yaw.value),
      cyaw = Math.cos(camera.yaw.value);
    const sp = Math.sin(camera.pitch.value),
      cp = Math.cos(camera.pitch.value);
    const ring =
      Math.min(
        mobile ? width * 0.28 : (width - panelWidth) * 0.29,
        mobile ? height * 0.075 : height * 0.25
      ) * Math.min(camera.zoom.value, 1.18);
    for (const point of points) {
      const x = point.x * cyaw + point.z0 * sy,
        zz = -point.x * sy + point.z0 * cyaw;
      const y = point.y * cp - zz * sp;
      point.z = point.y * sp + zz * cp;
      const perspective = 2.8 / (2.8 - point.z);
      let px = cx + x * radius * perspective,
        py = cy + y * radius * perspective;
      let size = point.baseSize * perspective;
      const active = selected?.id === point.person.id;
      if (active) {
        px += (cx - px) * focus;
        py += (cy - py) * focus;
        size += ((mobile ? 8 : 11) - size) * focus;
      } else if (point.neighbor) {
        const angle =
          point.angle +
          Math.sin(elapsed * 0.23 + point.flowPhase * Math.PI * 2) * 0.028;
        const depth = 1 / (1 - point.neighborDepth * 0.3);
        const float =
          1 + Math.sin(elapsed * 0.17 + point.flowPhase * 7) * 0.018;
        const targetX =
          cx +
          Math.cos(angle) *
            ring *
            point.distance *
            depth *
            float *
            (mobile ? 1.48 : 1.2);
        const targetY =
          cy + Math.sin(angle) * ring * point.distance * depth * float;
        px += (targetX - px) * focus;
        py += (targetY - py) * focus;
        size += ((mobile ? 5.5 : 8) * depth - size) * focus;
      }
      const depthAlpha = 0.18 + ((point.z + 1) / 2) ** 1.6 * 0.52;
      const alpha =
        active || point.neighbor || point === searchPoint
          ? 1
          : point.visible
            ? depthAlpha * (1 - focus * 0.86)
            : 0;
      const oldX = point.sx.value,
        oldY = point.sy.value;
      point.targetX = px;
      point.targetY = py;
      if (snap) {
        snapSpring(point.sx, px);
        snapSpring(point.sy, py);
        snapSpring(point.size, size);
        snapSpring(point.alpha, alpha);
        point.initialized = true;
      } else if (!stopped) {
        advanceSpring(point.sx, px, dragging ? 24 : 20, dt);
        advanceSpring(point.sy, py, dragging ? 24 : 20, dt);
        advanceSpring(point.size, size, 18, dt);
        advanceSpring(point.alpha, alpha, 18, dt);
      }
      point.px = point.sx.value;
      point.py = point.sy.value;
      point.pickable =
        point.alpha.value >= 0.15 &&
        (point.visible || point.neighbor || active) &&
        (!selected || focus <= 0.8 || point.neighbor || active) &&
        (selected || !obscuresPoint(identityBounds, point));
      if (point.pickable) {
        for (const bounds of reservedUiBounds) {
          if (obscuresPoint(bounds, point)) {
            point.pickable = false;
            break;
          }
        }
      }
      if (debug && !snap)
        metrics.maxStep = Math.max(
          metrics.maxStep,
          Math.hypot(point.px - oldX, point.py - oldY)
        );
    }
    snapLayout = false;
    const candidate = nearestVisiblePoint(points, frame);
    if (keyboardPoint !== candidate || !$("keyboard-target").textContent) {
      keyboardPoint = candidate;
      $("keyboard-target").textContent = candidate
        ? `Enter to open ${candidate.person.name}`
        : "No visible people. Try another search.";
      canvas.dataset.keyboardPerson = candidate?.person.id ?? "";
      labelClock = 1;
      if (document.activeElement === canvas) {
        cacheUiBounds();
        announceKeyboardTarget();
      }
    }
    if (!pointer) {
      const nextHover = hit(hoverX, hoverY);
      if (nextHover !== hover) {
        hover = nextHover;
        labelClock = 1;
      }
      canvas.style.cursor = hover ? "pointer" : "grab";
    }
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = ctx.strokeStyle = ink;
    for (const edge of edges) {
      if (snap && stopped) snapSpring(edge.opacity, edge.target);
      else if (!stopped) advanceSpring(edge.opacity, edge.target, 18, dt);
      const alpha = edge.opacity.value * focus;
      if (alpha < 0.001) continue;
      const origin = edge.from,
        point = edge.to;
      ctx.globalAlpha = 0.23 * alpha;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(origin.px, origin.py);
      ctx.lineTo(point.px, point.py);
      ctx.stroke();
    }
    if (edges.length > 18)
      edges = edges.filter((edge) => edge.target || edge.opacity.value > 0.001);
    projected.sort((a, b) => a.z - b.z);
    for (const point of projected) {
      if (point.alpha.value < 0.002) continue;
      ctx.globalAlpha = point === hover ? 0.95 : point.alpha.value;
      ctx.beginPath();
      ctx.arc(point.px, point.py, point.size.value, 0, Math.PI * 2);
      ctx.fill();
      const keyboardActive =
        document.activeElement === canvas && point === keyboardPoint;
      if (
        point.person.id === selected?.id ||
        point === hover ||
        point === searchPoint ||
        keyboardActive
      ) {
        ctx.globalAlpha = keyboardActive ? 1 : 0.65 * point.alpha.value;
        ctx.lineWidth = keyboardActive ? 1.5 : 0.7;
        ctx.beginPath();
        ctx.arc(point.px, point.py, point.size.value + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    labelClock += dt;
    if (labelClock >= 0.12 || snap || stopped) {
      layoutLabels(mobile, labelRight);
      labelClock = 0;
    }
    for (const point of points) {
      // Labels are either readable or absent; dot depth never fades text contrast.
      if (
        !point.labelVisible ||
        point.labelTarget !== 1 ||
        point.alpha.value < 0.15
      )
        continue;
      const fontSize = point.labelSize || (mobile ? 9 : 10);
      const tw = point.textWidths[fontSize - 9];
      // Position follows the point every frame even while collision decisions are held.
      const tx = clamp(point.px - tw / 2, 12, labelRight - tw - 12);
      const ty = point.py + point.size.value + (point.prominence ? 20 : 16);
      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.globalAlpha = 1;
      ctx.fillStyle = paperColor;
      ctx.fillRect(tx - 3, ty - fontSize - 2, tw + 6, fontSize + 5);
      ctx.fillStyle = ink;
      ctx.fillText(point.label, tx, ty);
    }
    ctx.globalAlpha = 1;
    reportMotion(now, start, interval);
    if (!stopped && !document.hidden) requestDraw();
  }
  function hit(x, y) {
    let result = null;
    for (const point of points) {
      if (!point.pickable) continue;
      const dx = point.px - x,
        dy = point.py - y;
      const radius = Math.max(point.size.value + 7, 12);
      if (
        dx * dx + dy * dy < radius * radius &&
        (!result || point.z > result.z)
      )
        result = point;
    }
    return result;
  }
  function finishPointer() {
    const id = pointer?.id;
    pointer = null;
    dragging = false;
    if (id !== undefined && canvas.hasPointerCapture(id))
      canvas.releasePointerCapture(id);
    canvas.style.cursor = hover ? "pointer" : "grab";
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (pointer || !event.isPrimary || event.button !== 0) return;
    pointer = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      id: event.pointerId,
      time: event.timeStamp,
    };
    orbit.yaw.velocity = orbit.pitch.velocity = 0;
    dragging = false;
    canvas.setPointerCapture(event.pointerId);
    hideResults();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointer && event.pointerId !== pointer.id) return;
    hoverX = event.clientX;
    hoverY = event.clientY;
    if (pointer) {
      if (
        Math.hypot(
          event.clientX - pointer.startX,
          event.clientY - pointer.startY
        ) > 4
      )
        dragging = true;
      const seconds = Math.max(0.004, (event.timeStamp - pointer.time) / 1000);
      const dx = (event.clientX - pointer.x) * 0.0032;
      const dy = (event.clientY - pointer.y) * 0.0032;
      if (dragging) {
        orbit.yaw.value += dx;
        orbit.pitch.value = clamp(orbit.pitch.value + dy, -1.25, 1.25);
        const blend = 1 - Math.exp(-seconds * 18);
        orbit.yaw.velocity +=
          (clamp(dx / seconds, -2.1, 2.1) - orbit.yaw.velocity) * blend;
        orbit.pitch.velocity +=
          (clamp(dy / seconds, -1.7, 1.7) - orbit.pitch.velocity) * blend;
        if (motionOff()) snapLayout = true;
        canvas.style.cursor = "grabbing";
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.time = event.timeStamp;
    } else {
      hover = hit(hoverX, hoverY);
      labelClock = 1;
    }
    requestDraw();
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!dragging) {
      const picked = hit(event.clientX, event.clientY);
      if (picked) selectPerson(picked.person.id);
    } else {
      const idle = Math.max(0, (event.timeStamp - pointer.time) / 1000);
      orbit.yaw.velocity *= Math.exp(-idle * 18);
      orbit.pitch.velocity *= Math.exp(-idle * 18);
    }
    if (motionOff()) orbit.yaw.velocity = orbit.pitch.velocity = 0;
    finishPointer();
    requestDraw();
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    orbit.yaw.velocity = orbit.pitch.velocity = 0;
    finishPointer();
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    orbit.yaw.velocity = orbit.pitch.velocity = 0;
    finishPointer();
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
    hoverX = hoverY = -1000;
    labelClock = 1;
    requestDraw();
  });
  function setZoom(value) {
    zoomTarget = clamp(value, 0.6, 1.65);
    $("zoom-out").disabled = zoomTarget <= 0.6;
    $("zoom-in").disabled = zoomTarget >= 1.65;
    if (motionOff()) snapLayout = true;
    requestDraw();
  }
  canvas.addEventListener(
    "wheel",
    (event) => {
      // Preserve browser magnification (including trackpad pinch).
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      setZoom(zoomTarget * Math.exp(-clamp(delta, -120, 120) * 0.0009));
    },
    { passive: false }
  );
  function announceKeyboardTarget() {
    clearTimeout(keyboardAnnouncementTimer);
    keyboardAnnouncementTimer = setTimeout(() => {
      if (document.activeElement === canvas)
        announce($("keyboard-target").textContent);
    }, 350);
  }
  canvas.addEventListener("focus", () => {
    $("keyboard-target").hidden = false;
    orbit.yaw.velocity = orbit.pitch.velocity = 0;
    cacheUiBounds();
    labelClock = 1;
    requestDraw();
    announceKeyboardTarget();
  });
  canvas.addEventListener("blur", () => {
    $("keyboard-target").hidden = true;
    clearTimeout(keyboardAnnouncementTimer);
    cacheUiBounds();
    labelClock = 1;
    requestDraw();
  });
  canvas.addEventListener("keydown", (event) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Enter",
        "+",
        "-",
        "=",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "ArrowLeft") orbit.yaw.value -= 0.15;
    if (event.key === "ArrowRight") orbit.yaw.value += 0.15;
    if (event.key === "ArrowUp") orbit.pitch.value -= 0.15;
    if (event.key === "ArrowDown") orbit.pitch.value += 0.15;
    orbit.pitch.value = clamp(orbit.pitch.value, -1.25, 1.25);
    if (event.key === "+" || event.key === "=") setZoom(zoomTarget + 0.1);
    if (event.key === "-") setZoom(zoomTarget - 0.1);
    if (event.key === "Enter") {
      // Open the candidate from the last rendered frame, exactly as indicated.
      if (keyboardPoint?.pickable)
        selectPerson(keyboardPoint.person.id, { focusHeading: true });
    } else announceKeyboardTarget();
    if (motionOff()) snapLayout = true;
    requestDraw();
  });
  search.addEventListener("input", () => {
    filterPeople();
    writeUrl(true);
  });
  search.addEventListener("focus", () => {
    if (data) renderResults();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      results.querySelector("button")?.focus();
    }
    if (event.key === "Enter" && filtered.length) {
      event.preventDefault();
      openSearchResult(filtered[0].id);
    }
  });
  results.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...results.querySelectorAll("button")],
      index = buttons.indexOf(document.activeElement);
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (next < 0) search.focus();
    else buttons[Math.min(next, buttons.length - 1)]?.focus();
  });
  category.addEventListener("change", () => {
    filterPeople();
    writeUrl();
    hideResults();
    announce(
      `${filtered.length} people in ${category.value ? categoryName(category.value) : "all fields"}.`
    );
  });
  $("profile-close").addEventListener("click", () => {
    selectPerson(null);
    canvas.focus({ preventScroll: true });
  });
  $("previous").addEventListener("click", () => nextPerson(-1));
  $("next").addEventListener("click", () => nextPerson(1));
  $("pause").addEventListener("click", () => {
    if (reduced.matches) {
      announce(
        "Animation remains paused because reduced motion is enabled in your system settings."
      );
      return;
    }
    paused = !paused;
    setMotion();
  });
  $("zoom-in").addEventListener("click", () => setZoom(zoomTarget + 0.15));
  $("zoom-out").addEventListener("click", () => setZoom(zoomTarget - 0.15));
  $("reset").addEventListener("click", () => {
    search.value = "";
    category.value = "";
    snapSpring(orbit.yaw, 0.3);
    snapSpring(orbit.pitch, -0.12);
    setZoom(1);
    filterPeople();
    selectPerson(null);
    announce("View reset. All 500 people.");
  });
  $("about-open").addEventListener("click", () => $("about").showModal());
  $("about-close").addEventListener("click", () => $("about").close());
  $("about").addEventListener("click", (event) => {
    if (event.target === $("about")) {
      const box = $("about").getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        $("about").close();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".discovery")) hideResults();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName
      ) &&
      !$("about").open
    ) {
      event.preventDefault();
      search.focus();
    }
    if (event.key === "Escape" && !$("about").open) {
      hideResults();
      if (selected) {
        selectPerson(null);
        canvas.focus({ preventScroll: true });
      }
    }
  });
  scene
    .querySelector(".view-controls")
    .addEventListener("transitionend", (event) => {
      if (event.propertyName !== "right") return;
      cacheUiBounds();
      requestDraw();
    });
  addEventListener("resize", resize);
  addEventListener("popstate", restoreUrl);
  reduced.addEventListener("change", setMotion);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTime = 0;
      orbit.yaw.velocity = orbit.pitch.velocity = 0;
      finishPointer();
    } else {
      lastTime = 0;
      requestDraw();
    }
  });
  async function start() {
    try {
      if (!ctx) throw new Error("Canvas is unavailable");
      const response = await fetch("/api/explorer");
      if (!response.ok) throw new Error("Catalog could not be loaded");
      data = await response.json();
      people = data.people.map((person) => ({
        ...person,
        searchText: norm(
          [
            person.name,
            person.role.title,
            person.role.organization,
            ...person.tags,
          ].join(" ")
        ),
      }));
      byId = new Map(people.map((person) => [person.id, person]));
      points = people.map((person) => {
        const latitude = seed(person.id, 5) * 2 - 1;
        const radial = Math.cbrt(0.035 + seed(person.id, 11) * 0.965);
        const angle = seed(person.id, 17) * Math.PI * 2;
        const ring = Math.sqrt(1 - latitude * latitude) * radial;
        const point = {
          person,
          x: Math.cos(angle) * ring,
          y: latitude * radial,
          z0: Math.sin(angle) * ring,
          z: 0,
          px: 0,
          py: 0,
          sx: spring(),
          sy: spring(),
          size: spring(3),
          alpha: spring(0),
          labelAlpha: spring(0),
          visible: true,
          neighbor: false,
          neighborIndex: -1,
          neighborDepth: 0,
          angle: 0,
          distance: 1,
          label: person.name.toUpperCase(),
          textWidths: [0, 0, 0, 0],
          labelTarget: 0,
          labelDepthVisible: false,
          baseSize: 2.5 + seed(person.id, 73) * 0.7,
          flowPhase: seed(person.id, 83),
          labelRank: seed(person.id, 59),
          prominence: 0,
          labelBox: [0, 0, 0, 0],
          initialized: false,
          labelVisible: false,
        };
        pointById.set(person.id, point);
        return point;
      });
      projected = points.slice();
      for (const field of data.edition.categories) {
        const option = node("option", "", field.title);
        option.value = field.id;
        category.append(option);
      }
      $("edition-note").textContent =
        `Edition ${data.edition.editionDate} · Human review ${data.edition.humanReview}`;
      $("loading").hidden = true;
      restoreUrl();
      setMotion();
      resize();
    } catch {
      $("loading").replaceChildren(
        node("span", "", "The explorer could not load. ")
      );
      const fallback = node("a", "", "Browse the complete directory →");
      fallback.href = "/directory";
      $("loading").append(fallback);
      canvas.hidden = true;
    }
  }
  start();
})();
