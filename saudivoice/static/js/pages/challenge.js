import { fetchAudioBlob } from "../core/http.js";
import {
  DIALECT_NAMES,
  getVoiceSelection,
  selectionIsValid,
} from "../core/session.js";


const routeGender =
  document.querySelector("#challenge")
    ?.dataset.roomGender;

const savedSelection = getVoiceSelection();

const gender =
  ["male", "female"].includes(routeGender)
    ? routeGender
    : savedSelection.gender;

const selection = {
  gender,
  dialect: savedSelection.dialect,
};

if (!selectionIsValid(selection)) {
  location.replace("/?step=gender");
}

sessionStorage.setItem(
  "saudiVoiceGender",
  gender
);


class ChallengeController {
  constructor() {
    this.gender = gender;
    this.isFemale = gender === "female";

    this.questions = this.buildQuestions();
    this.totalRounds = this.questions.length;

    this.round = 0;
    this.score = 0;
    this.phase = "warming";

    this.currentQuestion = null;
    this.currentAudio = null;

    this.playbackToken = 0;

    this.audioCache = new Map();
    this.objectUrls = new Set();

    this.ui = {
      app: document.querySelector("#challenge"),

      round: document.querySelector("#round"),

      score: document.querySelector("#score"),

      progress: document.querySelector(
        "#progressFill"
      ),

      title: document.querySelector(
        "#challengeTitle"
      ),

      status: document.querySelector(
        "#challengeStatus"
      ),

      start: document.querySelector(
        "#startChallenge"
      ),

      replay: document.querySelector(
        "#replay"
      ),

      stop: document.querySelector(
        "#stopVoice"
      ),

      choices: document.querySelector(
        "#choices"
      ),

      feedback: document.querySelector(
        "#feedback"
      ),

      feedbackTitle: document.querySelector(
        "#feedbackTitle"
      ),

      feedbackText: document.querySelector(
        "#feedbackText"
      ),

      next: document.querySelector(
        "#next"
      ),

      result: document.querySelector(
        "#result"
      ),

      soundVisual: document.querySelector(
        "#challengeAvatar"
      ),
    };
  }


  async initialize() {
    this.bindUi();

    if (!this.questions.length) {
      this.ui.start.disabled = true;

      this.ui.status.textContent =
        "تعذر تحميل أسئلة التحدي";

      return;
    }

    this.ui.start.disabled = true;

    this.ui.status.textContent =
      "جارٍ تجهيز الجولة الأولى...";

    try {
      const firstQuestion =
        this.questions[0];

      await this.getAudio(
        firstQuestion.text,
        firstQuestion.dialect,
        "question"
      );

      this.ui.status.textContent =
        "الصوت جاهز، ابدأ التحدي";

    } catch (error) {
      console.error(
        "Challenge warm-up failed",
        error
      );

      this.ui.status.textContent =
        "اضغط بدء التحدي للمحاولة مرة أخرى";
    }

    this.ui.start.disabled = false;
    this.phase = "waiting";

    this.warmRemainingAudio();
  }


  bindUi() {
    this.ui.start.addEventListener(
      "click",
      () => {
        if (this.phase !== "waiting") {
          return;
        }

        this.ui.start.hidden = true;

        this.startRound();
      }
    );


    this.ui.replay.addEventListener(
      "click",
      () => {
        if (
          this.phase !== "guess"
          || !this.currentQuestion
        ) {
          return;
        }

        this.phase = "sentence";

        this.ui.title.textContent =
          "استمع للجملة";

        this.playText(
          this.currentQuestion.text,
          this.currentQuestion.dialect,
          "question",
          () => this.finishQuestion()
        );
      }
    );


    this.ui.stop.addEventListener(
      "click",
      () => {
        const stoppedPhase =
          this.phase;

        this.releaseCurrentAudio();

        if (stoppedPhase === "sentence") {
          this.finishQuestion();

        } else if (
          stoppedPhase === "feedback"
        ) {
          this.finishFeedback();
        }
      }
    );


    document
      .querySelectorAll(".choice")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => this.answer(button)
        );
      });


    this.ui.next.addEventListener(
      "click",
      () => {
        if (this.phase !== "ready") {
          return;
        }

        this.releaseCurrentAudio();

        if (
          this.round
          === this.totalRounds - 1
        ) {
          this.showResult();
          return;
        }

        this.round += 1;

        this.startRound();
      }
    );


    const again =
      document.querySelector("#again");

    if (again) {
      again.addEventListener(
        "click",
        () => location.reload()
      );
    }


    window.addEventListener(
      "beforeunload",
      () => this.destroy()
    );
  }


  buildQuestions() {
    const bank =
      window.SAUDI_CHALLENGE_BANK
        ?.[this.gender];

    if (!bank) {
      return [];
    }

    const dialects =
      Object.keys(DIALECT_NAMES)
        .filter((dialect) => {
          return (
            Array.isArray(bank[dialect])
            && bank[dialect].length
          );
        });

    if (!dialects.length) {
      return [];
    }

    const questions = [];

    /*
     * سؤال واحد عشوائي من كل لهجة.
     */
    dialects.forEach((dialect) => {
      const dialectQuestions =
        bank[dialect];

      const randomIndex =
        Math.floor(
          Math.random()
          * dialectQuestions.length
        );

      questions.push({
        ...dialectQuestions[randomIndex],
        dialect,
      });
    });


    /*
     * نحتاج 5 أسئلة.
     * السؤال الخامس نختاره من إحدى
     * اللهجات بصورة عشوائية، مع تجنب
     * تكرار نفس الجملة قدر الإمكان.
     */
    if (
      questions.length > 0
      && questions.length < 5
    ) {
      const extraDialect =
        dialects[
          Math.floor(
            Math.random()
            * dialects.length
          )
        ];

      const usedTexts =
        new Set(
          questions.map(
            (question) =>
              question.text
          )
        );

      const available =
        bank[extraDialect]
          .filter(
            (question) =>
              !usedTexts.has(
                question.text
              )
          );

      const source =
        available.length
          ? available
          : bank[extraDialect];

      const extraQuestion =
        source[
          Math.floor(
            Math.random()
            * source.length
          )
        ];

      questions.push({
        ...extraQuestion,
        dialect: extraDialect,
      });
    }


    while (
      questions.length < 5
    ) {
      const extraDialect =
        dialects[
          Math.floor(
            Math.random()
            * dialects.length
          )
        ];

      const source =
        bank[extraDialect];

      const extraQuestion =
        source[
          Math.floor(
            Math.random()
            * source.length
          )
        ];

      questions.push({
        ...extraQuestion,
        dialect: extraDialect,
      });
    }


    return this.shuffle(
      questions.slice(0, 5)
    );
  }


  shuffle(items) {
    const result = [...items];

    for (
      let index =
        result.length - 1;

      index > 0;

      index -= 1
    ) {
      const randomIndex =
        Math.floor(
          Math.random()
          * (index + 1)
        );

      [
        result[index],
        result[randomIndex],
      ] = [
        result[randomIndex],
        result[index],
      ];
    }

    return result;
  }


  warmRemainingAudio() {
    const questionTasks =
      this.questions.map(
        (question) => () =>
          this.getAudio(
            question.text,
            question.dialect,
            "question"
          )
      );


    /*
     * مهم:
     * "كفو، إجابة صحيحة"
     * تُنشأ لكل لهجة بشكل مستقل،
     * حتى لا نستخدم صوت قصيمي
     * في سؤال شرقي مثلًا.
     */
    const dialects =
      [
        ...new Set(
          this.questions.map(
            (question) =>
              question.dialect
          )
        ),
      ];


    const correctFeedbackTasks =
      dialects.map(
        (dialect) => () =>
          this.getAudio(
            "كفو، إجابة صحيحة.",
            dialect,
            "feedback"
          )
      );


    const incorrectFeedbackTasks =
      this.questions.map(
        (question) => () =>
          this.getAudio(
            this.incorrectFeedback(
              question
            ),
            question.dialect,
            "feedback"
          )
      );


    const tasks = [
      ...questionTasks,
      ...correctFeedbackTasks,
      ...incorrectFeedbackTasks,
    ];


    this.runQueue(
      tasks,
      2
    ).catch((error) => {
      console.warn(
        "Audio preload failed",
        error
      );
    });
  }


  async runQueue(
    tasks,
    concurrency
  ) {
    const queue = [...tasks];

    const worker = async () => {
      while (queue.length) {
        const task =
          queue.shift();

        if (!task) {
          continue;
        }

        try {
          await task();

        } catch (error) {
          console.warn(
            "Challenge preload item failed",
            error
          );
        }
      }
    };


    const workerCount =
      Math.min(
        concurrency,
        tasks.length
      );


    if (!workerCount) {
      return;
    }


    const workers =
      Array.from(
        {
          length: workerCount,
        },
        () => worker()
      );


    await Promise.all(
      workers
    );
  }


  getAudio(
    text,
    dialect,
    kind
  ) {
    /*
     * لا نستخدم "general" هنا.
     *
     * اللهجة جزء من مفتاح الـ cache
     * حتى التعليقات المتطابقة نصيًا
     * يكون لها صوت مستقل لكل لهجة.
     */
    const key =
      `${this.gender}|` +
      `${dialect}|` +
      `${kind}|` +
      `${text}`;


    if (!this.audioCache.has(key)) {
      const request =
        fetchAudioBlob(
          "/api/challenge/speech",
          {
            text,
            dialect,
            gender: this.gender,
            kind,
          }
        )
          .then((blob) => {
            const url =
              URL.createObjectURL(
                blob
              );

            this.objectUrls.add(
              url
            );

            return url;
          })
          .catch((error) => {
            this.audioCache.delete(
              key
            );

            throw error;
          });


      this.audioCache.set(
        key,
        request
      );
    }


    return this.audioCache.get(
      key
    );
  }


  async playText(
    text,
    dialect,
    kind,
    onFinished
  ) {
    /*
     * نوقف أي صوت سابق
     * ونبطل أي طلب تشغيل قديم.
     */
    this.releaseCurrentAudio();

    const playbackToken =
      this.playbackToken;

    this.setSpeaking(true);
    this.enableChoices(false);


    this.ui.status.textContent =
      kind === "question"
        ? "جارٍ تجهيز الجملة..."
        : "جارٍ تجهيز التعليق...";


    try {
      const url =
        await this.getAudio(
          text,
          dialect,
          kind
        );


      /*
       * إذا المستخدم ضغط إيقاف
       * أو انتقل لحالة ثانية
       * أثناء تحميل الصوت،
       * لا نشغل الطلب القديم.
       */
      if (
        playbackToken
        !== this.playbackToken
      ) {
        return;
      }


      const audio =
        new Audio(url);

      audio.preload = "auto";

      this.currentAudio =
        audio;


      audio.addEventListener(
        "ended",
        () => {
          if (
            audio
            !== this.currentAudio
          ) {
            return;
          }

          this.releaseCurrentAudio();

          onFinished?.();
        },
        {
          once: true,
        }
      );


      audio.addEventListener(
        "error",
        () => {
          if (
            audio
            !== this.currentAudio
          ) {
            return;
          }

          this.releaseCurrentAudio();

          this.ui.status.textContent =
            "تعذر تشغيل الصوت";


          if (kind === "question") {
            this.finishQuestion();

          } else {
            this.finishFeedback();
          }
        },
        {
          once: true,
        }
      );


      await audio.play();


      /*
       * قد يحصل تغير أثناء
       * انتظار Promise الخاصة بالتشغيل.
       */
      if (
        audio
        !== this.currentAudio
      ) {
        return;
      }


      if (kind === "question") {
        this.ui.status.textContent =
          this.isFemale
            ? "استمعي جيدًا حتى تنتهي الجملة"
            : "استمع جيدًا حتى تنتهي الجملة";

      } else {
        this.ui.status.textContent =
          this.isFemale
            ? "استمعي للتعليق"
            : "استمع للتعليق";
      }

    } catch (error) {
      /*
       * لو التشغيل القديم أُلغي عمدًا،
       * ما نعرض رسالة خطأ ولا نغيّر
       * حالة السؤال الجديد.
       */
      if (
        playbackToken
        !== this.playbackToken
      ) {
        return;
      }


      console.error(
        "Audio playback failed",
        error
      );


      this.releaseCurrentAudio();


      this.ui.status.textContent =
        error?.message
        || "تعذر تشغيل صوت التحدي";


      if (kind === "question") {
        this.finishQuestion();

      } else {
        this.finishFeedback();
      }
    }
  }


  startRound() {
    this.releaseCurrentAudio();

    this.resetRoundView();

    this.phase = "sentence";

    this.currentQuestion =
      this.questions[
        this.round
      ];


    if (!this.currentQuestion) {
      this.showResult();
      return;
    }


    this.ui.round.textContent =
      `السؤال ${this.round + 1} ` +
      `من ${this.totalRounds}`;


    this.updateScore();


    const progress =
      (
        (this.round + 1)
        / this.totalRounds
      ) * 100;


    this.ui.progress.style.width =
      `${progress}%`;


    this.ui.title.textContent =
      "استمع للجملة";


    this.enableChoices(false);


    this.playText(
      this.currentQuestion.text,
      this.currentQuestion.dialect,
      "question",
      () => this.finishQuestion()
    );
  }


  finishQuestion() {
    if (
      this.phase !== "sentence"
    ) {
      return;
    }


    this.phase = "guess";

    this.setSpeaking(false);


    this.ui.title.textContent =
      this.isFemale
        ? "اختاري اللهجة"
        : "اختر اللهجة";


    this.ui.status.textContent =
      this.isFemale
        ? "اختاري الإجابة من اللهجات التالية"
        : "اختر الإجابة من اللهجات التالية";


    this.enableChoices(true);
  }


  answer(button) {
    if (
      this.phase !== "guess"
      || !this.currentQuestion
    ) {
      return;
    }


    this.releaseCurrentAudio();

    this.phase = "feedback";

    this.enableChoices(false);


    const correct =
      button.dataset.answer
      === this.currentQuestion.dialect;


    let spokenFeedback;


    if (correct) {
      this.score += 1;

      button.classList.add(
        "correct"
      );


      this.ui.feedbackTitle
        .textContent =
          "كفو! إجابة صحيحة";


      this.ui.feedbackText
        .textContent =
          "";


      spokenFeedback =
        "كفو، إجابة صحيحة.";

    } else {
      button.classList.add(
        "wrong"
      );


      const correctButton =
        document.querySelector(
          `[data-answer="${
            this.currentQuestion.dialect
          }"]`
        );


      correctButton?.classList.add(
        "correct"
      );


      this.ui.feedbackTitle
        .textContent =
          "إجابة غير صحيحة";


      this.ui.feedbackText
        .textContent =
          `الإجابة الصحيحة: ${
            DIALECT_NAMES[
              this.currentQuestion.dialect
            ]
          } — ${
            this.currentQuestion.clue
          }`;


      spokenFeedback =
        this.incorrectFeedback(
          this.currentQuestion
        );
    }


    this.updateScore();

    this.ui.feedback.hidden =
      false;


    this.playText(
      spokenFeedback,
      this.currentQuestion.dialect,
      "feedback",
      () => this.finishFeedback()
    );
  }


  incorrectFeedback(
    question
  ) {
    const dialectName =
      DIALECT_NAMES[
        question.dialect
      ];


    return (
      `الإجابة الصحيحة هي ${dialectName}. ` +
      question.clue
    );
  }


  updateScore() {
    this.ui.score.textContent =
      `النقاط: ${this.score * 20}`;
  }


  finishFeedback() {
    if (
      this.phase !== "feedback"
    ) {
      return;
    }


    this.phase = "ready";

    this.setSpeaking(false);


    this.ui.next.textContent =
      this.round
      === this.totalRounds - 1
        ? "عرض النتيجة"
        : "السؤال التالي";


    this.ui.next.hidden =
      false;


    this.ui.status.textContent =
      "";
  }


  resetRoundView() {
    this.ui.feedback.hidden =
      true;

    this.ui.next.hidden =
      true;

    this.ui.result.hidden =
      true;

    this.ui.choices.hidden =
      false;

    this.ui.soundVisual.hidden =
      false;

    this.ui.title.hidden =
      false;

    this.ui.status.hidden =
      false;


    const audioActions =
      document.querySelector(
        ".audio-actions"
      );


    if (audioActions) {
      audioActions.hidden =
        false;
    }


    document
      .querySelectorAll(".choice")
      .forEach((button) => {
        button.classList.remove(
          "correct",
          "wrong"
        );
      });
  }


  showResult() {
    this.releaseCurrentAudio();

    this.phase = "finished";


    this.ui.choices.hidden =
      true;

    this.ui.soundVisual.hidden =
      true;

    this.ui.feedback.hidden =
      true;

    this.ui.next.hidden =
      true;

    this.ui.title.hidden =
      true;

    this.ui.status.hidden =
      true;

    this.ui.result.hidden =
      false;


    const audioActions =
      document.querySelector(
        ".audio-actions"
      );


    if (audioActions) {
      audioActions.hidden =
        true;
    }


    const finalScore =
      document.querySelector(
        "#finalScore"
      );


    if (finalScore) {
      finalScore.textContent =
        `${this.score} / ${
          this.totalRounds
        }`;
    }


    let message =
      this.isFemale
        ? (
          "بداية حلوة، جرّبي مرة ثانية " +
          "وركّزي في الكلمات."
        )
        : (
          "بداية حلوة، جرّب مرة ثانية " +
          "وركّز في الكلمات."
        );


    if (
      this.score
      === this.totalRounds
    ) {
      message =
        "ما شاء الله، تعرف اللهجات السعودية كلها!";

    } else if (
      this.score >= 3
    ) {
      message =
        "نتيجة جميلة، وجولة ثانية ترفعها أكثر.";
    }


    const resultText =
      document.querySelector(
        "#resultText"
      );


    if (resultText) {
      resultText.textContent =
        message;
    }
  }


  enableChoices(enabled) {
    document
      .querySelectorAll(".choice")
      .forEach((button) => {
        button.disabled =
          !enabled;
      });


    this.ui.replay.disabled =
      !enabled;
  }


  setSpeaking(enabled) {
    this.ui.app.classList.toggle(
      "speaking",
      enabled
    );


    this.ui.stop.disabled =
      !enabled;
  }


  releaseCurrentAudio() {
    /*
     * أي تشغيل ينتظر getAudio()
     * يصبح قديمًا بمجرد استدعاء
     * هذه الدالة.
     */
    this.playbackToken += 1;


    if (this.currentAudio) {
      this.currentAudio.pause();

      this.currentAudio.currentTime =
        0;

      this.currentAudio =
        null;
    }


    this.setSpeaking(false);
  }


  destroy() {
    this.releaseCurrentAudio();


    this.objectUrls.forEach(
      (url) => {
        URL.revokeObjectURL(
          url
        );
      }
    );


    this.objectUrls.clear();

    this.audioCache.clear();
  }
}


new ChallengeController()
  .initialize();