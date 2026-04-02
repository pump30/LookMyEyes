/**
 * App — main orchestration: camera, detection loop, UI, chart, modals.
 */
(function () {
  // DOM elements
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const ctx = overlay.getContext('2d');
  const btnToggle = document.getElementById('btn-toggle');
  const btnHistory = document.getElementById('btn-history');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const cameraMessage = document.getElementById('camera-message');
  const cameraContainer = document.querySelector('.camera-container');
  const statCount = document.getElementById('stat-count');
  const statRate = document.getElementById('stat-rate');
  const statDuration = document.getElementById('stat-duration');
  const statStatus = document.getElementById('stat-status');
  const toastEl = document.getElementById('toast');
  const historyModal = document.getElementById('history-modal');
  const historyList = document.getElementById('history-list');
  const chartCanvas = document.getElementById('chart');

  let detecting = false;
  let animFrameId = null;
  let statsIntervalId = null;
  let blinkChart = null;
  let modelLoaded = false;
  let modelLoading = false;

  // --- Chart Setup ---
  function initChart() {
    blinkChart = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: '眨眼次数/分钟',
          data: [],
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: '分钟', color: '#888' },
            ticks: { color: '#888' },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
          y: {
            title: { display: true, text: '次数', color: '#888' },
            ticks: { color: '#888' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            suggestedMin: 0,
            suggestedMax: 25,
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  }

  function updateChart(minuteData) {
    if (!blinkChart) return;
    // Show last 30 data points
    const recent = minuteData.slice(-30);
    blinkChart.data.labels = recent.map(d => d.minute + 1);
    blinkChart.data.datasets[0].data = recent.map(d => d.count);
    blinkChart.update('none'); // no animation for performance
  }

  // --- UI Updates ---
  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function updateStatsUI() {
    const snap = BlinkStats.getSnapshot();
    statCount.textContent = snap.totalBlinks;
    statRate.textContent = snap.rate.toFixed(1);
    statDuration.textContent = formatDuration(snap.durationSec);

    // Rate color
    statRate.className = 'stat-card__value';
    if (snap.status.level === 'green') statRate.classList.add('stat-card__value--green');
    else if (snap.status.level === 'yellow') statRate.classList.add('stat-card__value--yellow');
    else if (snap.status.level === 'red') statRate.classList.add('stat-card__value--red');

    // Status
    statStatus.innerHTML = `<span class="status-dot status-dot--${snap.status.level}"></span> ${snap.status.label}`;

    // Chart
    updateChart(snap.minuteData);

    // Alert
    if (BlinkStats.shouldAlert()) {
      showToast('眨眼频率偏低，请注意眨眼休息眼睛');
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 4000);
  }

  function triggerBlinkFlash() {
    cameraContainer.classList.remove('blink-flash');
    // Force reflow
    void cameraContainer.offsetWidth;
    cameraContainer.classList.add('blink-flash');
    setTimeout(() => cameraContainer.classList.remove('blink-flash'), 300);
  }

  // --- Camera ---
  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    video.srcObject = stream;
    await new Promise(resolve => { video.onloadedmetadata = resolve; });
    video.play();
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    cameraMessage.style.display = 'none';
  }

  function stopCamera() {
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    cameraMessage.style.display = '';
    cameraMessage.textContent = '点击"开始检测"启动摄像头';
  }

  // --- Detection Loop ---
  function detectionLoop() {
    if (!detecting) return;

    const result = BlinkDetector.detect(video);

    if (result.faceDetected && result.blinked) {
      BlinkStats.recordBlink(result.ear);
      triggerBlinkFlash();
    }

    if (!result.faceDetected && detecting) {
      statStatus.innerHTML = '<span class="status-dot status-dot--red"></span> 未检测到面部';
    }

    animFrameId = requestAnimationFrame(detectionLoop);
  }

  // --- Preload Model ---
  async function preloadModel() {
    if (modelLoaded || modelLoading) return;
    modelLoading = true;
    btnToggle.textContent = '模型加载中...';
    btnToggle.disabled = true;
    try {
      await BlinkDetector.load();
      modelLoaded = true;
      btnToggle.textContent = '开始检测';
      btnToggle.disabled = false;
    } catch (err) {
      btnToggle.textContent = '模型加载失败';
      console.error('Model preload failed:', err);
    }
    modelLoading = false;
  }

  // --- Start / Stop ---
  async function startDetection() {
    try {
      if (!modelLoaded) {
        await preloadModel();
        if (!modelLoaded) return;
      }

      cameraMessage.textContent = '正在启动摄像头...';
      await startCamera();

      BlinkDetector.reset();
      BlinkStats.start();
      detecting = true;

      btnToggle.textContent = '停止检测';
      btnToggle.classList.remove('btn--primary');
      btnToggle.classList.add('btn--danger');

      // Update stats every 1s
      statsIntervalId = setInterval(updateStatsUI, 1000);

      detectionLoop();
    } catch (err) {
      cameraMessage.style.display = '';
      if (err.name === 'NotAllowedError') {
        cameraMessage.textContent = '摄像头权限被拒绝，请在浏览器设置中允许访问摄像头';
      } else {
        cameraMessage.textContent = '启动失败: ' + err.message;
      }
      console.error('Detection start failed:', err);
    }
  }

  function stopDetection() {
    detecting = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (statsIntervalId) clearInterval(statsIntervalId);

    // Save session
    const summary = BlinkStats.getSessionSummary();
    BlinkStats.stop();
    BlinkHistory.saveSession(summary);

    // Final UI update
    updateStatsUI();

    stopCamera();

    btnToggle.textContent = '开始检测';
    btnToggle.classList.remove('btn--danger');
    btnToggle.classList.add('btn--primary');
  }

  // --- Events ---
  btnToggle.addEventListener('click', () => {
    if (detecting) {
      stopDetection();
    } else {
      startDetection();
    }
  });

  btnHistory.addEventListener('click', () => {
    BlinkHistory.renderHistoryList(historyList);
    historyModal.classList.remove('hidden');
  });

  btnCloseModal.addEventListener('click', () => {
    historyModal.classList.add('hidden');
  });

  historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) historyModal.classList.add('hidden');
  });

  btnClearHistory.addEventListener('click', () => {
    if (confirm('确定要清除所有历史记录吗？')) {
      BlinkHistory.clearAll();
      BlinkHistory.renderHistoryList(historyList);
    }
  });

  // --- Init ---
  initChart();
  // Preload model immediately on page open so it's ready when user clicks start
  preloadModel();
})();
