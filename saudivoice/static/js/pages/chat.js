import { fetchJson } from "../core/http.js";
import {
  DIALECT_NAMES,
  getVoiceSelection,
  selectionIsValid,
} from "../core/session.js";

const $ = (selector) => document.querySelector(selector);
const selection = getVoiceSelection();

if (!selectionIsValid(selection)) {
  location.replace("/?step=gender");
}

class RealtimeVoiceController {
  constructor({ gender, dialect }) {
    this.gender = gender;
    this.dialect = dialect;
    this.isFemale = gender === "female";

    this.pc = null;
    this.channel = null;
    this.localStream = null;
    this.remoteAudio = null;

    this.connectionReady = false;
    this.welcomeFinished = false;
    this.micMuted = false;
    this.assistantBusy = false;

    this.currentResponseId = "";
    this.currentAssistantKey = "";
    this.assistantTranscript = "";
    this.turnStoppedAt = 0;
    this.reconnectTimer = null;

    this.userTranscripts = new Map();
    this.messageElements = new Map();

    this.ui = {
      card: $("#chat"),
      assistantName: $("#assistantName"),
      badge: $("#badge"),
      voiceStatus: $("#voiceStatus"),
      connectionStatus: $("#headerStatus"),
      mic: $("#mic"),
      stopReply: $("#stopReply"),
      listen: $("#listen"),
      endSession: $("#endSession"),
      form: $("#messageForm"),
      input: $("#messageInput"),
      send: $("#sendMessage"),
      transcriptPanel: $("#transcriptPanel"),
      transcriptToggle: $("#transcriptToggle"),
      messages: $("#conversationMessages"),
      empty: $("#conversationEmpty"),
      transcriptStatus: $(".transcript-status"),
    };

    this.welcome = new Audio(
      `/api/welcome/${dialect}/${gender}`
    );

    this.welcome.preload = "auto";

    this.bindUi();
  }

  async start() {
    this.renderProfile();

    this.setState(
      "",
      this.isFemale
        ? "اسمحي باستخدام الميكروفون مرة واحدة"
        : "اسمح باستخدام الميكروفون مرة واحدة"
    );

    await Promise.allSettled([
      this.connect(),
      this.playWelcome(),
    ]);

    this.activateListeningIfReady();
  }

  bindUi() {
    this.ui.stopReply.addEventListener(
      "click",
      () => this.stopAssistant()
    );

    this.ui.mic.addEventListener(
      "click",
      () => this.toggleMicrophone()
    );

    this.ui.endSession.addEventListener(
      "click",
      () => this.end()
    );

    this.ui.form?.addEventListener(
      "submit",
      (event) => this.sendTextMessage(event)
    );

    this.ui.transcriptToggle?.addEventListener(
      "click",
      () => this.toggleTranscript()
    );

    this.ui.listen.addEventListener(
      "click",
      async () => {
        if (this.remoteAudio?.srcObject) {
          await this.remoteAudio.play();
          this.ui.listen.hidden = true;
        } else {
          await this.playWelcome();
        }
      }
    );

    this.welcome.addEventListener(
      "ended",
      () => {
        this.welcomeFinished = true;
        this.activateListeningIfReady();
      }
    );

    this.welcome.addEventListener(
      "error",
      () => {
        console.warn(
          "Welcome audio could not be played."
        );

        this.welcomeFinished = true;
        this.activateListeningIfReady();
      }
    );

    window.addEventListener(
      "beforeunload",
      () => this.destroy()
    );
  }

  renderProfile() {
    this.ui.assistantName.textContent =
      this.isFemale
        ? "المساعدة السعودية"
        : "المساعد السعودي";

    this.ui.badge.textContent =
      DIALECT_NAMES[this.dialect];
  }

  async connect() {
    try {
      this.ui.connectionStatus.textContent =
        "جاري فتح الاتصال الصوتي";

      const query = new URLSearchParams({
        mode: "chat",
        dialect: this.dialect,
        gender: this.gender,
      });

      const token = await fetchJson(
        `/api/realtime/session?${query}`
      );

      this.pc = new RTCPeerConnection();

      this.remoteAudio = Object.assign(
        document.createElement("audio"),
        {
          autoplay: true,
          playsInline: true,
          preload: "auto",
          volume: 1,
        }
      );

      document.body.appendChild(
        this.remoteAudio
      );

      this.pc.addEventListener(
        "track",
        (event) => this.attachRemoteAudio(event)
      );

      this.pc.addEventListener(
        "connectionstatechange",
        () => this.handleConnectionState()
      );

      this.localStream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });

      this.setMicCapture(false);

      this.localStream
        .getAudioTracks()
        .forEach((track) => {
          this.pc.addTrack(
            track,
            this.localStream
          );
        });

      this.channel =
        this.pc.createDataChannel("oai-events");

      this.channel.addEventListener(
        "open",
        () => {
          this.connectionReady = true;

          this.ui.connectionStatus.textContent =
            "متصل الآن";

          this.activateListeningIfReady();
        }
      );

      this.channel.addEventListener(
        "close",
        () => {
          this.connectionReady = false;
          this.updateControls();
        }
      );

      this.channel.addEventListener(
        "message",
        (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleRealtimeEvent(data);
          } catch (error) {
            console.warn(
              "Invalid realtime event",
              error
            );
          }
        }
      );

      const offer =
        await this.pc.createOffer();

      await this.pc.setLocalDescription(
        offer
      );

      const response = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization:
              `Bearer ${token.value}`,
            "Content-Type":
              "application/sdp",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          await response.text()
        );
      }

      const answer =
        await response.text();

      await this.pc.setRemoteDescription({
        type: "answer",
        sdp: answer,
      });

      this.pc
        .getReceivers()
        .forEach((receiver) => {
          this.stabilizeReceiver(receiver);
        });
    } catch (error) {
      console.error(
        "Realtime connection failed",
        error
      );

      this.showError(
        error.message ||
        "تعذّر تشغيل المحادثة الصوتية"
      );
    }
  }

  async playWelcome() {
    this.ui.listen.hidden = true;
    this.ui.mic.disabled = true;

    const message = this.isFemale
      ? "المساعدة ترحّب بك الآن"
      : "المساعد يرحّب بك الآن";

    this.setState("speaking", message);

    try {
      this.welcome.currentTime = 0;
      await this.welcome.play();
    } catch {
      this.ui.connectionStatus.textContent =
        "المتصفح ينتظر ضغطة واحدة";

      this.setState(
        "",
        "اضغط تشغيل الترحيب"
      );

      this.ui.listen.textContent =
        "تشغيل الترحيب";

      this.ui.listen.hidden = false;
    }
  }

  async attachRemoteAudio(event) {
    this.stabilizeReceiver(
      event.receiver
    );

    this.remoteAudio.srcObject =
      event.streams[0] ||
      new MediaStream([event.track]);

    try {
      await this.remoteAudio.play();
    } catch {
      this.ui.listen.textContent =
        "تشغيل صوت المساعد";

      this.ui.listen.hidden = false;
    }
  }

  stabilizeReceiver(receiver) {
    try {
      receiver.jitterBufferTarget = 1000;
    } catch {}

    try {
      receiver.playoutDelayHint = 1;
    } catch {}
  }

  handleRealtimeEvent(data) {
    switch (data.type) {
      case "input_audio_buffer.speech_started":
        if (!this.assistantBusy) {
          this.setState(
            "listening",
            "أستمع لك..."
          );
        }
        break;

      case "input_audio_buffer.speech_stopped":
        if (!this.assistantBusy) {
          this.turnStoppedAt =
            performance.now();

          this.setMicCapture(false);

          this.setState(
            "",
            "جارٍ تجهيز الرد"
          );

          if (data.item_id) {
            this.showMessage(
              data.item_id,
              "user",
              "جارٍ تحويل كلامك إلى نص..."
            );
          }
        }
        break;

      case "conversation.item.input_audio_transcription.delta":
        this.updateUserTranscript(
          data.item_id,
          data.delta || ""
        );
        break;

      case "conversation.item.input_audio_transcription.completed":
        this.finishUserTranscript(
          data.item_id,
          data.transcript || ""
        );
        break;

      case "conversation.item.input_audio_transcription.failed":
        this.showMessage(
          data.item_id,
          "user",
          "تعذّر تحويل الكلام إلى نص"
        );
        break;

      case "response.created":
        this.currentResponseId =
          data.response?.id || "";

        this.currentAssistantKey =
          `assistant-${this.currentResponseId || Date.now()}`;

        this.assistantTranscript = "";
        this.setAssistantBusy(true);
        break;

      case "response.output_audio.delta":
      case "output_audio_buffer.started":
        this.handleAudioStarted();
        break;

      case "response.output_audio_transcript.delta":
        this.assistantTranscript +=
          data.delta || "";

        this.showMessage(
          this.currentAssistantKey,
          "assistant",
          this.assistantTranscript
        );
        break;

      case "response.output_audio_transcript.done":
        this.assistantTranscript =
          data.transcript ||
          this.assistantTranscript;

        this.showMessage(
          this.currentAssistantKey,
          "assistant",
          this.assistantTranscript
        );
        break;

      case "output_audio_buffer.stopped":
        this.finishAssistantTurn();
        break;

      case "response.done":
        this.handleResponseDone(
          data.response
        );
        break;

      case "error": {
        const eventId = String(
          data.error?.event_id ||
          data.event_id ||
          ""
        );

        if (
          !eventId.startsWith(
            "chat-control-"
          )
        ) {
          this.showError(
            data.error?.message ||
            "حدث خطأ في الجلسة الصوتية"
          );
        }
        break;
      }
    }
  }

  updateUserTranscript(itemId, delta) {
    if (!itemId) return;

    const text =
      (this.userTranscripts.get(itemId) || "") +
      delta;

    this.userTranscripts.set(
      itemId,
      text
    );

    this.showMessage(
      itemId,
      "user",
      text
    );
  }

  finishUserTranscript(
    itemId,
    transcript
  ) {
    if (!itemId) return;

    const text =
      transcript ||
      this.userTranscripts.get(itemId) ||
      "لم يتم التقاط النص";

    this.userTranscripts.set(
      itemId,
      text
    );

    this.showMessage(
      itemId,
      "user",
      text
    );
  }

  handleAudioStarted() {
    if (this.turnStoppedAt) {
      const latency = Math.round(
        performance.now() -
        this.turnStoppedAt
      );

      console.info(
        `SaudiVoice latency: ${latency} ms`
      );

      this.turnStoppedAt = 0;
    }

    this.setAssistantBusy(true);

    this.setState(
      "speaking",
      this.isFemale
        ? "المساعدة تتحدث الآن"
        : "المساعد يتحدث الآن"
    );
  }

  handleResponseDone(response) {
    console.info(
      "Realtime response status",
      response?.status,
      response?.status_details || ""
    );

    const finalText =
      this.extractAssistantText(response);

    if (finalText) {
      this.showMessage(
        this.currentAssistantKey,
        "assistant",
        finalText
      );
    }

    const failedStatuses = [
      "failed",
      "cancelled",
      "incomplete",
    ];

    if (
      failedStatuses.includes(
        response?.status
      )
    ) {
      this.finishAssistantTurn(
        "انتهى الرد قبل اكتماله، يمكنك إعادة السؤال"
      );
    }
  }

  extractAssistantText(response) {
    const text = response?.output
      ?.flatMap((item) => item.content || [])
      .map((part) =>
        part.transcript ||
        part.text ||
        ""
      )
      .filter(Boolean)
      .join(" ");

    return text ||
      this.assistantTranscript;
  }

  sendTextMessage(event) {
    event.preventDefault();

    const text =
      this.ui.input.value.trim();

    if (
      !text ||
      this.assistantBusy
    ) {
      return;
    }

    const sent = this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text,
          },
        ],
      },
    });

    if (!sent) return;

    this.showMessage(
      `user-${Date.now()}`,
      "user",
      text
    );

    this.ui.input.value = "";

    this.setAssistantBusy(true);

    this.setState(
      "",
      "جارٍ تجهيز الرد"
    );

    this.sendEvent({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
      },
    });
  }

  sendEvent(data) {
    if (
      this.channel?.readyState !== "open"
    ) {
      return false;
    }

    this.channel.send(
      JSON.stringify(data)
    );

    return true;
  }

  showMessage(key, role, text) {
    if (!key || !text) return;

    this.ui.empty?.remove();

    let bubble =
      this.messageElements.get(key);

    if (!bubble) {
      const message =
        document.createElement("article");

      message.className =
        `chat-message ${role}`;

      const author =
        document.createElement("span");

      author.className =
        "message-author";

      author.textContent =
        role === "user"
          ? "أنت"
          : this.ui.assistantName.textContent;

      bubble =
        document.createElement("p");

      bubble.className =
        "message-bubble";

      const time =
        document.createElement("time");

      time.className =
        "message-time";

      time.textContent =
        new Date().toLocaleTimeString(
          "ar-SA",
          {
            hour: "2-digit",
            minute: "2-digit",
          }
        );

      message.append(
        author,
        bubble,
        time
      );

      this.ui.messages.appendChild(
        message
      );

      this.messageElements.set(
        key,
        bubble
      );
    }

    bubble.textContent = text;

    this.ui.messages.scrollTop =
      this.ui.messages.scrollHeight;
  }

  toggleTranscript() {
    const hidden =
      !this.ui.messages.hidden;

    this.ui.messages.hidden = hidden;

    if (this.ui.transcriptStatus) {
      this.ui.transcriptStatus.hidden =
        hidden;
    }

    this.ui.transcriptToggle.textContent =
      hidden ? "إظهار" : "إخفاء";

    this.ui.transcriptToggle.setAttribute(
      "aria-expanded",
      String(!hidden)
    );
  }

  setAssistantBusy(busy) {
    this.assistantBusy = busy;

    this.setMicCapture(
      !busy &&
      this.connectionReady &&
      this.welcomeFinished
    );

    this.ui.stopReply.hidden = !busy;

    this.updateControls();
  }

  updateControls() {
    const ready =
      this.connectionReady &&
      this.welcomeFinished &&
      !this.assistantBusy;

    this.ui.mic.disabled = !ready;

    if (this.ui.input) {
      this.ui.input.disabled = !ready;
    }

    if (this.ui.send) {
      this.ui.send.disabled = !ready;
    }
  }

  activateListeningIfReady() {
    if (
      !this.connectionReady ||
      !this.welcomeFinished ||
      this.assistantBusy
    ) {
      this.updateControls();
      return;
    }

    this.setMicCapture(true);
    this.updateControls();

    this.setState(
      "listening",
      this.isFemale
        ? "أستمع لك، تكلّمي الآن"
        : "أستمع لك، تكلّم الآن"
    );
  }

  finishAssistantTurn(
    message = ""
  ) {
    this.currentResponseId = "";
    this.currentAssistantKey = "";
    this.assistantTranscript = "";

    this.setAssistantBusy(false);

    if (message) {
      this.ui.connectionStatus.textContent =
        message;
    }

    this.activateListeningIfReady();
  }

  stopAssistant() {
    if (
      !this.assistantBusy ||
      this.channel?.readyState !== "open"
    ) {
      return;
    }

    const id =
      `chat-control-${Date.now()}`;

    const cancel = {
      type: "response.cancel",
      event_id: `${id}-cancel`,
    };

    if (this.currentResponseId) {
      cancel.response_id =
        this.currentResponseId;
    }

    this.sendEvent(cancel);

    this.sendEvent({
      type: "output_audio_buffer.clear",
      event_id: `${id}-clear`,
    });

    this.finishAssistantTurn();
  }

  toggleMicrophone() {
    this.micMuted =
      !this.micMuted;

    this.ui.mic.classList.toggle(
      "muted",
      this.micMuted
    );

    this.ui.mic.setAttribute(
      "aria-label",
      this.micMuted
        ? "تشغيل الميكروفون"
        : "كتم الميكروفون"
    );

    this.setMicCapture(
      !this.assistantBusy &&
      this.welcomeFinished
    );

    this.setState(
      this.micMuted
        ? ""
        : "listening",
      this.micMuted
        ? "الميكروفون مكتوم"
        : "أستمع لك الآن"
    );
  }

  setMicCapture(enabled) {
    this.localStream
      ?.getAudioTracks()
      .forEach((track) => {
        track.enabled =
          enabled &&
          !this.micMuted;
      });
  }

  setState(state, text) {
    this.ui.card.classList.remove(
      "listening",
      "speaking"
    );

    if (state) {
      this.ui.card.classList.add(state);
    }

    this.ui.voiceStatus.textContent =
      text;
  }

  handleConnectionState() {
    const state =
      this.pc?.connectionState;

    console.info(
      "WebRTC connection",
      state
    );

    if (state === "connected") {
      clearTimeout(
        this.reconnectTimer
      );
    }

    if (
      ["failed", "closed"].includes(state)
    ) {
      this.showError(
        "انقطع الاتصال الصوتي، ارجعي وابدئي الجلسة مرة أخرى"
      );
    }

    if (state === "disconnected") {
      this.reconnectTimer =
        setTimeout(() => {
          if (
            this.pc?.connectionState ===
            "disconnected"
          ) {
            this.showError(
              "الاتصال بالإنترنت غير مستقر"
            );
          }
        }, 2500);
    }
  }

  showError(message) {
    this.connectionReady = false;

    this.ui.connectionStatus.textContent =
      "تعذّر الاتصال";

    this.setState("", message);
    this.setAssistantBusy(false);
    this.updateControls();
  }

  end() {
    this.stopAssistant();
    this.destroy();

    location.href = "/?step=mode";
  }

  destroy() {
    clearTimeout(
      this.reconnectTimer
    );

    this.welcome.pause();

    this.localStream
      ?.getTracks()
      .forEach((track) => {
        track.stop();
      });

    this.channel?.close();
    this.pc?.close();
    this.remoteAudio?.remove();
  }
}

new RealtimeVoiceController(
  selection
).start();