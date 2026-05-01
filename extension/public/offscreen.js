// Offscreen document — handles both mic recording and tab capture

// === Mic recording for audio commentary ===
var micRecorder = null;
var micChunks = [];

chrome.storage.local.onChanged.addListener(function(changes) {
  if (changes.audioCmd) {
    var cmd = changes.audioCmd.newValue;
    if (!cmd) return;
    if (cmd.action === 'start') startMicRecording();
    if (cmd.action === 'stop') stopMicRecording();
  }

  if (changes.captureCmd) {
    var cmd = changes.captureCmd.newValue;
    if (!cmd) return;
    if (cmd.action === 'start') startTabCapture(cmd.streamId, cmd.duration);
    if (cmd.action === 'stop') stopTabCapture();
  }
});

async function startMicRecording() {
  try {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    micChunks = [];
    micRecorder.ondataavailable = function(e) { if (e.data.size > 0) micChunks.push(e.data); };
    micRecorder.onstop = function() {
      var blob = new Blob(micChunks, { type: 'audio/webm' });
      var reader = new FileReader();
      reader.onloadend = function() { chrome.runtime.sendMessage({ type: 'AUDIO_RESULT', dataUrl: reader.result }); };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach(function(t) { t.stop(); });
    };
    micRecorder.start(100);
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'AUDIO_RESULT', error: err.message });
  }
}

function stopMicRecording() {
  if (micRecorder && micRecorder.state !== 'inactive') micRecorder.stop();
}

// === Tab capture for video clipping ===
var tabRecorder = null;
var tabChunks = [];

async function startTabCapture(streamId, duration) {
  try {
    var stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
      video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }
    });

    tabRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 2000000
    });
    tabChunks = [];

    tabRecorder.ondataavailable = function(e) { if (e.data.size > 0) tabChunks.push(e.data); };
    tabRecorder.onstop = function() {
      var blob = new Blob(tabChunks, { type: 'video/webm' });
      var reader = new FileReader();
      reader.onloadend = function() {
        chrome.runtime.sendMessage({ type: 'TAB_CAPTURE_RESULT', dataUrl: reader.result });
      };
      reader.onerror = function() {
        chrome.runtime.sendMessage({ type: 'TAB_CAPTURE_RESULT', error: 'Failed to read video' });
      };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach(function(t) { t.stop(); });
    };

    tabRecorder.start(100);

    // Auto-stop after duration + small buffer
    if (duration) {
      setTimeout(function() {
        if (tabRecorder && tabRecorder.state !== 'inactive') tabRecorder.stop();
      }, (duration + 2) * 1000);
    }
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'TAB_CAPTURE_RESULT', error: err.message });
  }
}

function stopTabCapture() {
  if (tabRecorder && tabRecorder.state !== 'inactive') tabRecorder.stop();
}
