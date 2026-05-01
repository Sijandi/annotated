// Offscreen document — handles mic recording and tab capture

// === Mic recording for audio commentary ===
var micRecorder = null;
var micChunks = [];

// === Tab capture for video clipping ===
var tabRecorder = null;
var tabChunks = [];

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
      blobToResult(blob, 'AUDIO_RESULT');
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

async function startTabCapture(streamId, duration) {
  try {
    // Use the stream ID from tabCapture API
    var stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    tabRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8,opus',
      videoBitsPerSecond: 2000000
    });
    tabChunks = [];

    tabRecorder.ondataavailable = function(e) { if (e.data.size > 0) tabChunks.push(e.data); };
    tabRecorder.onstop = function() {
      var blob = new Blob(tabChunks, { type: 'video/webm' });
      blobToResult(blob, 'TAB_CAPTURE_RESULT');
      stream.getTracks().forEach(function(t) { t.stop(); });
      tabRecorder = null;
      tabChunks = [];
    };

    tabRecorder.start(100);
    console.log('[offscreen] tab capture started, duration:', duration);

    // Auto-stop after duration
    if (duration) {
      setTimeout(function() {
        stopTabCapture();
      }, (duration + 2) * 1000);
    }
  } catch (err) {
    console.error('[offscreen] tab capture error:', err);
    chrome.storage.local.set({ captureResult: { error: err.message } });
  }
}

function stopTabCapture() {
  if (tabRecorder && tabRecorder.state !== 'inactive') tabRecorder.stop();
}

function blobToResult(blob, messageType) {
  var reader = new FileReader();
  reader.onloadend = function() {
    if (messageType === 'AUDIO_RESULT') {
      chrome.runtime.sendMessage({ type: messageType, dataUrl: reader.result });
    } else {
      // For video, use storage since it can be large
      chrome.storage.local.set({ captureResult: { dataUrl: reader.result } });
    }
  };
  reader.onerror = function() {
    if (messageType === 'AUDIO_RESULT') {
      chrome.runtime.sendMessage({ type: messageType, error: 'Failed to read blob' });
    } else {
      chrome.storage.local.set({ captureResult: { error: 'Failed to read video blob' } });
    }
  };
  reader.readAsDataURL(blob);
}
