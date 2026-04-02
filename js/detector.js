/**
 * BlinkDetector — uses @mediapipe/tasks-vision FaceLandmarker for blink detection.
 *
 * Usage:
 *   await BlinkDetector.load();       // call once, preloads model
 *   BlinkDetector.isLoaded();         // check if ready
 *   const result = BlinkDetector.detect(videoElement);
 *   // result: { blinked: boolean, ear: number, faceDetected: boolean }
 */
const BlinkDetector = (() => {
  let faceLandmarker = null;
  let FaceLandmarker = null;

  // Eye landmark indices from MediaPipe FaceMesh (468 keypoints)
  // Each eye: [outerCorner, upperOuter, upperInner, innerCorner, lowerInner, lowerOuter]
  const LEFT_EYE = [33, 160, 158, 133, 153, 144];
  const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

  const EAR_THRESHOLD = 0.25;
  const CONSEC_FRAMES = 2;
  const DEBOUNCE_MS = 100;

  let belowCount = 0;
  let blinkInProgress = false;
  let lastBlinkTime = 0;

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function calcEAR(landmarks, indices) {
    const p = indices.map(i => landmarks[i]);
    const vertical1 = distance(p[1], p[5]);
    const vertical2 = distance(p[2], p[4]);
    const horizontal = distance(p[0], p[3]);
    if (horizontal === 0) return 1;
    return (vertical1 + vertical2) / (2 * horizontal);
  }

  async function load() {
    if (faceLandmarker) return; // already loaded

    const vision = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
    );
    FaceLandmarker = vision.FaceLandmarker;
    const FilesetResolver = vision.FilesetResolver;

    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  function isLoaded() {
    return faceLandmarker !== null;
  }

  function detect(video) {
    if (!faceLandmarker) return { blinked: false, ear: 1, faceDetected: false };

    const timestamp = performance.now();
    const results = faceLandmarker.detectForVideo(video, timestamp);

    if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
      belowCount = 0;
      blinkInProgress = false;
      return { blinked: false, ear: 1, faceDetected: false };
    }

    const landmarks = results.faceLandmarks[0];
    const leftEAR = calcEAR(landmarks, LEFT_EYE);
    const rightEAR = calcEAR(landmarks, RIGHT_EYE);
    const ear = (leftEAR + rightEAR) / 2;

    let blinked = false;
    const now = Date.now();

    if (ear < EAR_THRESHOLD) {
      belowCount++;
      if (belowCount >= CONSEC_FRAMES && !blinkInProgress) {
        blinkInProgress = true;
      }
    } else {
      if (blinkInProgress && (now - lastBlinkTime) > DEBOUNCE_MS) {
        blinked = true;
        lastBlinkTime = now;
      }
      belowCount = 0;
      blinkInProgress = false;
    }

    return { blinked, ear, faceDetected: true };
  }

  function reset() {
    belowCount = 0;
    blinkInProgress = false;
    lastBlinkTime = 0;
  }

  return { load, isLoaded, detect, reset };
})();
