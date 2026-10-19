// Use the same existing Playwright installation as explorer.browser-checks.mjs.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const base = process.env.AI500_PREVIEW_URL || "http://127.0.0.1:4174";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const { chromium } = await import(
  process.env.AI500_PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.AI500_PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const output = resolve(".playwright-mcp/portraits");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  chromiumSandbox: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = async (name, run) => {
  await run();
  checks.push(name);
  console.log(`PASS ${name}`);
};
const open = async () => {
  await page.goto(base);
  await page.locator("#loading").waitFor({ state: "hidden" });
};
const select = async (name) => {
  await page.locator("#search").fill(name);
  await page.locator("#search").press("Enter");
};
const ready = async (id) =>
  page
    .locator(`#profile-portrait[data-person="${id}"][data-state="ready"]`)
    .waitFor();
let decoded = [];
try {
  await open();
  const data = await (await context.request.get(`${base}/api/explorer`)).json();
  await check("every enabled local portrait decodes", async () => {
    decoded = await page.evaluate(async (portraits) => {
      const results = [];
      let cursor = 0;
      await Promise.all(
        Array.from({ length: 8 }, async () => {
          while (cursor < portraits.length) {
            const [id, portrait] = portraits[cursor++],
              image = new Image();
            image.src = portrait.src;
            try {
              await image.decode();
              results.push({
                id,
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            } catch {
              results.push({ id, error: true });
            }
          }
        })
      );
      return results;
    }, Object.entries(data.portraits));
    assert.ok(decoded.length > 0);
    assert.deepEqual(
      decoded.filter((p) => p.error || p.width < 60 || p.height < 60),
      []
    );
  });
  await check("selected name, photo and source match", async () => {
    await select("Geoffrey Hinton");
    await ready("geoffrey-hinton");
    assert.equal(
      await page.locator("#profile-portrait-image").getAttribute("alt"),
      "Portrait of Geoffrey Hinton"
    );
    assert.equal(
      await page.locator("#profile-portrait-image").getAttribute("src"),
      data.portraits["geoffrey-hinton"].src
    );
    assert.equal(
      await page.locator("#portrait-source").getAttribute("href"),
      data.portraits["geoffrey-hinton"].sourceUrl
    );
    await page.screenshot({ path: `${output}/desktop.png` });
  });
  await check(
    "previous and next keep the portrait bound to the name",
    async () => {
      for (const button of ["#next", "#previous"]) {
        await page.locator(button).click();
        const name = await page.locator("#profile-name").textContent();
        const person = data.people.find((p) => p.name === name);
        assert.ok(person);
        if (data.portraits[person.id]) {
          await ready(person.id);
          assert.equal(
            await page.locator("#profile-portrait-image").getAttribute("alt"),
            `Portrait of ${name}`
          );
        } else
          assert.equal(
            await page.locator("#profile-portrait").getAttribute("data-state"),
            "unavailable"
          );
      }
    }
  );
  await check(
    "late image response cannot overwrite a newer selection",
    async () => {
      await open();
      let release, requested;
      const blocked = new Promise((r) => {
        release = r;
      });
      const seen = new Promise((r) => {
        requested = r;
      });
      const path = data.portraits["yoshua-bengio"].src;
      await page.route(`**${path}`, async (route) => {
        requested();
        await blocked;
        await route.continue().catch(() => {});
      });
      await select("Yoshua Bengio");
      await seen;
      assert.equal(await page.locator("#profile-portrait-image").count(), 0);
      await select("Geoffrey Hinton");
      await ready("geoffrey-hinton");
      release();
      await page.waitForTimeout(200);
      assert.equal(
        await page.locator("#profile-portrait-image").getAttribute("alt"),
        "Portrait of Geoffrey Hinton"
      );
      await page.unrouteAll({ behavior: "wait" });
    }
  );
  await check("failed image recovers to an explicit fallback", async () => {
    await open();
    await page.route(`**${data.portraits["yoshua-bengio"].src}`, (r) =>
      r.abort()
    );
    await select("Yoshua Bengio");
    await page
      .locator(
        '#profile-portrait[data-person="yoshua-bengio"][data-state="unavailable"]'
      )
      .waitFor();
    assert.equal(await page.locator("#profile-portrait-image").count(), 0);
    assert.equal(
      await page.locator("#portrait-status").textContent(),
      "Portrait unavailable"
    );
    await page.unrouteAll({ behavior: "wait" });
  });
  await check("missing image never reuses another person's face", async () => {
    await page.route("**/api/explorer", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      delete body.portraits["yoshua-bengio"];
      await route.fulfill({ response, json: body });
    });
    await open();
    await select("Geoffrey Hinton");
    await ready("geoffrey-hinton");
    await select("Yoshua Bengio");
    assert.equal(
      await page.locator("#profile-portrait").getAttribute("data-state"),
      "unavailable"
    );
    assert.equal(await page.locator("#profile-portrait-image").count(), 0);
    await page.unrouteAll({ behavior: "wait" });
  });
  await check(
    "mobile and landscape keep the portrait and name within the panel",
    async () => {
      for (const [width, height] of [
        [390, 844],
        [700, 440],
      ]) {
        await page.setViewportSize({ width, height });
        await open();
        await select("Geoffrey Hinton");
        await ready("geoffrey-hinton");
        const bounds = await page
          .locator("#profile-portrait-image")
          .boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
        assert.ok(bounds.width >= 90 && bounds.height === bounds.width);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        );
        await page.screenshot({ path: `${output}/profile-${width}.png` });
      }
    }
  );
  await check("portrait routes expose only manifest assets", async () => {
    for (const path of [
      "/portraits/not-a-person.jpg",
      "/assets/portraits/geoffrey-hinton.jpg",
      "/data/portraits.json",
      "/research/portrait-audit/downloaded.json",
      "/AGENTS.md",
    ]) {
      assert.equal(
        (await context.request.get(base + path)).status(),
        404,
        path
      );
    }
    const response = await context.request.get(base);
    assert.ok(
      response.headers()["content-security-policy"].includes("img-src 'self'")
    );
  });
  await check(
    "individual crop framing stays inside the panel and resets on selection",
    async () => {
      for (const [width, height] of [
        [1440, 900],
        [390, 844],
        [700, 440],
      ]) {
        await page.setViewportSize({ width, height });
        await open();
        for (const [id, name] of data.people
          .filter((p) => data.portraits[p.id])
          .sort((a, b) => b.name.length - a.name.length)
          .slice(0, 4)
          .map((p) => [p.id, p.name])) {
          await select(name);
          await ready(id);
          const panel = await page.locator("#profile-panel").boundingBox();
          for (const selector of [".portrait-frame", "#profile-name"]) {
            const bounds = await page.locator(selector).boundingBox();
            assert.ok(
              bounds.x >= panel.x &&
                bounds.x + bounds.width <= panel.x + panel.width,
              `${id}: ${selector} outside panel at ${width}px`
            );
          }
          assert.equal(
            await page
              .locator(".portrait-frame")
              .evaluate((el) => getComputedStyle(el).overflow),
            "hidden"
          );
          const scale = data.portraits[id].objectScale;
          assert.equal(
            await page
              .locator("#profile-portrait-image")
              .evaluate((el) => el.style.transform),
            scale ? `scale(${scale})` : ""
          );
        }
      }
    }
  );
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      { checks, decodedCount: decoded.length, decoded, errors },
      null,
      2
    ) + "\n"
  );
} finally {
  await browser.close();
}
