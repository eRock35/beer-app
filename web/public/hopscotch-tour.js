// The self-running demo the landing page frames: plan a crawl. Type a city,
// pick the evenings, find the breweries, swap one of the picks, build the
// route, read it, start over. It never saves (that needs an account) and it
// never asks the sommelier (that is the one thing here that costs money).
// See tour.js for the rules every tour keeps.
(function () {
  "use strict";
  if (!window.Tour || !Tour.active()) return;
  var T = window.Tour;
  var CITY = "Asheville, NC";

  // Buttons by their label, never by a fragment: the tab bar has a "Find"
  // tab, and matching /find/ once sent the tour to the map instead of the
  // form's "Find breweries". Tabs are excluded outright.
  function byText(re, root) {
    return Array.prototype.find.call((root || document).querySelectorAll("button"), function (b) {
      if (b.closest("nav, [role=tablist], .tabbar")) return false;
      return re.test((b.textContent || "").trim()) && !b.disabled && b.offsetParent !== null;
    });
  }
  function $(id) { return document.getElementById(id); }

  T.run([
    async function openThePlanner() {
      if (location.hash !== "#trips") { location.hash = "#trips"; }
      // Either the planner is already open, or there is a button that opens it.
      await T.until(function () { return $("trip-city") || byText(/^plan (a trip|your first)$/i); }, 20000);
      if (!$("trip-city")) { await T.tap(byText(/^plan (a trip|your first)$/i)); await T.until(function () { return $("trip-city"); }, 8000); }
      await T.scrollTo(window, 0, 400);
      await T.wait(700);
    },
    async function sayWhere() {
      var city = $("trip-city");
      await T.tap(city, { silent: true });
      await T.type(city, CITY, 20);
      await T.wait(500);
      var nights = $("trip-nights");
      if (nights) { await T.tap(nights, { silent: true }); T.setValue(nights, "2"); nights.dispatchEvent(new Event("input", { bubbles: true })); await T.wait(500); }
      var vibe = $("trip-vibe");
      if (vibe) { await T.tap(vibe, { silent: true }); await T.type(vibe, "Sours and something barrel-aged", 22); await T.wait(600); }
      var find = byText(/^find breweries$/i);
      await T.tap(find);
    },
    async function pickTheStops() {
      var rows = await T.until(function () { var r = document.querySelectorAll(".list-row"); return r.length ? r : null; }, 25000);
      await T.wait(1200);
      // Swap one pick, so it reads as choosing rather than accepting.
      var boxes = document.querySelectorAll('.list-row input[type="checkbox"]');
      if (boxes.length > 5) {
        await T.scrollTo(window, Math.max(0, boxes[4].getBoundingClientRect().top + window.scrollY - 260), 700);
        await T.tap(boxes[4]); await T.wait(700);
        await T.tap(boxes[5]); await T.wait(900);
      }
      var build = byText(/into a crawl$/i);
      await T.scrollTo(window, Math.max(0, build.getBoundingClientRect().top + window.scrollY - 400), 600);
      await T.tap(build);
    },
    async function readTheRoute() {
      await T.until(function () { return document.querySelector("ol li"); }, 20000);
      await T.scrollTo(window, 0, 400);
      await T.wait(1800);
      await T.scrollThrough(window, 5000);
      await T.wait(3500);
    },
    async function startOver() {
      // Back to the picks, back to the search - the app's own way out.
      var back = byText(/^back$/i); if (back) { await T.tap(back); await T.wait(700); }
      back = byText(/^back$/i); if (back) { await T.tap(back); await T.wait(700); }
      await T.scrollTo(window, 0, 400);
    },
  ]);
})();
