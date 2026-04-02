/**
 * BlinkHistory — localStorage persistence and history modal rendering.
 */
const BlinkHistory = (() => {
  const STORAGE_KEY = 'blink_sessions';

  function loadSessions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveSession(summary) {
    if (!summary || summary.duration < 10) return; // ignore very short sessions
    const sessions = loadSessions();
    sessions.push(summary);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderHistoryList(container) {
    const sessions = loadSessions();
    if (sessions.length === 0) {
      container.innerHTML = '<div class="history-empty">暂无历史记录</div>';
      return;
    }

    // Show newest first
    const sorted = [...sessions].reverse();
    container.innerHTML = sorted.map(s => `
      <div class="history-item">
        <div>
          <div class="history-item__date">${s.date}</div>
          <div class="history-item__stats">
            <span>时长: ${formatDuration(s.duration)}</span>
            <span>眨眼: ${s.totalBlinks}次</span>
            <span>频率: ${s.avgRate.toFixed(1)}/min</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  return { loadSessions, saveSession, clearAll, renderHistoryList };
})();
