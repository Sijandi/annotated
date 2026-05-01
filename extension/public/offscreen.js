// Offscreen document for audio recording
let mediaRecorder = null;
let chunks = [];

// Listen for commands via session storage
chrome.storage.session.onChanged.addListener((changes) => {
  if (!changes.audioCmd) return;
  const cmd = changes.audioCmd.newValue;
  if (!cmd) return;

  if (cmd.action === 'start') {
    doStart();
  } else if (cmd.action === 'stop') {
    doStop();
  }
});

async function doStart() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    chunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.start(100);
    console.log('[offscreen] recording started');
  } catch (err) {
    console.error('[offscreen] mic error:', err);
    chrome.runtime.sendMessage({ type: 'AUDIO_RESULT', error: err.message });
  }
}

function doStop() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    chrome.runtime.sendMessage({ type: 'AUDIO_RESULT', error: 'No active recording' });
    return;
  }

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = () => {
      console.log('[offscreen] sending audio data, size:', reader.result.length);
      chrome.runtime.sendMessage({ type: 'AUDIO_RESULT', dataUrl: reader.result });
    };
    reader.onerror = () => {
      chrome.runtime.sendMessage({ type: 'AUDIO_RESULT', error: 'Failed to read audio' });
    };
    reader.readAsDataURL(blob);

    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    mediaRecorder = null;
    chunks = [];
  };

  mediaRecorder.stop();
}
