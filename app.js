(() => {
  "use strict";

  const HISTORY_KEY = "avanegasht-local-transcripts-v1";
  const MAX_HISTORY_ITEMS = 6;
  const persianNumber = new Intl.NumberFormat("fa-IR");
  const persianDate = new Intl.DateTimeFormat("fa-IR", {
    day: "numeric",
    month: "short",
  });

  const elements = {
    connectionStatus: document.getElementById("connectionStatus"),
    dropZone: document.getElementById("dropZone"),
    audioInput: document.getElementById("audioInput"),
    recordButton: document.getElementById("recordButton"),
    recordButtonText: document.getElementById("recordButtonText"),
    recordTimer: document.getElementById("recordTimer"),
    recordHint: document.getElementById("recordHint"),
    recordCard: document.querySelector(".record-card"),
    audioFileCard: document.getElementById("audioFileCard"),
    fileName: document.getElementById("fileName"),
    fileMeta: document.getElementById("fileMeta"),
    removeFile: document.getElementById("removeFile"),
    playAudio: document.getElementById("playAudio"),
    playIcon: document.getElementById("playIcon"),
    miniWave: document.getElementById("miniWave"),
    audioDuration: document.getElementById("audioDuration"),
    audioPreview: document.getElementById("audioPreview"),
    modelSelect: document.getElementById("modelSelect"),
    outputStyleInputs: [...document.querySelectorAll('input[name="outputStyle"]')],
    translateToggle: document.getElementById("translateToggle"),
    settingsNote: document.getElementById("settingsNote"),
    resetSettings: document.getElementById("resetSettings"),
    transcribeButton: document.getElementById("transcribeButton"),
    transcribeButtonText: document.getElementById("transcribeButtonText"),
    resultState: document.getElementById("resultState"),
    resultEmpty: document.getElementById("resultEmpty"),
    processingState: document.getElementById("processingState"),
    processingTitle: document.getElementById("processingTitle"),
    processingDescription: document.getElementById("processingDescription"),
    progressBar: document.getElementById("progressBar"),
    processingSteps: [...document.querySelectorAll(".processing-steps span")],
    transcriptArea: document.getElementById("transcriptArea"),
    transcriptText: document.getElementById("transcriptText"),
    wordCount: document.getElementById("wordCount"),
    characterCount: document.getElementById("characterCount"),
    copyButton: document.getElementById("copyButton"),
    downloadButton: document.getElementById("downloadButton"),
    segmentsPanel: document.getElementById("segmentsPanel"),
    segmentsTitle: document.getElementById("segmentsTitle"),
    segmentsCount: document.getElementById("segmentsCount"),
    segmentsList: document.getElementById("segmentsList"),
    resultError: document.getElementById("resultError"),
    historyList: document.getElementById("historyList"),
    historyEmpty: document.getElementById("historyEmpty"),
    clearHistory: document.getElementById("clearHistory"),
    toast: document.getElementById("toast"),
  };

  const state = {
    file: null,
    fileUrl: null,
    recorder: null,
    stream: null,
    recordingChunks: [],
    recordingStartedAt: 0,
    recordingTimer: null,
    isRecording: false,
    isProcessing: false,
    processingTimers: [],
    history: [],
    lastTranscript: "",
    lastSegments: [],
    lastStyle: "plain",
  };

  const playPath = '<path d="m8 5 11 7-11 7V5Z" />';
  const pausePath = '<path d="M7 5h3.5v14H7V5Zm6.5 0H17v14h-3.5V5Z" />';

  function init() {
    makeMiniWave("ava-nevis");
    bindEvents();
    updateSettingsUI();
    loadHistory();
    updatePuterStatus();

    // In case a slow external script completes after this deferred application script.
    window.setTimeout(updatePuterStatus, 1200);
  }

  function bindEvents() {
    elements.dropZone.addEventListener("click", () => {
      if (!state.isProcessing) elements.audioInput.click();
    });

    elements.dropZone.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !state.isProcessing) {
        event.preventDefault();
        elements.audioInput.click();
      }
    });

    elements.audioInput.addEventListener("change", (event) => {
      const [file] = event.target.files;
      if (file) setAudioFile(file);
      event.target.value = "";
    });

    let dragDepth = 0;
    elements.dropZone.addEventListener("dragenter", (event) => {
      event.preventDefault();
      dragDepth += 1;
      elements.dropZone.classList.add("is-dragging");
    });
    elements.dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    elements.dropZone.addEventListener("dragleave", (event) => {
      event.preventDefault();
      dragDepth -= 1;
      if (dragDepth <= 0) {
        dragDepth = 0;
        elements.dropZone.classList.remove("is-dragging");
      }
    });
    elements.dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dragDepth = 0;
      elements.dropZone.classList.remove("is-dragging");
      const [file] = event.dataTransfer?.files || [];
      if (file) setAudioFile(file);
    });

    elements.recordButton.addEventListener("click", () => {
      if (state.isProcessing) return;
      if (state.isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    elements.removeFile.addEventListener("click", clearAudioFile);
    elements.playAudio.addEventListener("click", toggleAudioPlayback);

    elements.audioPreview.addEventListener("loadedmetadata", () => {
      const duration = elements.audioPreview.duration;
      if (Number.isFinite(duration)) {
        elements.audioDuration.textContent = formatDuration(duration);
        updateFileMeta(duration);
      }
    });
    elements.audioPreview.addEventListener("timeupdate", () => {
      if (!Number.isFinite(elements.audioPreview.duration)) return;
      elements.audioDuration.textContent = `${formatDuration(elements.audioPreview.currentTime)} / ${formatDuration(elements.audioPreview.duration)}`;
    });
    elements.audioPreview.addEventListener("play", setAudioPlaying);
    elements.audioPreview.addEventListener("pause", resetAudioPlaying);
    elements.audioPreview.addEventListener("ended", resetAudioPlaying);
    elements.audioPreview.addEventListener("error", () => {
      resetAudioPlaying();
      if (state.file) elements.audioDuration.textContent = "--:--";
    });

    elements.outputStyleInputs.forEach((input) => {
      input.addEventListener("change", updateSettingsUI);
    });
    elements.translateToggle.addEventListener("change", updateSettingsUI);
    elements.resetSettings.addEventListener("click", resetSettings);

    elements.transcribeButton.addEventListener("click", transcribeAudio);
    elements.transcriptText.addEventListener("input", () => {
      state.lastTranscript = elements.transcriptText.value;
      updateTranscriptStats();
    });
    elements.copyButton.addEventListener("click", copyTranscript);
    elements.downloadButton.addEventListener("click", downloadTranscript);
    elements.clearHistory.addEventListener("click", clearHistory);

    elements.historyList.addEventListener("click", (event) => {
      const item = event.target.closest("button[data-history-id]");
      if (!item) return;
      const selected = state.history.find((entry) => entry.id === item.dataset.historyId);
      if (selected) restoreHistoryItem(selected);
    });

    window.addEventListener("beforeunload", () => {
      if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
      stopStreamTracks();
    });
  }

  function updatePuterStatus() {
    const isAvailable = Boolean(window.puter?.ai?.speech2txt);
    const label = elements.connectionStatus.querySelector("span:last-child");
    if (isAvailable) {
      elements.connectionStatus.classList.remove("is-error");
      label.textContent = "آماده برای پردازش";
    } else {
      elements.connectionStatus.classList.add("is-error");
      label.textContent = "اتصال Puter.js برقرار نشد";
    }
  }

  function isAudioFile(file) {
    if (!file) return false;
    const allowedExtensions = /\.(mp3|wav|m4a|ogg|oga|opus|webm|aac|flac|mp4|mpeg|mpga)$/i;
    const mime = String(file.type || "").split(";")[0].trim().toLowerCase();
    return mime.startsWith("audio/") || mime === "video/webm" || allowedExtensions.test(file.name || "");
  }

  // Puter.js converts File/Blob inputs to data URLs, then the backend derives the
  // OpenAI filename from the MIME subtype only (`audio/mpeg` → `input.mpeg`).
  // gpt-4o-transcribe rejects that even for valid MP3s; extra MIME parameters such
  // as `codecs=opus` also break base64 decoding. See:
  // https://docs.puter.com/AI/speech2txt/ and HeyPuter/puter#2655
  const AUDIO_PROFILES = [
    { extensions: ["mp3", "mpga", "mpeg"], mimeType: "audio/mp3" },
    { extensions: ["wav", "wave"], mimeType: "audio/wav" },
    { extensions: ["m4a", "aac"], mimeType: "audio/m4a" },
    { extensions: ["mp4"], mimeType: "audio/mp4" },
    { extensions: ["ogg", "oga", "opus"], mimeType: "audio/ogg" },
    { extensions: ["webm"], mimeType: "audio/webm" },
    { extensions: ["flac"], mimeType: "audio/flac" },
  ];

  const MIME_TO_EXTENSION = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/x-mpeg": "mp3",
    "audio/mpga": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/vnd.wave": "wav",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/aac": "m4a",
    "audio/x-aac": "m4a",
    "audio/ogg": "ogg",
    "application/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
  };

  function resolveAudioIdentity(file) {
    const extension = getFileExtension(file).toLowerCase();
    const rawType = String(file?.type || "").split(";")[0].trim().toLowerCase();
    const fromName = AUDIO_PROFILES.find((profile) => profile.extensions.includes(extension));
    if (fromName) {
      return { mimeType: fromName.mimeType, extension: fromName.extensions[0] };
    }

    const mappedExtension = MIME_TO_EXTENSION[rawType];
    if (mappedExtension) {
      const profile = AUDIO_PROFILES.find((item) => item.extensions.includes(mappedExtension));
      return { mimeType: profile.mimeType, extension: profile.extensions[0] };
    }

    const subtype = rawType.includes("/") ? rawType.split("/")[1] : "";
    const fromSubtype = AUDIO_PROFILES.find((profile) => profile.extensions.includes(subtype));
    if (fromSubtype) {
      return { mimeType: fromSubtype.mimeType, extension: fromSubtype.extensions[0] };
    }

    if (rawType.startsWith("audio/") || rawType === "video/webm") {
      return {
        mimeType: rawType,
        extension: extension && extension !== "audio" ? extension : subtype || "mp3",
      };
    }

    return { mimeType: "audio/mp3", extension: "mp3" };
  }

  function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("خواندن فایل صوتی ممکن نشد."));
      reader.readAsDataURL(blob);
    });
  }

  async function prepareSpeechSource(file) {
    const { mimeType } = resolveAudioIdentity(file);
    const blob = file.type === mimeType ? file : new Blob([file], { type: mimeType });
    const dataUrl = await readBlobAsDataUrl(blob);
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      throw new Error("تبدیل فایل صوتی برای ارسال ممکن نشد.");
    }
    const comma = dataUrl.indexOf(",");
    const payload = comma >= 0 ? dataUrl.slice(comma + 1) : "";
    if (!payload) {
      throw new Error("فایل صوتی خالی است.");
    }
    return `data:${mimeType};base64,${payload}`;
  }

  function getErrorText(error) {
    if (!error) return "";
    if (typeof error === "string") return error.trim();
    const nested = error.error;
    const candidates = [
      error.message,
      typeof nested === "string" ? nested : nested?.message,
      nested?.error,
      error.code,
    ];
    const found = candidates.find((value) => typeof value === "string" && value.trim());
    return found ? found.trim() : "";
  }

  function isAudioFormatError(error) {
    const lower = getErrorText(error).toLowerCase();
    return /corrupt|unrecognized file format|unsupported (audio|media) format|audio file might be|invalid.*audio/.test(
      lower,
    );
  }

  function shouldRetryWithWhisper(error, model) {
    return ["gpt-4o-mini-transcribe", "gpt-4o-transcribe"].includes(model) && isAudioFormatError(error);
  }

  function setAudioFile(file) {
    if (state.isProcessing) {
      showToast("تا پایان پردازش، فایل جدیدی انتخاب نکنید.", true);
      return;
    }
    if (!isAudioFile(file)) {
      showToast("لطفاً یک فایل صوتی معتبر انتخاب کنید.", true);
      return;
    }

    if (state.isRecording) {
      showToast("ابتدا ضبط فعلی را پایان دهید، سپس فایل دیگری انتخاب کنید.", true);
      return;
    }
    clearAudioFile({ preserveStatus: true });

    state.file = file;
    state.fileUrl = URL.createObjectURL(file);
    elements.fileName.textContent = file.name || "صدای ضبط‌شده";
    elements.fileMeta.textContent = `${getFileExtension(file)}  •  ${formatBytes(file.size)}`;
    elements.audioPreview.src = state.fileUrl;
    elements.audioPreview.load();
    elements.audioDuration.textContent = "--:--";
    elements.audioFileCard.classList.remove("is-hidden");
    elements.transcribeButton.disabled = false;
    setResultState("is-ready", "صدا آماده است");
    hideError();
    makeMiniWave(file.name || String(file.size));

    const fileDescriptor = file.name ? `«${truncate(file.name, 36)}»` : "صدای ضبط‌شده";
    showToast(`${fileDescriptor} برای تبدیل آماده است.`);
  }

  function clearAudioFile({ preserveStatus = false } = {}) {
    if (state.isProcessing) {
      showToast("فایل در حال پردازش است و فعلاً قابل حذف نیست.", true);
      return;
    }
    if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
    state.fileUrl = null;
    state.file = null;
    elements.audioPreview.pause();
    elements.audioPreview.removeAttribute("src");
    elements.audioPreview.load();
    resetAudioPlaying();
    elements.audioFileCard.classList.add("is-hidden");
    elements.transcribeButton.disabled = true;

    if (!preserveStatus && !state.lastTranscript) {
      setResultState("", "در انتظار صدا");
    }
  }

  function updateFileMeta(duration) {
    if (!state.file) return;
    const base = `${getFileExtension(state.file)}  •  ${formatBytes(state.file.size)}`;
    elements.fileMeta.textContent = `${base}  •  ${formatDuration(duration)}`;
  }

  function getFileExtension(file) {
    const extension = (file.name || "").split(".").pop();
    return extension && extension !== file.name ? extension.toUpperCase() : "AUDIO";
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, unit);
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    const wholeSeconds = Math.floor(seconds);
    const hours = Math.floor(wholeSeconds / 3600);
    const minutes = Math.floor((wholeSeconds % 3600) / 60);
    const remainingSeconds = wholeSeconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
    }
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function formatPersianClock(seconds) {
    return toPersianDigits(formatDuration(seconds));
  }

  function toPersianDigits(value) {
    const digits = "۰۱۲۳۴۵۶۷۸۹";
    return String(value).replace(/\d/g, (digit) => digits[Number(digit)]);
  }

  function truncate(value, limit) {
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  }

  function makeMiniWave(seedValue) {
    let seed = 0;
    const seedText = String(seedValue || "audio");
    for (let index = 0; index < seedText.length; index += 1) {
      seed = (seed * 31 + seedText.charCodeAt(index)) >>> 0;
    }

    elements.miniWave.replaceChildren();
    for (let index = 0; index < 52; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const random = seed / 4294967296;
      const bar = document.createElement("i");
      const centerBoost = Math.sin((index / 51) * Math.PI) * 8;
      bar.style.height = `${Math.round(5 + random * 16 + centerBoost)}px`;
      bar.style.setProperty("--i", index);
      elements.miniWave.append(bar);
    }
  }

  async function toggleAudioPlayback() {
    if (!state.file) return;
    if (!elements.audioPreview.paused) {
      elements.audioPreview.pause();
      return;
    }

    try {
      await elements.audioPreview.play();
    } catch (error) {
      showToast("پخش این فایل در مرورگر ممکن نشد.", true);
      console.warn("Audio preview failed", error);
    }
  }

  function setAudioPlaying() {
    elements.audioFileCard.classList.add("is-playing");
    elements.playIcon.innerHTML = pausePath;
    elements.playAudio.setAttribute("aria-label", "توقف پخش فایل صوتی");
  }

  function resetAudioPlaying() {
    elements.audioFileCard.classList.remove("is-playing");
    elements.playIcon.innerHTML = playPath;
    elements.playAudio.setAttribute("aria-label", "پخش فایل صوتی");
    if (Number.isFinite(elements.audioPreview.duration)) {
      elements.audioDuration.textContent = formatDuration(elements.audioPreview.duration);
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showToast("مرورگر شما از ضبط صدا پشتیبانی نمی‌کند. لطفاً فایل صوتی بارگذاری کنید.", true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      clearAudioFile({ preserveStatus: true });
      state.stream = stream;
      state.recorder = recorder;
      state.recordingChunks = [];
      state.recordingStartedAt = Date.now();
      state.isRecording = true;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) state.recordingChunks.push(event.data);
      });

      recorder.addEventListener("stop", () => {
        const recordingType = recorder.mimeType || "audio/webm";
        const cleanType = recordingType.split(";")[0].trim() || "audio/webm";
        const extension = cleanType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(state.recordingChunks, { type: cleanType });
        resetRecordingUI();
        stopStreamTracks();

        if (blob.size < 200) {
          showToast("ضبط قابل استفاده‌ای ثبت نشد. لطفاً دوباره تلاش کنید.", true);
          return;
        }

        const recordedFile = new File([blob], `ضبط-${fileDateStamp()}.${extension}`, { type: cleanType });
        setAudioFile(recordedFile);
        elements.recordHint.textContent = "ضبط شما برای تبدیل آماده است";
      });

      recorder.addEventListener("error", (event) => {
        console.error("Recorder error", event);
        resetRecordingUI();
        stopStreamTracks();
        showToast("هنگام ضبط صدا مشکلی پیش آمد. دوباره تلاش کنید.", true);
      });

      recorder.start(250);
      setRecordingUI();
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      showToast(
        denied
          ? "اجازه استفاده از میکروفون داده نشد. از تنظیمات مرورگر اجازه بدهید یا فایل بارگذاری کنید."
          : "میکروفون در دسترس نیست. یک فایل صوتی انتخاب کنید.",
        true,
      );
      console.warn("Microphone unavailable", error);
    }
  }

  function getRecordingMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
  }

  function stopRecording() {
    if (!state.recorder || state.recorder.state === "inactive") return;
    elements.recordHint.textContent = "در حال آماده‌سازی ضبط…";
    elements.recordButton.disabled = true;
    state.recorder.stop();
  }

  function setRecordingUI() {
    elements.recordCard.classList.add("is-recording");
    elements.recordButton.setAttribute("aria-pressed", "true");
    elements.recordButtonText.textContent = "پایان ضبط";
    elements.recordHint.textContent = "ضبط در حال انجام است…";
    elements.recordTimer.textContent = "00:00";
    state.recordingTimer = window.setInterval(() => {
      const elapsed = (Date.now() - state.recordingStartedAt) / 1000;
      elements.recordTimer.textContent = formatDuration(elapsed);
    }, 300);
  }

  function resetRecordingUI() {
    state.isRecording = false;
    state.recorder = null;
    window.clearInterval(state.recordingTimer);
    state.recordingTimer = null;
    elements.recordCard.classList.remove("is-recording");
    elements.recordButton.disabled = false;
    elements.recordButton.setAttribute("aria-pressed", "false");
    elements.recordButtonText.textContent = "شروع ضبط";
    elements.recordTimer.textContent = "00:00";
  }

  function stopStreamTracks() {
    if (!state.stream) return;
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  function getOutputStyle() {
    return elements.outputStyleInputs.find((input) => input.checked)?.value || "plain";
  }

  function updateSettingsUI() {
    const style = getOutputStyle();
    const translate = elements.translateToggle.checked;
    let note = "مدل انتخاب‌شده برای خروجی متن ساده استفاده می‌شود.";
    let forceModel = false;

    if (style === "timestamps") {
      forceModel = true;
      note = "برای بازه‌های زمانی، Whisper به‌صورت خودکار استفاده می‌شود.";
    }
    if (style === "speakers") {
      forceModel = true;
      note = translate
        ? "GPT-4o Diarize برای تفکیک گوینده و ترجمه انگلیسی به‌صورت خودکار استفاده می‌شود."
        : "GPT-4o Diarize برای تشخیص گوینده‌ها به‌صورت خودکار استفاده می‌شود.";
    }
    if (translate && style !== "speakers") {
      forceModel = true;
      note = style === "timestamps"
        ? "Whisper زمان هر بخش را در خروجی انگلیسی نمایش می‌دهد."
        : "Whisper برای ترجمه گفتار فارسی به انگلیسی به‌صورت خودکار استفاده می‌شود.";
    }

    elements.modelSelect.disabled = forceModel;
    elements.settingsNote.textContent = note;
  }

  function resetSettings() {
    elements.modelSelect.value = "gpt-4o-mini-transcribe";
    elements.outputStyleInputs.find((input) => input.value === "plain").checked = true;
    elements.translateToggle.checked = false;
    updateSettingsUI();
    showToast("تنظیمات به حالت پیشنهادی برگشت.");
  }

  function buildTranscriptionOptions() {
    const style = getOutputStyle();
    const translate = elements.translateToggle.checked;
    let model = elements.modelSelect.value;
    const options = { language: "fa" };

    if (style === "speakers") {
      model = "gpt-4o-transcribe-diarize";
      options.response_format = "diarized_json";
      options.chunking_strategy = "auto";
    } else if (style === "timestamps") {
      model = "whisper-1";
      options.response_format = "verbose_json";
      options.timestamp_granularities = ["segment"];
    } else if (translate) {
      model = "whisper-1";
      options.response_format = "json";
    } else {
      options.response_format = "json";
    }

    options.model = model;
    if (translate) options.translate = true;
    return options;
  }

  async function transcribeAudio() {
    if (state.isProcessing) return;
    if (!state.file) {
      showToast("اول یک فایل صوتی انتخاب کنید یا صدایتان را ضبط کنید.", true);
      return;
    }
    if (!window.puter?.ai?.speech2txt) {
      updatePuterStatus();
      showError("Puter.js بارگذاری نشد. اتصال اینترنت را بررسی کنید و صفحه را دوباره باز کنید.");
      showToast("اتصال به Puter.js برقرار نیست.", true);
      return;
    }

    const options = buildTranscriptionOptions();
    beginProcessing();

    try {
      const source = await prepareSpeechSource(state.file);
      const payload = { file: source, ...options };
      let result;
      try {
        result = await window.puter.ai.speech2txt(payload);
      } catch (error) {
        if (!shouldRetryWithWhisper(error, options.model)) throw error;
        result = await window.puter.ai.speech2txt({
          ...payload,
          model: "whisper-1",
          response_format: options.response_format === "json" ? "json" : "verbose_json",
        });
      }
      finishProcessing();
      const transcript = extractTranscript(result);
      const segments = extractSegments(result);

      if (!transcript) {
        throw new Error("متنی از فایل صوتی دریافت نشد.");
      }

      state.lastTranscript = transcript;
      state.lastSegments = segments;
      state.lastStyle = getOutputStyle();
      showTranscript(transcript, segments, state.lastStyle);
      addHistoryEntry({
        transcript,
        title: state.file?.name || "رونوشت جدید",
        style: state.lastStyle,
      });
      showToast("رونوشت با موفقیت آماده شد.");
    } catch (error) {
      finishProcessing();
      const message = getFriendlyError(error);
      showError(message);
      setResultState("is-error", "پردازش ناموفق بود");
      elements.resultEmpty.classList.remove("is-hidden");
      showToast(message, true);
      console.error("Puter transcription failed", error);
    }
  }

  function extractTranscript(result) {
    if (typeof result === "string") return result.trim();
    if (typeof result?.text === "string" && result.text.trim()) return result.text.trim();
    if (Array.isArray(result?.segments)) {
      return result.segments
        .map((segment) => segment?.text || segment?.transcript || "")
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    if (Array.isArray(result?.words)) {
      return result.words
        .map((word) => word?.word || word?.text || "")
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    return "";
  }

  function extractSegments(result) {
    if (!result || typeof result === "string") return [];
    if (Array.isArray(result.segments)) {
      return result.segments
        .map((segment) => ({
          text: String(segment?.text || segment?.transcript || "").trim(),
          speaker: segment?.speaker,
          start: Number(segment?.start),
          end: Number(segment?.end),
        }))
        .filter((segment) => segment.text);
    }
    return [];
  }

  function beginProcessing() {
    state.isProcessing = true;
    hideError();
    elements.transcribeButton.disabled = true;
    elements.transcribeButton.classList.add("is-processing");
    elements.transcribeButtonText.textContent = "در حال تبدیل…";
    elements.resultEmpty.classList.add("is-hidden");
    elements.transcriptArea.classList.add("is-hidden");
    elements.segmentsPanel.classList.add("is-hidden");
    elements.processingState.classList.remove("is-hidden");
    setResultState("is-processing", "در حال پردازش");
    setProcessingStage(0);

    clearProcessingTimers();
    state.processingTimers = [
      window.setTimeout(() => setProcessingStage(1), 900),
      window.setTimeout(() => setProcessingStage(2), 3000),
      window.setTimeout(() => {
        elements.progressBar.style.width = "91%";
        elements.processingDescription.textContent = "کمی بیشتر زمان لازم است؛ رونوشت در حال نهایی‌شدن است.";
      }, 6500),
    ];
  }

  function setProcessingStage(stage) {
    const stages = [
      { title: "در حال آماده‌سازی فایل…", description: "فایل صوتی برای پردازش امن آماده می‌شود.", progress: "18%" },
      { title: "در حال تشخیص گفتار فارسی…", description: "Puter.js در حال تبدیل صدای شما به متن است.", progress: "54%" },
      { title: "در حال ساخت رونوشت نهایی…", description: "متن و جزئیات انتخاب‌شده مرتب می‌شوند.", progress: "80%" },
    ];
    const current = stages[stage] || stages[0];
    elements.processingTitle.textContent = current.title;
    elements.processingDescription.textContent = current.description;
    elements.progressBar.style.width = current.progress;
    elements.processingSteps.forEach((step, index) => {
      step.classList.toggle("is-active", index <= stage);
    });
  }

  function finishProcessing() {
    state.isProcessing = false;
    clearProcessingTimers();
    elements.processingState.classList.add("is-hidden");
    elements.transcribeButton.disabled = !state.file;
    elements.transcribeButton.classList.remove("is-processing");
    elements.transcribeButtonText.textContent = "تبدیل صدا به متن";
  }

  function clearProcessingTimers() {
    state.processingTimers.forEach((timer) => window.clearTimeout(timer));
    state.processingTimers = [];
  }

  function showTranscript(transcript, segments = [], style = "plain") {
    hideError();
    elements.resultEmpty.classList.add("is-hidden");
    elements.processingState.classList.add("is-hidden");
    elements.transcriptArea.classList.remove("is-hidden");
    elements.transcriptText.value = transcript;
    elements.copyButton.disabled = false;
    elements.downloadButton.disabled = false;
    setResultState("is-ready", "رونوشت آماده است");
    updateTranscriptStats();
    renderSegments(segments, style);
  }

  function updateTranscriptStats() {
    const text = elements.transcriptText.value.trim();
    const words = text ? text.split(/\s+/u).filter(Boolean).length : 0;
    elements.wordCount.textContent = `${persianNumber.format(words)} واژه`;
    elements.characterCount.textContent = `${persianNumber.format(text.length)} نویسه`;
  }

  function renderSegments(segments, style) {
    elements.segmentsList.replaceChildren();
    if (!segments.length || style === "plain") {
      elements.segmentsPanel.classList.add("is-hidden");
      return;
    }

    const isSpeakerView = style === "speakers";
    const speakerNumbers = new Map();
    elements.segmentsTitle.textContent = isSpeakerView ? "گوینده‌های شناسایی‌شده" : "بازه‌های زمانی";
    elements.segmentsCount.textContent = `${persianNumber.format(segments.length)} بخش`;

    segments.forEach((segment) => {
      const row = document.createElement("div");
      row.className = "segment-row";
      const label = document.createElement("span");
      label.className = "segment-label";
      const dot = document.createElement("i");
      label.append(dot);

      if (isSpeakerView && segment.speaker !== undefined && segment.speaker !== null) {
        const rawSpeaker = String(segment.speaker);
        if (!speakerNumbers.has(rawSpeaker)) speakerNumbers.set(rawSpeaker, speakerNumbers.size + 1);
        label.append(`گوینده ${persianNumber.format(speakerNumbers.get(rawSpeaker))}`);
      } else {
        label.classList.add("time-label");
        const start = Number.isFinite(segment.start) ? formatPersianClock(segment.start) : "--:--";
        const end = Number.isFinite(segment.end) ? formatPersianClock(segment.end) : "--:--";
        label.append(`${start} — ${end}`);
      }

      const text = document.createElement("span");
      text.className = "segment-text";
      text.textContent = segment.text;
      row.append(label, text);
      elements.segmentsList.append(row);
    });

    elements.segmentsPanel.classList.remove("is-hidden");
  }

  function setResultState(type, message) {
    elements.resultState.className = `ready-state ${type}`.trim();
    const marker = document.createElement("i");
    elements.resultState.replaceChildren(marker, document.createTextNode(` ${message}`));
  }

  function showError(message) {
    elements.resultError.textContent = message;
    elements.resultError.classList.remove("is-hidden");
  }

  function hideError() {
    elements.resultError.textContent = "";
    elements.resultError.classList.add("is-hidden");
  }

  function getFriendlyError(error) {
    const original = getErrorText(error);
    const lower = original.toLowerCase();
    if (/sign.?in|login|auth|permission|unauthori[sz]ed/.test(lower)) {
      return "برای ادامه، درخواست ورود یا تأیید Puter را در مرورگر کامل کنید و دوباره تلاش کنید.";
    }
    if (isAudioFormatError(error) || /unrecognized file format/.test(lower)) {
      return "این فرمت صوتی پشتیبانی نشد. MP3، WAV، M4A، OGG یا WEBM را امتحان کنید.";
    }
    if (/network|fetch|internet|offline|failed to fetch/.test(lower)) {
      return "ارتباط با سرویس برقرار نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.";
    }
    if (/too large|size|limit/.test(lower)) {
      return "حجم فایل برای پردازش مناسب نیست. فایل کوتاه‌تر یا کم‌حجم‌تری امتحان کنید.";
    }
    if (original && original.length < 135 && !/[<>]/.test(original) && original !== "[object Object]") {
      return `تبدیل صدا انجام نشد: ${original}`;
    }
    return "تبدیل صدا انجام نشد. چند لحظه بعد دوباره تلاش کنید.";
  }

  async function copyTranscript() {
    const text = elements.transcriptText.value.trim();
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        elements.transcriptText.focus();
        elements.transcriptText.select();
        document.execCommand("copy");
        window.getSelection()?.removeAllRanges();
      }
      showToast("رونوشت در کلیپ‌بورد کپی شد.");
    } catch (error) {
      showToast("کپی خودکار ممکن نشد؛ متن را انتخاب و کپی کنید.", true);
      console.warn("Copy failed", error);
    }
  }

  function downloadTranscript() {
    const text = elements.transcriptText.value.trim();
    if (!text) return;
    const blob = new Blob(["\ufeff", text], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `رونوشت-${fileDateStamp()}.txt`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    showToast("فایل متنی برای دانلود آماده شد.");
  }

  function fileDateStamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  }

  function addHistoryEntry({ transcript, title, style }) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: stripFileExtension(title) || "رونوشت جدید",
      transcript,
      style,
      createdAt: Date.now(),
    };
    state.history = [entry, ...state.history].slice(0, MAX_HISTORY_ITEMS);
    persistHistory();
    renderHistory();
  }

  function stripFileExtension(value) {
    return String(value || "").replace(/\.[a-z0-9]{2,5}$/i, "");
  }

  function loadHistory() {
    try {
      const value = localStorage.getItem(HISTORY_KEY);
      const parsed = value ? JSON.parse(value) : [];
      state.history = Array.isArray(parsed)
        ? parsed.filter(isValidHistoryEntry).slice(0, MAX_HISTORY_ITEMS)
        : [];
    } catch (error) {
      state.history = [];
      console.warn("Could not read transcript history", error);
    }
    renderHistory();
  }

  function isValidHistoryEntry(entry) {
    return entry && typeof entry.id === "string" && typeof entry.transcript === "string";
  }

  function persistHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
    } catch (error) {
      // Storage can be unavailable in private contexts or full. The current transcript still works.
      console.warn("Could not save transcript history", error);
    }
  }

  function renderHistory() {
    elements.historyList.replaceChildren();
    const hasHistory = state.history.length > 0;
    elements.historyEmpty.classList.toggle("is-hidden", hasHistory);
    elements.clearHistory.classList.toggle("is-hidden", !hasHistory);

    state.history.forEach((entry) => {
      const listItem = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.dataset.historyId = entry.id;
      button.title = "باز کردن این رونوشت";

      const main = document.createElement("span");
      main.className = "history-main";
      const title = document.createElement("span");
      title.className = "history-title";
      title.textContent = entry.title || "رونوشت جدید";
      const preview = document.createElement("span");
      preview.className = "history-preview";
      preview.textContent = entry.transcript;
      main.append(title, preview);

      const date = document.createElement("span");
      date.className = "history-date";
      date.textContent = getHistoryDate(entry.createdAt);
      button.append(main, date);
      listItem.append(button);
      elements.historyList.append(listItem);
    });
  }

  function getHistoryDate(timestamp) {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return "";
    return persianDate.format(date);
  }

  function restoreHistoryItem(entry) {
    state.lastTranscript = entry.transcript;
    state.lastSegments = [];
    state.lastStyle = entry.style || "plain";
    showTranscript(entry.transcript, [], "plain");
    setResultState("is-ready", "رونوشت بایگانی‌شده");
    showToast("رونوشت از بایگانی محلی باز شد.");
    document.getElementById("workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearHistory() {
    state.history = [];
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (error) {
      console.warn("Could not clear transcript history", error);
    }
    renderHistory();
    showToast("بایگانی محلی پاک شد.");
  }

  let toastTimer;
  function showToast(message, isError = false) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("is-error", isError);
    elements.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 4300);
  }

  init();
})();
