// Shared test runner for the pages in tests/ (design/2026-11-15_testing_plan.md §4). No dependencies.
// A page loads this file after the engine, registers tests with test() / test.known() / section(), and calls
// runTests() at the end. Results: a table (#results), a summary (#summary) and the tab title
// ("Tests: N/N passed"), window.kilopixelTests, and a JSON copy in <script id="test-results"> for tools/run_tests.js.
// Options in the URL: ?grep=text runs only the tests whose name or section contains the text.
(function() {
  const DEFAULT_TIMEOUT = 5000;
  const registered = [];
  let currentSection = '';

  const register = (name, fn, options, known) => registered.push({
    name, fn, known, section: currentSection, timeout: (options && options.timeout) || DEFAULT_TIMEOUT
  });

  window.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Tests registered after this call belong to the section (a heading row in the table)
  window.section = (name) => { currentSection = name; };

  window.test = (name, fn, options) => register(name, fn, options, false);

  // A documented open bug: shown as "known" while it fails, so it doesn't fail the run. When it starts passing,
  // it fails the run with a note to change it to test(), so a fix can't go unnoticed.
  window.test.known = (name, fn, options) => register(name, fn, options, true);

  // A test that never settles fails after its timeout. It can't be cancelled, so it may still run in the
  // background, but the run goes on.
  function withTimeout(fn, ms) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms);
    });
    return Promise.race([Promise.resolve().then(fn), timeout]).finally(() => clearTimeout(timer));
  }

  function outputElements() {
    let summary = document.getElementById('summary');
    let rows = document.getElementById('results');
    if (!summary || !rows) {
      const host = document.querySelector('main') || document.body;
      summary = document.createElement('p');
      summary.id = 'summary';
      summary.className = 'test-summary';
      const table = document.createElement('table');
      table.className = 'test-table';
      rows = table.createTBody();
      rows.id = 'results';
      host.prepend(summary, table);
    }
    return { summary, rows };
  }

  const SYMBOLS = { passed: '✓', failed: '✗', known: '○', fixed: '!' };

  window.runTests = async function(options = {}) {
    const grep = (new URLSearchParams(location.search).get('grep') || '').toLowerCase();
    const { summary, rows } = outputElements();
    summary.textContent = 'Running…';
    await wait(options.settle ?? 300); // let stages connect and render once

    const selected = grep
      ? registered.filter((t) => t.name.toLowerCase().includes(grep) || t.section.toLowerCase().includes(grep))
      : registered;
    const results = [];
    let lastSection = null;

    for (const t of selected) {
      let error = null;
      const start = performance.now();
      try {
        await withTimeout(t.fn, t.timeout);
      } catch (e) {
        error = e;
      }
      const ms = Math.round(performance.now() - start);
      const status = t.known ? (error ? 'known' : 'fixed') : (error ? 'failed' : 'passed');
      const message = status === 'fixed'
        ? 'passes now: change test.known() to test()'
        : (error ? String(error.message || error) : null);
      results.push({ name: t.name, section: t.section, status, passed: status === 'passed', error: message, ms });

      if (t.section !== lastSection) {
        lastSection = t.section;
        const heading = rows.insertRow();
        heading.className = 'test-section';
        const cell = heading.insertCell();
        cell.colSpan = 2;
        cell.textContent = t.section || 'Tests';
      }
      const row = rows.insertRow();
      row.insertCell().textContent = SYMBOLS[status];
      row.cells[0].className = `test-${status}`;
      row.insertCell().textContent = t.name + (message ? ` — ${message}` : '');
    }

    const count = (status) => results.filter((r) => r.status === status).length;
    const passed = count('passed');
    const known = count('known');
    const total = results.length - known; // open bugs don't count against the run
    const ok = passed === total;
    const text = `Tests: ${passed}/${total} passed` + (known ? `, ${known} known` : '') + (grep ? ` (grep: ${grep})` : '');

    summary.textContent = text;
    summary.className = 'test-summary ' + (ok ? 'test-passed' : 'test-failed');
    document.title = text;

    window.kilopixelTests = { passed, total, known, ok, grep, results };
    const json = document.createElement('script');
    json.type = 'application/json';
    json.id = 'test-results';
    // '<' escaped, so an error message containing "</script>" can't end the element in the serialized page
    json.textContent = JSON.stringify(window.kilopixelTests).replace(/</g, '\\u003c');
    document.body.append(json);
  };
})();
