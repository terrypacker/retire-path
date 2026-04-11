// Debug Logger Toolkit (Polished Version)
// ES Module Singleton

class DebugLoggerClass {
  constructor() {
    if (DebugLoggerClass._instance) return DebugLoggerClass._instance;

    this.MAX_LOGS = 1000;
    this.logs = [];
    this.sessionId = crypto.randomUUID();
    this.originalConsole = { ...console };

    this.levels = ['debug', 'info', 'log', 'warn', 'error', 'network', 'user'];
    this.activeLevels = new Set(this.levels);

    this.searchQuery = '';

    this.REDACTION_PATTERNS = [
      { regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replace: 'Bearer [REDACTED]' },
      { regex: /api[_-]?key\s*[:=]\s*[A-Za-z0-9\-._~+/]+/gi, replace: 'apiKey=[REDACTED]' },
      { regex: /password\s*[:=]\s*[^\s]+/gi, replace: 'password=[REDACTED]' },
      { regex: /token\s*[:=]\s*[A-Za-z0-9\-._~+/]+/gi, replace: 'token=[REDACTED]' }
    ];

    this.init();
    DebugLoggerClass._instance = this;
  }

  redact(str) {
    let result = str;
    this.REDACTION_PATTERNS.forEach(p => result = result.replace(p.regex, p.replace));
    return result;
  }

  serializeArgs(args) {
    return args.map(arg => {
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); }
        catch { return '[Circular]'; }
      }
      return String(arg);
    }).join(' ');
  }

  addLog(type, args) {
    const message = this.redact(this.serializeArgs(args));

    const entry = {
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId
    };

    // Deduplicate spammy logs
    const last = this.logs[this.logs.length - 1];
    if (last && last.message === entry.message && last.type === entry.type) {
      last.count = (last.count || 1) + 1;
      return;
    }

    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) this.logs.shift();

    this.render();
  }

  intercept(method) {
    return (...args) => {
      this.addLog(method, args);
      this.originalConsole[method].apply(console, args);
    };
  }

  hookConsole() {
    ['log', 'warn', 'error', 'info', 'debug'].forEach(m => {
      console[m] = this.intercept(m);
    });
  }

  hookErrors() {
    window.addEventListener('error', e => {
      this.addLog('error', [e.message]);
    });

    window.addEventListener('unhandledrejection', e => {
      this.addLog('error', ['UnhandledPromise', e.reason]);
    });
  }

  hookFetch() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      this.addLog('network', [args[0], res.status]);
      return res;
    };
  }

  hookUserEvents() {
    document.addEventListener('click', e => {
      this.addLog('user', [`Click: ${e.target.tagName}`]);
    });
  }

  createUI() {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', bottom: '0', right: '0', width: '450px', height: '350px',
      background: '#111', color: '#0f0', fontSize: '12px', fontFamily: 'monospace',
      zIndex: '99999', display: 'none', flexDirection: 'column'
    });

    const header = document.createElement('div');
    header.innerText = 'Debug Toolkit';
    header.style.background = '#222';
    header.style.padding = '4px';

    // Search box
    const search = document.createElement('input');
    search.placeholder = 'Search logs...';
    search.oninput = () => {
      this.searchQuery = search.value.toLowerCase();
      this.render();
    };

    // Content
    this.content = document.createElement('div');
    Object.assign(this.content.style, { flex: '1', overflow: 'auto' });

    const controls = document.createElement('div');

    const toggleBtn = document.createElement('button');
    toggleBtn.innerText = 'Toggle';
    toggleBtn.onclick = () => {
      this.panel.style.display = this.panel.style.display === 'none' ? 'flex' : 'none';
    };

    const clearBtn = document.createElement('button');
    clearBtn.innerText = 'Clear';
    clearBtn.onclick = () => this.clear();

    const downloadBtn = document.createElement('button');
    downloadBtn.innerText = 'Download';
    downloadBtn.onclick = () => {
      const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `logs-${this.sessionId}.json`;
      a.click();
    };

    const githubBtn = document.createElement('button');
    githubBtn.innerText = 'Report';
    githubBtn.onclick = () => {
      const lastError = [...this.logs].reverse().find(l => l.type === 'error');
      const title = encodeURIComponent(lastError ? lastError.message.slice(0, 80) : 'Bug Report');

      const body = encodeURIComponent(
          `Session: ${this.sessionId}\nURL: ${location.href}\n\nLogs:\n\n${JSON.stringify(this.logs, null, 2)}`
      );

      window.open(`https://github.com/terrypacker/retire-path/issues/new?title=${title}&body=${body}`, '_blank');
    };

    // Filters
    const filterRow = document.createElement('div');
    this.levels.forEach(level => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.onchange = () => {
        cb.checked ? this.activeLevels.add(level) : this.activeLevels.delete(level);
        this.render();
      };

      const label = document.createElement('label');
      label.appendChild(cb);
      label.append(level);
      filterRow.appendChild(label);
    });

    controls.append(toggleBtn, clearBtn, downloadBtn, githubBtn);

    this.panel.append(header, search, filterRow, this.content, controls);
    document.body.appendChild(this.panel);
  }

  render() {
    if (!this.content) return;

    let filtered = this.logs.filter(l => this.activeLevels.has(l.type));

    if (this.searchQuery) {
      filtered = filtered.filter(l => l.message.toLowerCase().includes(this.searchQuery));
    }

    this.content.innerHTML = filtered
    .map(l => `[${l.type}] ${l.message}${l.count ? ` (x${l.count})` : ''}`)
    .join('<br>');
  }

  init() {
    this.hookConsole();
    this.hookErrors();
    this.hookFetch();
    this.hookUserEvents();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.createUI());
    } else {
      this.createUI();
    }
  }

  getLogs() { return this.logs; }
  clear() { this.logs.length = 0; this.render(); }
}

const DebugLogger = new DebugLoggerClass();
