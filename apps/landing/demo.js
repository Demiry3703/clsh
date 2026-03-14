// clsh.dev — slow, clean phone terminal animation
(function () {
  'use strict';

  // Slow and readable
  var TYPE_SPEED_MIN = 80;
  var TYPE_SPEED_MAX = 140;

  function randomDelay(min, max) {
    return min + Math.random() * (max - min);
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== TAB SWITCHING =====
  var tabs = document.querySelectorAll('.phone-tab');
  var panes = document.querySelectorAll('.phone-pane');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.getAttribute('data-pane');
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      panes.forEach(function (p) {
        p.classList.toggle('active', p.id === 'pane-' + target);
      });
    });
  });

  // Auto-switch tabs every 8 seconds
  var tabNames = ['shell', 'claude'];
  var currentTab = 0;
  setInterval(function () {
    currentTab = (currentTab + 1) % tabNames.length;
    var target = tabNames[currentTab];
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-pane') === target);
    });
    panes.forEach(function (p) {
      p.classList.toggle('active', p.id === 'pane-' + target);
    });
  }, 8000);

  // ===== COPY BUTTONS =====
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      if (!text) return;
      navigator.clipboard.writeText(text).then(function () {
        btn.classList.add('copied');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
        }, 2000);
      });
    });
  });

  // ===== TERMINAL ENGINE =====
  var terminals = {
    shell: document.getElementById('terminal-shell'),
    claude: document.getElementById('terminal-claude')
  };

  if (!terminals.shell || !terminals.claude) return;

  function addCursor(el) {
    var c = document.createElement('span');
    c.className = 'cursor-blink';
    el.appendChild(c);
    return c;
  }

  function removeCursor(c) {
    if (c && c.parentNode) c.parentNode.removeChild(c);
  }

  function scrollToBottom(el) { el.scrollTop = el.scrollHeight; }

  async function typeText(el, text, cr) {
    for (var i = 0; i < text.length; i++) {
      removeCursor(cr.cursor);
      el.insertAdjacentHTML('beforeend', escapeHtml(text[i]));
      cr.cursor = addCursor(el);
      scrollToBottom(el);
      await sleep(randomDelay(TYPE_SPEED_MIN, TYPE_SPEED_MAX));
    }
  }

  function printLine(el, html, cr) {
    removeCursor(cr.cursor);
    el.insertAdjacentHTML('beforeend', html + '\n');
    cr.cursor = addCursor(el);
    scrollToBottom(el);
  }

  async function printLines(el, lines, cr, delayMs) {
    for (var i = 0; i < lines.length; i++) {
      printLine(el, lines[i], cr);
      await sleep(delayMs || 80);
    }
  }

  function clearTerminal(el, cr) {
    removeCursor(cr.cursor);
    el.innerHTML = '';
    cr.cursor = addCursor(el);
  }

  // ===== SHELL — simple, slow =====
  async function runShell(el) {
    var cr = { cursor: null };
    cr.cursor = addCursor(el);

    while (true) {
      // Command 1
      printLine(el, '<span class="t-green t-bold">~</span> <span class="t-dim">$</span> ', cr);
      await sleep(1000);
      await typeText(el, 'npm run dev', cr);
      await sleep(600);
      printLine(el, '', cr);

      await sleep(400);
      await printLines(el, [
        '',
        '<span class="t-cyan t-bold">TURBO</span> Starting...',
        '',
      ], cr, 300);

      await sleep(800);
      await printLines(el, [
        '<span class="t-green">agent</span> listening on :4030',
        '<span class="t-green">web</span>   ready at :4031',
      ], cr, 600);

      await sleep(1000);
      printLine(el, '', cr);
      await printLines(el, [
        '<span class="t-green">agent</span> ngrok tunnel:',
        '  <span class="t-cyan">https://abc123.ngrok.app</span>',
      ], cr, 500);

      await sleep(1200);
      printLine(el, '', cr);
      printLine(el, '<span class="t-dim">Scan the QR code to connect</span>', cr);
      printLine(el, '<span class="t-dim">from your phone.</span>', cr);

      await sleep(1500);
      printLine(el, '', cr);
      printLine(el, '<span class="t-green t-bold">Ready.</span> <span class="t-dim">3 sessions active</span>', cr);

      await sleep(6000);
      clearTerminal(el, cr);
    }
  }

  // ===== CLAUDE — slow conversation =====
  async function runClaude(el) {
    var cr = { cursor: null };
    cr.cursor = addCursor(el);

    while (true) {
      printLine(el, '<span class="t-orange t-bold">Claude Code</span> <span class="t-dim">v1.0</span>', cr);
      printLine(el, '', cr);

      // Prompt
      printLine(el, '<span class="t-orange">&gt;</span> ', cr);
      await sleep(1200);
      await typeText(el, 'Fix the auth bug', cr);
      await sleep(800);
      printLine(el, '', cr);
      printLine(el, '', cr);

      // Response — slow line by line
      await sleep(600);
      printLine(el, '<span class="t-dim">Looking at auth.ts...</span>', cr);
      await sleep(1500);
      printLine(el, '', cr);

      printLine(el, '<span class="t-purple t-bold">Edit</span> <span class="t-dim">src/auth.ts</span>', cr);
      await sleep(800);
      printLine(el, '', cr);

      await printLines(el, [
        '<span class="t-red">- if (token) {</span>',
        '<span class="t-green">+ if (token && !isExpired(token)) {</span>',
      ], cr, 800);

      await sleep(2000);
      printLine(el, '', cr);
      printLine(el, '<span class="t-green t-bold">Done.</span> <span class="t-dim">1 file, +1 -1</span>', cr);

      await sleep(6000);
      clearTerminal(el, cr);
    }
  }

  // Start immediately
  runShell(terminals.shell);
  runClaude(terminals.claude);
})();
