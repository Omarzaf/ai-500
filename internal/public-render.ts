import type { Edition, Person } from "./catalog.ts";

export const directoryStyles = `
  :root{color-scheme:light;--ink:#203b3c;--muted:#647473;--paper:#f7f7f0;--line:#d9dfd8;--teal:#14655b}
  *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,sans-serif}
  a{color:inherit;text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:4px}a:focus-visible,input:focus-visible,select:focus-visible,button:focus-visible{outline:3px solid #b37931;outline-offset:4px}
  .skip{position:absolute;left:18px;top:-70px;background:white;padding:12px;z-index:2}.skip:focus{top:12px}
  .shell{max-width:1280px;margin:0 auto;padding:0 40px}header{border-bottom:1px solid var(--line)}.topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:92px}
  .brand{font-weight:750;font-size:23px;letter-spacing:-1px;display:flex;gap:12px;align-items:center}.mark{display:grid;place-items:center;background:var(--teal);color:white;border-radius:50%;height:37px;width:37px;font:italic 24px Georgia,serif}
  .topbar nav{display:flex;gap:24px;font-size:14px}.edition{font-size:12px;color:var(--muted)}.eyebrow{text-transform:uppercase;letter-spacing:2px;font-size:11px;font-weight:750;color:var(--teal)}
  .hero{padding:64px 0 44px;display:grid;grid-template-columns:1.5fr 1fr;gap:60px;align-items:end}h1{font:normal clamp(43px,6vw,76px)/1.04 Georgia,serif;letter-spacing:-2px;margin:17px 0 24px;max-width:790px}h1 em{color:var(--teal);font-weight:normal}.hero p{color:var(--muted);max-width:550px;font-size:17px;margin-bottom:0}
  .stats{display:flex;gap:35px;padding-bottom:6px}.stat strong{display:block;font:normal 38px Georgia,serif}.stat span{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
  .notice{font-size:12px;color:var(--muted);padding:12px 0;border-top:1px solid var(--line)}.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#aa8138;margin-right:7px;vertical-align:middle}
  .controls{display:grid;grid-template-columns:1fr 290px auto;gap:12px;padding:30px 0 22px}.field label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;color:var(--muted)}
  input,select,button{font:inherit;border:1px solid #b9c8bf;border-radius:4px;min-height:48px;padding:10px 14px;background:#fff;color:var(--ink);width:100%}button{cursor:pointer;background:var(--teal);border-color:var(--teal);color:#fff;padding:10px 25px;align-self:end}
  .results-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 0 20px;font-size:13px;color:var(--muted)}.results-heading p{margin:0}.results-heading a{color:var(--teal);text-decoration:underline}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;padding-bottom:55px}.card{background:#fff;border:1px solid var(--line);border-radius:5px;padding:25px;display:flex;flex-direction:column;min-height:280px;transition:border-color .15s}.card:hover{border-color:var(--teal)}
  .category{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--teal);font-weight:650}.card h2{font:normal 26px/1.15 Georgia,serif;letter-spacing:-.4px;margin:17px 0 10px}.role{font-size:12px;color:var(--muted);line-height:1.6}.card .contribution{font-size:14px;line-height:1.65;margin:17px 0 22px}.card-bottom{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:15px;border-top:1px solid #edf0e9;font-size:11px;color:var(--muted)}.card-bottom a{font-weight:650;color:var(--teal);font-size:12px}
  .empty{padding:55px 0 90px;font-size:19px}.about{border-top:1px solid var(--line);padding:35px 0 45px;display:grid;grid-template-columns:1fr 2fr;gap:50px}.about h2{font:normal 28px Georgia,serif;margin:0}.about p{margin:0;color:var(--muted);font-size:14px;max-width:760px}
  footer{border-top:1px solid var(--line);padding:23px 0;color:var(--muted);font-size:11px}.footer-inner{display:flex;justify-content:space-between;gap:15px}.profile{max-width:890px;margin:auto;padding:35px 0 60px}.back{font-size:13px;color:var(--teal);display:inline-block;margin-bottom:45px}.profile h1{margin-bottom:20px}.profile .role{font-size:18px}.profile .meta{font-size:12px;color:var(--muted);margin-top:15px}.tags{font-size:12px;color:var(--muted);margin:20px 0 35px}.profile-section{border-top:1px solid var(--line);padding:24px 0}.profile-section h2{font:normal 27px Georgia,serif;margin:0 0 14px}.profile-section p{margin:0 0 12px;font-size:17px}.profile-section .small{font-size:13px;color:var(--muted)}
  .citations{font-size:12px;white-space:nowrap}.citations a{color:var(--teal);text-decoration:underline;margin-left:4px}.sources{padding-left:24px}.sources li{padding:0 0 20px 6px;scroll-margin-top:30px}.sources a{font-weight:600;color:var(--teal);overflow-wrap:anywhere}.source-meta{display:block;font-size:12px;color:var(--muted);margin:5px 0}.source-note{font-size:14px}.limitations{padding-left:20px;font-size:14px}
  @media(max-width:950px){.hero{grid-template-columns:1fr;gap:25px;padding-top:42px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.stats{gap:42px}.controls{grid-template-columns:1fr 250px auto}}
  @media(max-width:650px){.shell{padding:0 22px}.topbar{min-height:77px}.edition{display:none}.topbar nav{gap:15px;font-size:12px}.hero{padding:35px 0 25px;gap:25px}h1{letter-spacing:-1.4px}.hero p{font-size:15px}.stats{gap:30px}.stat strong{font-size:30px}.stat span{font-size:9px}.controls{grid-template-columns:1fr 110px;gap:12px}.field:first-child{grid-column:1/-1}.grid{grid-template-columns:1fr;gap:12px}.card{min-height:0;padding:22px}.card h2{font-size:27px}.about{grid-template-columns:1fr;gap:15px}.footer-inner{flex-direction:column;gap:5px}.back{margin-bottom:32px}.profile .role{font-size:16px}.profile-section p{font-size:16px}}
`;

/** Pure HTML rendering shared by the static build and query-only directory function. */
export function createPublicRenderer(edition: Edition, people: Person[]) {
  const sourceCount = people.reduce(
    (count, person) => count + person.sources.length,
    0
  );
  const escape = (value: string): string =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char] ?? char
    );
  const normalize = (value: string): string =>
    value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const categoryTitle = (id: string): string =>
    edition.categories.find((category) => category.id === id)?.title ?? id;
  const review =
    edition.humanReview === "pending"
      ? "Human editorial review pending"
      : "Human editorial review complete";

  function page(title: string, content: string): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · AI 500</title><meta name="description" content="An editorial directory of 500 people shaping artificial intelligence, with contributions and source evidence."><link rel="stylesheet" href="/directory.css"></head><body>
  <a class="skip" href="#main">Skip to content</a><header><div class="shell topbar"><a class="brand" href="/" aria-label="AI 500 home"><span class="mark" aria-hidden="true">a</span>AI 500</a><nav aria-label="Main navigation"><a href="/">Explore</a><a href="/directory">Directory</a><a href="/directory#about">About</a></nav><span class="edition">Edition ${escape(edition.editionDate)}</span></div></header>
  <main class="shell" id="main">${content}</main><footer><div class="shell footer-inner"><span>AI 500 · People shaping artificial intelligence · <a href="/photo-credits">Photo credits</a></span><span>Alphabetical, not ranked · ${escape(review)}</span></div></footer></body></html>`;
  }

  function directory(url: URL): string {
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
    const category = (url.searchParams.get("category") ?? "").slice(0, 100);
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const filtered = people.filter(
      (person) =>
        (!category || person.category === category) &&
        terms.every((term) =>
          normalize(
            [
              person.name,
              person.role.title,
              person.role.organization,
              person.contribution,
              ...person.tags,
            ].join(" ")
          ).includes(term)
        )
    );
    return page(
      "Directory",
      `
    <section class="hero" aria-labelledby="title"><div><div class="eyebrow">An editorial directory of artificial intelligence</div><h1 id="title">The people<br>shaping <em>AI.</em></h1><p>Explore the researchers, builders, and public voices influencing where artificial intelligence goes next.</p></div><div class="stats" aria-label="Directory statistics"><div class="stat"><strong>${people.length}</strong><span>People</span></div><div class="stat"><strong>${edition.categories.length}</strong><span>Fields</span></div><div class="stat"><strong>${sourceCount.toLocaleString("en")}</strong><span>Source records</span></div></div></section>
    <div class="notice"><span class="dot" aria-hidden="true"></span>${escape(review)} · A curated selection, organized alphabetically.</div>
    <form class="controls" method="get" action="/directory" role="search"><div class="field"><label for="search">Find a person</label><input id="search" name="q" type="search" value="${escape(query)}" placeholder="Search names, organizations, or areas of work" maxlength="200"></div><div class="field"><label for="category">Explore a field</label><select id="category" name="category"><option value="">All fields</option>${edition.categories.map((item) => `<option value="${escape(item.id)}"${category === item.id ? " selected" : ""}>${escape(item.title)}</option>`).join("")}</select></div><button type="submit">Explore</button></form>
    <div class="results-heading"><p>${filtered.length} ${filtered.length === 1 ? "person" : "people"}${query ? ` matching “${escape(query)}”` : ""}${category ? ` · ${escape(categoryTitle(category))}` : ""}</p>${query || category ? '<a href="/directory">Clear filters</a>' : "<span>A–Z</span>"}</div>
    ${filtered.length ? `<section class="grid" aria-label="People">${filtered.map((person) => `<article class="card"><div class="category">${escape(categoryTitle(person.category))}</div><h2><a href="/people/${person.id}">${escape(person.name)}</a></h2><div class="role">${escape(person.role.title)}<br>${escape(person.role.organization)}</div><p class="contribution">${escape(person.contribution)}</p><div class="card-bottom"><span>${person.sources.length} sources</span><a href="/people/${person.id}" aria-label="Read profile: ${escape(person.name)}">Read profile ↗</a></div></article>`).join("")}</section>` : '<p class="empty">No people match these filters. Try another name or field.</p>'}
    <section class="about" id="about"><h2>A map of influence,<br>with the evidence attached.</h2><p>This directory brings together contributions across research, industry, infrastructure, open tools, safety, governance, society, and applications. Inclusion is an editorial assessment, not a numerical ranking or endorsement. Each profile explains the contribution and selection rationale, links its evidence, and records source dates and limitations. AI-assisted source review is complete; human editorial review is pending.</p></section>`
    );
  }

  function profile(person: Person): string {
    const citations = (ids: string[]): string =>
      `<span class="citations">${ids.map((id) => `<a href="#source-${escape(id)}" aria-label="Source ${person.sources.findIndex((source) => source.id === id) + 1}">[${person.sources.findIndex((source) => source.id === id) + 1}]</a>`).join("")}</span>`;
    return page(
      person.name,
      `<article class="profile"><a class="back" href="/directory">← All people</a><div class="eyebrow">${escape(categoryTitle(person.category))}</div><h1>${escape(person.name)}</h1><div class="role">${escape(person.role.title)}<br>${escape(person.role.organization)} ${citations(person.role.sourceIds)}</div><p class="meta">${person.role.asOf ? `Role evidence dated ${escape(person.role.asOf)}.` : "Role date not established."} Sources checked ${escape(person.checkedOn)}. A check date does not establish when a source was last updated.</p><div class="tags">${person.tags.map(escape).join(" · ")}</div>
    <section class="profile-section"><h2>Contribution</h2><p>${escape(person.contribution)} ${citations(person.claimSources.contribution)}</p></section>
    <section class="profile-section"><h2>Why included</h2><p>${escape(person.influence)} ${citations(person.claimSources.influence)}</p><p class="small">An editorial assessment, not a rank, endorsement, or quantitative measure of influence.</p></section>
    ${person.uncertainties?.length ? `<section class="profile-section"><h2>Evidence limitations</h2><ul class="limitations">${person.uncertainties.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></section>` : ""}
    <section class="profile-section"><h2>Sources & evidence</h2><ol class="sources">${person.sources.map((source) => `<li id="source-${escape(source.id)}"><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a><span class="source-meta">${escape(source.publisher)} · ${source.kind} source · ${source.publishedOn ? `Published ${escape(source.publishedOn)}` : "Publication date not established"} · Checked ${escape(source.checkedOn)}</span><div class="source-note">${escape(source.note)}</div></li>`).join("")}</ol><p class="small">${person.reviewStatus === "human-reviewed" ? "Human reviewed." : "AI-assisted source review; human editorial review pending."}</p></section></article>`
    );
  }

  return { directory, profile, page };
}
