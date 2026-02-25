// ===============================
// Speech Recognition for Video Subtitles
// ===============================

const speechBtn = document.getElementById("speechBtn");
const subtitleBox = document.getElementById("speechSubtitles");
const speechLangSelect = document.getElementById("speechLangSelect");

let recognition = null;
let recognizing = false;

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Speech Recognition API is not supported in this browser.");
        return null;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = speechLangSelect.value; // <-- user-selected language
    return rec;
}

speechBtn.addEventListener("click", () => {
    if (!recognition) recognition = initSpeechRecognition();
    if (!recognition) return;

    if (!recognizing) {
        subtitleBox.textContent = "";
        recognition.lang = speechLangSelect.value; // <-- update before starting
        recognition.start();
        recognizing = true;
        speechBtn.textContent = "🛑";
    } else {
        recognition.stop();
        recognizing = false;
        speechBtn.textContent = "🎙️";
    }
});

// Recognition events
if (!recognition) recognition = initSpeechRecognition();
if (recognition) {
    recognition.onstart = () => {
        subtitleBox.textContent = "Listening…";
    };

    recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const text = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalText += text;
            else interimText += text;
        }

        subtitleBox.textContent = finalText || interimText;
    };

    recognition.onerror = (event) => {
        alert("Speech recognition error: " + event.error);
        recognizing = false;
        speechBtn.textContent = "🎙️";
    };

    recognition.onend = () => {
        if (recognizing) {
            recognition.start(); // Chrome auto-restart
        } else {
            subtitleBox.textContent = "";
        }
    };
}

// Update language instantly when user changes it
speechLangSelect.addEventListener("change", () => {
    if (recognition) {
        recognition.lang = speechLangSelect.value;
    }
});
