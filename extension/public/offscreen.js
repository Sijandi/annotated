// Offscreen document for audio recording
// Communicates with background via chrome.storage changes

let mediaRecorder = null;
let chunks = [];

// Listen for commands via storage changes
chrome.storage.local.onChanged.addListener((changes) => {
  if (!changes.audioCommand) return;
  const command = changes.audioCommand.newValue;

  if (command === 'start') {
    startRecording();
    chrome.storage.local.remove('audioCommand');
  } else if (command === 'stop') {
    stopRecording();
    chrome.storage.local.remove('audioCommand');
  }
});

async function startRecording() {
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
    chrome.runtime.sendMessage({ type: 'RECORDING_RESULT', error: err.message });
  }
}

function stopRecording() {
  if (!mediaRecorder) {
    chrome.runtime.sendMessage({ type: 'RECORDING_RESULT', error: 'No active recording' });
    return;
  }

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = () => {
      chrome.runtime.sendMessage({ type: 'RECORDING_RESULT', dataUrl: reader.result });
    };
    reader.onerror = () => {
      chrome.runtime.sendMessage({ type: 'RECORDING_RESULT', error: 'Failed to read audio' });
    };
    reader.readAsDataURL(blob);

    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    mediaRecorder = null;
    chunks = [];
  };

  mediaRecorder.stop();
}
