var mediaRecorder = null;
var chunks = [];
var timerInterval = null;
var seconds = 0;
var audioBlob = null;

var recordBtn = document.getElementById('record-btn');
var doneBtn = document.getElementById('done-btn');
var status = document.getElementById('status');

recordBtn.addEventListener('click', toggleRecording);
doneBtn.addEventListener('click', finishRecording);

async function toggleRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunks = [];

      mediaRecorder.ondataavailable = function(e) {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = function() {
        audioBlob = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(function(t) { t.stop(); });
        status.textContent = 'Saved';
        status.className = 'done';
        recordBtn.textContent = 'Re-record';
        doneBtn.style.display = 'block';
      };

      mediaRecorder.start(100);
      status.textContent = 'Recording...';
      status.className = 'recording';
      recordBtn.textContent = 'Stop';
    } catch(e) {
      status.textContent = 'Mic error: ' + e.message;
    }
  } else {
    clearInterval(timerInterval);
    mediaRecorder.stop();
  }
}

function finishRecording() {
  if (!audioBlob) return;
  status.textContent = 'Saving...';
  doneBtn.style.display = 'none';

  var reader = new FileReader();
  reader.onloadend = function() {
    chrome.storage.local.set({ audioResult: { dataUrl: reader.result } });
    status.textContent = 'Done';
    status.className = 'done';
  };
  reader.readAsDataURL(audioBlob);
}
