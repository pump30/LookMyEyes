/**
 * BlinkStats — tracks blink counts, frequency, and alert state.
 *
 * Usage:
 *   BlinkStats.start();
 *   BlinkStats.recordBlink(ear);
 *   const data = BlinkStats.getSnapshot();
 *   // data: { totalBlinks, rate, durationSec, status, minuteData }
 */
const BlinkStats = (() => {
  let startTime = null;
  let blinks = [];          // [{ timestamp, ear }]
  let minuteData = [];      // [{ minute, count }]
  let currentMinute = 0;
  let currentMinuteCount = 0;
  let running = false;

  // Alert state
  const LOW_RATE_THRESHOLD = 10;
  const ALERT_WINDOW_MS = 30000;
  let lastAlertTime = 0;

  function start() {
    startTime = Date.now();
    blinks = [];
    minuteData = [];
    currentMinute = 0;
    currentMinuteCount = 0;
    lastAlertTime = 0;
    running = true;
  }

  function stop() {
    // Flush current minute
    if (running && currentMinuteCount > 0) {
      minuteData.push({ minute: currentMinute, count: currentMinuteCount });
    }
    running = false;
  }

  function recordBlink(ear) {
    if (!running) return;
    const now = Date.now();
    blinks.push({ timestamp: now, ear });

    const elapsed = (now - startTime) / 1000;
    const minute = Math.floor(elapsed / 60);

    if (minute > currentMinute) {
      minuteData.push({ minute: currentMinute, count: currentMinuteCount });
      currentMinute = minute;
      currentMinuteCount = 0;
    }
    currentMinuteCount++;
  }

  function getRate() {
    if (!running || !startTime) return 0;
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed < 1) return 0;
    const minutes = elapsed / 60;
    return blinks.length / minutes;
  }

  function getDurationSec() {
    if (!running || !startTime) return 0;
    return Math.floor((Date.now() - startTime) / 1000);
  }

  function getStatus() {
    if (!running) return { label: '待启动', level: 'gray' };
    const rate = getRate();
    if (rate >= 15) return { label: '正常', level: 'green' };
    if (rate >= 10) return { label: '偏低', level: 'yellow' };
    return { label: '过低', level: 'red' };
  }

  function shouldAlert() {
    if (!running) return false;
    const now = Date.now();
    if (now - lastAlertTime < ALERT_WINDOW_MS) return false;

    const elapsed = (now - startTime) / 1000;
    if (elapsed < 30) return false;

    const rate = getRate();
    if (rate < LOW_RATE_THRESHOLD) {
      lastAlertTime = now;
      return true;
    }
    return false;
  }

  function getSnapshot() {
    const allMinuteData = [...minuteData];
    if (running && currentMinuteCount > 0) {
      allMinuteData.push({ minute: currentMinute, count: currentMinuteCount });
    }
    return {
      totalBlinks: blinks.length,
      rate: getRate(),
      durationSec: getDurationSec(),
      status: getStatus(),
      minuteData: allMinuteData,
      startTime,
    };
  }

  function getSessionSummary() {
    const endTime = Date.now();
    const durationSec = startTime ? Math.floor((endTime - startTime) / 1000) : 0;
    return {
      date: new Date(startTime).toISOString().slice(0, 10),
      startTime,
      endTime,
      duration: durationSec,
      totalBlinks: blinks.length,
      avgRate: durationSec > 0 ? (blinks.length / (durationSec / 60)) : 0,
      minuteData: [...minuteData],
    };
  }

  return { start, stop, recordBlink, getRate, getDurationSec, getStatus, shouldAlert, getSnapshot, getSessionSummary };
})();
