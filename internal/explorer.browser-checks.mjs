// Run against a fresh local preview with an existing Playwright installation.
// AI500_PLAYWRIGHT_MODULE can point to its index.mjs; no production dependency needed.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const base = process.env.AI500_PREVIEW_URL || "http://127.0.0.1:4174";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Local preview only"
);
const modulePath = process.env.AI500_PLAYWRIGHT_MODULE;
const { chromium } = await import(
  modulePath ? pathToFileURL(resolve(modulePath)).href : "playwright"
);
const output = resolve(".playwright-mcp/motion-implementation");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  chromiumSandbox: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const checks = [];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(10000);
const diagnostic = () =>
  page.locator("#motion-diagnostics").textContent().then(JSON.parse);
const open = async (query = "", motion = "no-preference") => {
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto(`${base}/?debug=motion${query}`);
  await page.locator("#loading").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.querySelector("#motion-diagnostics")?.textContent
  );
};
const select = async (name) => {
  await page.locator("#search").fill(name);
  await page.locator("#search").press("Enter");
  await page.locator("#profile-panel[aria-hidden=false]").waitFor();
};
const settled = async () => {
  // Let an input's scheduled draw replace the previous diagnostic sample.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );
  await page.waitForFunction(() => {
    const value = JSON.parse(
      document.querySelector("#motion-diagnostics").textContent || "{}"
    );
    return (
      value.state === "paused" &&
      value.cameraFocus === value.targetFocus &&
      value.maxPositionError === 0 &&
      value.edges.every((alpha) => alpha === 1)
    );
  });
};
const check = async (name, run) => {
  await run();
  checks.push(name);
  console.log(`PASS ${name}`);
};
const capture = (name) => page.screenshot({ path: `${output}/${name}.png` });

try {
  await check("overview text remains opaque and readable", async () => {
    await open();
    const values = await page.evaluate(async () => {
      const { contrast } = await import("/motion-math.mjs");
      const rgb = (color) =>
        color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
      const background = rgb(
        getComputedStyle(document.querySelector("#explorer")).backgroundColor
      );
      return [
        ".scene-caption",
        "#graph-note",
        ".edition-note",
        "#edition-note",
        "#result-count",
      ].map((selector) => {
        const element = document.querySelector(selector);
        let opacity = 1;
        for (let current = element; current; current = current.parentElement)
          opacity *= Number(getComputedStyle(current).opacity);
        return {
          selector,
          opacity,
          contrast: contrast(background, rgb(getComputedStyle(element).color)),
        };
      });
    });
    for (const value of values) {
      assert.equal(value.opacity, 1, value.selector);
      assert.ok(value.contrast >= 4.5, value.selector);
    }
    await capture("01-overview");
  });

  await check(
    "manual pause completes a selection and stays visually still",
    async () => {
      await select("Fei-Fei");
      await page.locator("#pause").click();
      await settled();
      assert.equal((await diagnostic()).selected, "fei-fei-li");
      const first = await page
        .locator("canvas")
        .evaluate((canvas) => canvas.toDataURL());
      await page.waitForTimeout(150);
      const second = await page
        .locator("canvas")
        .evaluate((canvas) => canvas.toDataURL());
      assert.equal(first, second, "paused canvas must be stable");
      assert.equal(
        await page.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length
        ),
        0
      );
      await capture("02-profile-desktop");
    }
  );

  await check(
    "system reduced motion completes an in-flight selection",
    async () => {
      await open();
      await select("Aapo");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await settled();
      assert.equal((await diagnostic()).selected, "aapo-hyvarinen");
      assert.equal(
        await page.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length
        ),
        0
      );
      assert.match(
        await page.locator("#pause").getAttribute("aria-label"),
        /system reduced motion/
      );
    }
  );

  await check("system preference does not create a manual pause", async () => {
    await open("", "reduce");
    await settled();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(
      () => !document.querySelector("#explorer").classList.contains("no-motion")
    );
    await page.locator("#pause").click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await settled();
    assert.equal(
      await page.locator("#pause").getAttribute("aria-label"),
      "Resume animation"
    );
  });

  await check(
    "claim references preserve source IDs, focus and return position",
    async () => {
      await select("Aapo");
      await settled();
      const contribution = page.getByRole("group", {
        name: "Sources for contribution",
        exact: true,
      });
      const buttons = contribution.getByRole("button");
      assert.equal(await buttons.count(), 2);
      assert.deepEqual(
        await buttons.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-controls"))
        ),
        ["source-aapo-hyvarinen-s2", "source-aapo-hyvarinen-s3"]
      );
      assert.equal(
        await page
          .locator("#role-citations button")
          .getAttribute("aria-controls"),
        "source-aapo-hyvarinen-s1"
      );
      await buttons.first().click();
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "source-aapo-hyvarinen-s2"
      );
      assert.ok(
        await page
          .locator("#source-aapo-hyvarinen-s2 .source-note")
          .textContent()
      );
      await capture("03-claim-evidence");
      await page.locator("#source-aapo-hyvarinen-s2 .source-return").click();
      assert.equal(
        await page.evaluate(() =>
          document.activeElement.getAttribute("aria-controls")
        ),
        "source-aapo-hyvarinen-s2"
      );
      assert.match(
        await page.locator("#role-date").textContent(),
        /not established/
      );
    }
  );

  await check(
    "system reduced motion completes native source and return scrolling",
    async () => {
      await page.setViewportSize({ width: 1440, height: 700 });
      await open("&person=aapo-hyvarinen");
      await page.waitForFunction(
        () =>
          !document
            .getAnimations()
            .some((animation) => animation.playState === "running")
      );
      for (const direction of ["source", "claim"]) {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        const trip = await page.evaluate((direction) => {
          const scroller = document.querySelector(".panel-scroll");
          const start = scroller.scrollTop;
          let target;
          if (direction === "source") {
            const citation = document.querySelector(
              '[role="group"][aria-label="Sources for contribution"] button'
            );
            target = document.getElementById(
              citation.getAttribute("aria-controls")
            );
            citation.click();
          } else {
            document.querySelector(".source-focus .source-return").click();
            target = document.activeElement;
          }
          const targetBox = target.getBoundingClientRect();
          const scrollerBox = scroller.getBoundingClientRect();
          const targetStyle = getComputedStyle(target);
          const scrollerStyle = getComputedStyle(scroller);
          const pixels = (value) => parseFloat(value) || 0;
          const marginTop = pixels(targetStyle.scrollMarginTop);
          const marginBottom = pixels(targetStyle.scrollMarginBottom);
          const paddingTop = pixels(scrollerStyle.scrollPaddingTop);
          const paddingBottom = pixels(scrollerStyle.scrollPaddingBottom);
          const innerTop = scrollerBox.top + scroller.clientTop;
          const intended =
            direction === "source"
              ? scroller.scrollTop +
                targetBox.top -
                marginTop -
                innerTop -
                paddingTop
              : scroller.scrollTop +
                (targetBox.top + targetBox.bottom + marginBottom - marginTop) /
                  2 -
                innerTop -
                paddingTop -
                (scroller.clientHeight - paddingTop - paddingBottom) / 2;
          return {
            start,
            destination: Math.max(
              0,
              Math.min(intended, scroller.scrollHeight - scroller.clientHeight)
            ),
          };
        }, direction);
        assert.ok(
          Math.abs(trip.destination - trip.start) > 80,
          `${direction} needs a real scrolling journey`
        );
        await page.waitForFunction(({ start, destination }) => {
          const current = document.querySelector(".panel-scroll").scrollTop;
          const progress = (current - start) / (destination - start);
          return progress > 0.01 && progress < 0.65;
        }, trip);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await settled();
        const stopped = await page
          .locator(".panel-scroll")
          .evaluate((element) => element.scrollTop);
        assert.ok(
          Math.abs(stopped - trip.destination) <= 2,
          `${direction} stopped at ${stopped}, expected ${trip.destination}`
        );
        await page.waitForTimeout(180);
        const later = await page
          .locator(".panel-scroll")
          .evaluate((element) => element.scrollTop);
        assert.ok(
          Math.abs(later - stopped) <= 1,
          `${direction} must stay still after reduced motion takes effect`
        );
      }
    }
  );

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 700, height: 390 },
    { width: 600, height: 390 },
  ]) {
    await check(
      `keyboard target matches Enter at ${viewport.width}px, with and without profile`,
      async () => {
        await page.setViewportSize(viewport);
        await open("", "reduce");
        await settled();
        for (const selected of [false, true]) {
          if (selected) await select("Fei-Fei");
          await page.locator("canvas").focus();
          await page.locator("canvas").press("ArrowRight");
          await settled();
          const candidate = await page
            .locator("canvas")
            .getAttribute("data-keyboard-person");
          assert.ok(candidate);
          assert.equal(
            await page.locator("#keyboard-target").isVisible(),
            true
          );
          const target = (await diagnostic()).keyboardPosition;
          const caption = await page.locator(".scene-caption").boundingBox();
          assert.ok(
            target.x + target.radius < caption.x ||
              target.x - target.radius > caption.x + caption.width ||
              target.y + target.radius < caption.y ||
              target.y - target.radius > caption.y + caption.height,
            "keyboard reticle must remain clear of the caption"
          );
          if (viewport.height === 390 && selected) {
            const panelBox = await page.locator("#profile-panel").boundingBox();
            for (const selector of [".discovery", ".view-controls"]) {
              const box = await page.locator(selector).boundingBox();
              assert.ok(
                box.x >= 0 && box.x + box.width <= panelBox.x,
                `${selector} remains beside the profile`
              );
            }
          }
          if (viewport.height === 390)
            await capture(
              `compact-${viewport.width}-keyboard-${selected ? "selected" : "overview"}`
            );
          await page.locator("canvas").press("Enter");
          await settled();
          assert.equal(
            new URL(page.url()).searchParams.get("person"),
            candidate
          );
          assert.equal(
            await page.evaluate(() => document.activeElement.id),
            "profile-name"
          );
        }
        if (viewport.width === 390) await capture("04-profile-mobile");
      }
    );
  }

  await check(
    "paused selection, zoom, resize, reset and history reach complete states",
    async () => {
      const firstPerson = (await diagnostic()).selected;
      await page.locator("#zoom-in").click();
      await settled();
      assert.equal((await diagnostic()).zoom, 1.15);
      await page.setViewportSize({ width: 820, height: 600 });
      await settled();
      await page.locator("#next").click();
      await settled();
      const secondPerson = (await diagnostic()).selected;
      assert.notEqual(secondPerson, firstPerson);
      await page.goBack();
      await settled();
      assert.equal((await diagnostic()).selected, firstPerson);
      await page.locator("#reset").click();
      await settled();
      assert.equal((await diagnostic()).cameraFocus, 0);
      assert.equal((await diagnostic()).zoom, 1);
      assert.equal(
        await page.locator("#result-count").textContent(),
        "500 people"
      );
    }
  );

  await check("empty results clear the keyboard candidate", async () => {
    await page.locator("#search").fill("no-such-person-zzzzzz");
    await page.waitForFunction(
      () => document.querySelector("canvas").dataset.keyboardPerson === ""
    );
    await page.locator("canvas").focus();
    await page.locator("canvas").press("Enter");
    assert.equal(
      await page.locator("#profile-panel").getAttribute("aria-hidden"),
      "true"
    );
    assert.match(
      await page.locator("#keyboard-target").textContent(),
      /No visible people/
    );
  });

  await check(
    "an initial empty-result URL describes the keyboard state without a candidate",
    async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open("&q=no-such-person-zzzzzz", "reduce");
      await settled();
      await page.locator("canvas").focus();
      await page.waitForFunction(() =>
        document
          .querySelector("#keyboard-target")
          .textContent.includes("No visible people")
      );
      assert.equal(
        await page.locator("#result-count").textContent(),
        "0 people"
      );
      assert.equal(
        await page.locator("canvas").getAttribute("data-keyboard-person"),
        ""
      );
      assert.equal((await diagnostic()).keyboardCandidate, null);
      assert.equal(await page.locator("#keyboard-target").isVisible(), true);
      await page.locator("canvas").press("Enter");
      assert.equal(
        await page.locator("#profile-panel").getAttribute("aria-hidden"),
        "true"
      );
      assert.equal(new URL(page.url()).searchParams.get("person"), null);
    }
  );

  await check(
    "a focused Canvas announces target changes after its initial announcement",
    async () => {
      await open("", "reduce");
      await settled();
      await page.locator("canvas").focus();
      // The change must happen after the original focus-triggered announcement timer.
      await page.waitForTimeout(400);
      const initial = await page
        .locator("canvas")
        .getAttribute("data-keyboard-person");
      assert.ok(initial);
      assert.equal(
        await page.locator("#announcement").textContent(),
        await page.locator("#keyboard-target").textContent()
      );
      for (const query of ["no-such-person-zzzzzz", ""]) {
        await page.evaluate((query) => {
          const search = document.querySelector("#search");
          search.value = query;
          search.dispatchEvent(new Event("input", { bubbles: true }));
        }, query);
        await page.waitForFunction((empty) => {
          const canvas = document.querySelector("canvas");
          const target = document.querySelector("#keyboard-target").textContent;
          const announcement =
            document.querySelector("#announcement").textContent;
          return (
            document.activeElement === canvas &&
            (empty
              ? canvas.dataset.keyboardPerson === "" &&
                target.includes("No visible people")
              : Boolean(canvas.dataset.keyboardPerson) &&
                target.startsWith("Enter to open ")) &&
            announcement === target
          );
        }, Boolean(query));
        assert.equal(
          await page.evaluate(() => document.activeElement.id),
          "universe"
        );
      }
      assert.equal(
        await page.locator("canvas").getAttribute("data-keyboard-person"),
        initial
      );
    }
  );

  await check("mobile citations and disclaimers stay reachable", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open("&person=fei-fei-li", "reduce");
    await settled();
    await page
      .getByRole("group", { name: "Sources for contribution", exact: true })
      .getByRole("button")
      .first()
      .click();
    assert.match(
      await page.evaluate(() => document.activeElement.id),
      /^source-fei-fei-li-/
    );
    const bounds = await page.evaluate(() => {
      const note = document
        .querySelector(".scene-caption")
        .getBoundingClientRect();
      const panel = document
        .querySelector("#profile-panel")
        .getBoundingClientRect();
      const source = document.activeElement.getBoundingClientRect();
      return {
        noteBottom: note.bottom,
        panelTop: panel.top,
        sourceTop: source.top,
        sourceBottom: source.bottom,
        viewport: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.ok(bounds.noteBottom <= bounds.panelTop);
    assert.ok(
      bounds.sourceTop >= bounds.panelTop && bounds.sourceTop < bounds.viewport
    );
    assert.equal(bounds.overflow, false);
    await capture("05-mobile-evidence");
  });

  await check("short landscape retains profile actions", async () => {
    await page.setViewportSize({ width: 844, height: 390 });
    await settled();
    for (const id of ["profile-close", "previous", "next", "full-profile"]) {
      const box = await page.locator(`#${id}`).boundingBox();
      assert.ok(
        box && box.x >= 0 && box.y >= 0 && box.y + box.height <= 390,
        id
      );
    }
    await capture("06-landscape");
  });

  await check(
    "rapid selection cancels stale content and animations",
    async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open("&person=fei-fei-li");
      for (let i = 0; i < 5; i++) await page.locator("#next").click();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await settled();
      const current = new URL(page.url()).searchParams.get("person");
      const ids = await page
        .locator(".source-item")
        .evaluateAll((nodes) => nodes.map((node) => node.id));
      assert.ok(ids.every((id) => id.startsWith(`source-${current}-`)));
      assert.equal(new Set(ids).size, ids.length);
      assert.equal(
        await page.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length
        ),
        0
      );
    }
  );

  await check("no-JavaScript directory remains available", async () => {
    const staticContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    try {
      const staticPage = await staticContext.newPage();
      await staticPage.goto(`${base}/directory?q=Fei-Fei`);
      assert.equal(await staticPage.locator(".card").count(), 1);
      await staticPage.locator('a[href="/people/fei-fei-li"]').first().click();
      assert.equal(await staticPage.locator("h1").textContent(), "Fei-Fei Li");
    } finally {
      await staticContext.close();
    }
  });

  assert.deepEqual(errors, [], "browser runtime errors");
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        status: "PASS",
        checks,
        errors,
        browser: await browser.version(),
        preview: base,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`PASS ${checks.length} browser checks; artifacts: ${output}`);
} catch (error) {
  await capture("failure");
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(
      {
        status: "FAIL",
        checks,
        errors,
        failure: String(error),
        diagnostic: await diagnostic().catch(() => null),
        media: await page
          .evaluate(() => ({
            reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
            pause: document.querySelector("#pause")?.getAttribute("aria-label"),
          }))
          .catch(() => null),
      },
      null,
      2
    ) + "\n"
  );
  throw error;
} finally {
  await browser.close();
}
