let mediaRecorder = null;
let chunks = [];
let timerInterval = null;
let seconds = 0;
let audioBlob = null;

const recordBtn = document.getElementById('record-btn');
const doneBtn = document.getElementById('done-btn');
const status = document.getElementById('status');
const timer = document.getElementById('timer');

recordBtn.addEventListener('click', toggleRecording);
doneBtn.addEventListener('click', finishRecording);

async function toggleRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunks = [];

      mediaRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = function() {
        audioBlob = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(function(t) { t.stop(); });
        status.textContent = 'Recording saved. Click below to use it.';
        status.className = '';
        recordBtn.textContent = 'Re-record';
        doneBtn.style.display = 'block';
      };

      mediaRecorder.start(100);
      seconds = 0;
      timer.style.display = 'block';
      timerInterval = setInterval(function() {
        seconds++;
        var m = Math.floor(seconds / 60);
        var s = (seconds % 60).toString().padStart(2, '0');
        timer.textContent = m + ':' + s;
      }, 1000);

      status.textContent = 'Recording...';
      status.className = 'recording';
      recordBtn.textContent = 'Stop Recording';
    } catch(e) {
      status.textContent = 'Microphone error: ' + e.message;
    }
  } else {
    clearInterval(timerInterval);
    mediaRecorder.stop();
  }
}

function finishRecording() {
  if (!audioBlob) return;
  status.textContent = 'Saving...';

  var reader = new FileReader();
  reader.onloadend = function() {
    chrome.storage.local.set({ audioResult: { dataUrl: reader.result } }, function() {
      window.close();
    });
  };
  reader.readAsDataURL(audioBlob);
}
