/* ============================================================
   AI 화상영어 학습 리포트 — app.js
   Renders a compiled multi-module feedback report (lexical,
   grammar, discourse, generative practice) from a user-selected
   JSON file, syncing every timestamp with a user-selected audio
   recording of the class.
============================================================ */
(() => {
  "use strict";

  /* ---------------- state ---------------- */
  const state = {
    reports: [],      // array of raw report entries from the JSON
    reportIdx: 0,      // currently displayed entry
    activeSeg: null,    // {start,end} currently bound to auto-stop
    selectedVocab: null,
  };

  const CEFR_META = {
    A1: { label: "입문", color: "--a1", bg: "--a1-bg" },
    A2: { label: "기초", color: "--a2", bg: "--a2-bg" },
    B1: { label: "중급", color: "--b1", bg: "--b1-bg" },
    B2: { label: "중상급", color: "--b2", bg: "--b2-bg" },
    C1: { label: "고급", color: "--c1", bg: "--c1-bg" },
    C2: { label: "최고급", color: "--c2", bg: "--c2-bg" },
  };

  const ERR_CODE_LABELS = {
    // VERB_ERRORS (동사)
    VERB_TENSE: "시제 오류",
    VERB_SVA: "수 일치 오류",
    VERB_FORM: "동사 형태 오류",
    VERB_AUX: "조동사 오류",
    VERB_COND: "가정법 오류",
    VERB_REPORT: "간접화법 오류",

    // NOUN_AND_PRONOUN_ERRORS (명사 및 대명사)
    NOUN_NUM: "단수/복수 오류",
    NOUN_POSS: "소유격 오류",
    PRON_CASE: "대명사 격 오류",
    PRON_REF: "대명사 지칭 오류",
    PRON_REL: "관계대명사 오류",

    // DETERMINER_AND_MODIFIER_ERRORS (한정사 및 수식어)
    DET_ART: "관사 오류",
    DET_DEM: "지시대명사 오류",
    DET_QUANT: "수량사 오류",
    ADJ_FORM: "형용사 오류",
    ADV_FORM: "부사 오류",

    // PREPOSITIONAL_AND_RELATIONAL_ERRORS (전치사)
    PREP_SPACE: "장소 전치사 오류",
    PREP_TIME: "시간 전치사 오류",
    PREP_DEP: "전치사 오류 (숙어)",

    // SYNTAX_AND_CLAUSE_ERRORS (구문)
    SYNTAX_WO: "어순 오류",
    SYNTAX_FRAG: "불완전한 문장",
    SYNTAX_RUNON: "문장 연결 오류",
    SYNTAX_CONJ: "접속사 오류",
    SYNTAX_PARALLEL: "병렬 구조 오류",
    SYNTAX_MOD: "수식어 위치 오류",
    SYNTAX_INV: "의문문/도치 오류",
    VOICE_PASSIVE: "수동태 오류",

    // FALLBACK
    OTHER: "기타 문법 오류"
  };

  /* ---------------- small utils ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = (str) => String(str ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  // "00:16:28.670" -> seconds
  function parseTimecode(tc) {
    if (typeof tc === "number") return tc;
    if (!tc) return 0;
    const parts = tc.split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(tc) || 0;
  }

  function fmtClock(sec) {
    if (sec == null || isNaN(sec)) return "0:00";
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function fmtMinSec(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = Math.round(totalSec % 60);
    return `${m}분 ${s}초`;
  }

  function icon(name, size = 18) {
    const paths = {
      clock: `<path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm.75-16h-1.5v6.19l4.32 2.6.77-1.28-3.59-2.16V6Z"/>`,
      speed: `<path d="M12 2a10 10 0 0 0-8.66 15L4.6 15.6A8 8 0 1 1 19.4 15.6l1.26 1.4A10 10 0 0 0 12 2Zm.6 13.9 4.34-7.24-1.3-.78L11.3 15l1.3.9Z"/>`,
      users: `<path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-7 4c-3.3 0-6 1.6-6 3.6V21h12v-3.4c0-2-2.7-3.6-6-3.6Zm7 .2a6.9 6.9 0 0 1 2 3.4V21h4v-2.7c0-1.8-2.6-3.2-6-3.1Z"/>`,
      chat: `<path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4.6 3.4A.6.6 0 0 1 2.5 20V6a2 2 0 0 1 2-2Z"/>`,
      sparkle: `<path d="m11 2 1.6 4.9L17.5 8.5l-4.9 1.6L11 15l-1.6-4.9L4.5 8.5l4.9-1.6L11 2Zm7.5 9 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z"/>`,
      book: `<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z"/><path d="M4 19a2.5 2.5 0 0 1 2.5-2.5H20V21H6.5A2.5 2.5 0 0 1 4 19Z" opacity=".5"/>`,
      trophy: `<path d="M6 3h12v2h3v2a5 5 0 0 1-5 5 5 5 0 0 1-2 2.2V17h3v2H7v-2h3v-2.8A5 5 0 0 1 8 11 5 5 0 0 1 3 7V5h3V3Zm0 4H4a3 3 0 0 0 2.4 2.94A6.9 6.9 0 0 1 6 8.5V7Zm12 0v1.5c0 .5-.05.98-.14 1.44A3 3 0 0 0 20 7h-2Z"/>`,
      headphones: `<path d="M12 3a8 8 0 0 0-8 8v6a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H6v-1a6 6 0 0 1 12 0v1h-1a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h1a2 2 0 0 0 2-2v-6a8 8 0 0 0-8-8Z"/>`,
      play: `<path d="m8 5 11 7-11 7V5Z"/>`,
      pause: `<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>`,
      info: `<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"/>`,
      target: `<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 16a6 6 0 1 1 6-6 6 6 0 0 1-6 6Zm0-9a3 3 0 1 0 3 3 3 3 0 0 0-3-3Z"/>`,
      bars: `<path d="M4 20V10h4v10H4Zm6 0V4h4v16h-4Zm6 0v-7h4v7h-4Z"/>`,
      arrow: `<path d="M4 11h13.2l-4.6-4.6L14 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2Z"/>`,
      quote: `<path d="M7 7c-2.2 0-4 1.8-4 4v6h6v-6H6.2C6.5 9.5 8 8 10 8V6c-1.1 0-2.1.4-3 1Zm10 0c-2.2 0-4 1.8-4 4v6h6v-6h-2.8c.3-1.5 1.8-3 3.8-3V6c-1.1 0-2.1.4-3 1Z"/>`,
      puzzle: `<path d="M14 3a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 1 2.5 2.3 2.3 2.3 0 0 1-2.5 2.3V12H14V9.5a1.5 1.5 0 0 0-3 0V12H8v-1.8A2.3 2.3 0 0 1 5.5 8 2.3 2.3 0 0 1 8 5.8V5a2 2 0 0 1 2-2h4Z"/>`,
      check: `<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z"/>`,
      x: `<path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3Z"/>`,
    };
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor">${paths[name] || ""}</svg>`;
  }

  /* ============================================================
     FILE HANDLING
  ============================================================ */
  const jsonInput = $("#jsonInput");
  const audioInput = $("#audioInput");
  const teacherInput = $("#teacherInput");
  const jsonCard = $("#jsonCard");
  const audioCard = $("#audioCard");
  const teacherCard = $("#teacherCard");
  const openReportBtn = $("#openReportBtn");
  const uploadNote = $("#uploadNote");

  let pendingJsonData = null;
  let pendingAudioFile = null;
  let pendingTeacherData = null;

  jsonInput.addEventListener("change", async () => {
    const file = jsonInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      pendingJsonData = Array.isArray(parsed) ? parsed : [parsed];
      $("#jsonFileName").textContent = file.name;
      jsonCard.classList.add("filled");
      uploadNote.textContent = "좋아요! 이제 오디오 파일도 선택해 주세요.";
    } catch (e) {
      alert("JSON 파일을 읽는 중 문제가 발생했어요. 파일 형식을 확인해 주세요.");
      console.error(e);
    }
    checkReady();
  });

  audioInput.addEventListener("change", () => {
    const file = audioInput.files[0];
    if (!file) return;
    pendingAudioFile = file;
    $("#audioFileName").textContent = file.name;
    audioCard.classList.add("filled");
    checkReady();
  });

  teacherInput.addEventListener("change", async () => {
    const file = teacherInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      pendingTeacherData = Array.isArray(parsed) ? parsed[0] : parsed;
      $("#teacherFileName").textContent = file.name;
      teacherCard.classList.add("filled");
    } catch (e) {
      alert("강사 통계 JSON 파일을 읽는 중 문제가 발생했어요. 파일 형식을 확인해 주세요.");
      console.error(e);
    }
    checkReady();
  });

  function checkReady() {
    const ready = !!(pendingJsonData && pendingAudioFile && pendingTeacherData);
    openReportBtn.disabled = !ready;
    if (ready) uploadNote.textContent = "모든 준비가 끝났어요. 리포트를 열어보세요!";
  }

  openReportBtn.addEventListener("click", async () => {
    const studentUrl = $("#studentUrl").value.trim();
    const teacherUrl = $("#teacherUrl").value.trim();
    const audioUrl = $("#audioUrl").value.trim();
    if (!studentUrl || !teacherUrl || !audioUrl) return;

    await loadCdnReport(studentUrl, teacherUrl, audioUrl);
  });

  async function loadCdnReport(studentUrl, teacherUrl, audioUrl) {
    openReportBtn.disabled = true;
    uploadNote.textContent = "CDN에서 리포트 데이터를 불러오는 중이에요…";
    try {
      const [student, teacher] = await Promise.all([
        fetchCdnJson(studentUrl, "학생 리포트"),
        fetchCdnJson(teacherUrl, "강사 통계"),
      ]);
      state.reports = Array.isArray(student) ? student : [student];
      state.teacher = Array.isArray(teacher) ? teacher[0] : teacher;
      launchReport(audioUrl);
    } catch (e) {
      console.error(e);
      uploadNote.textContent = "리포트를 불러오지 못했어요. URL과 CDN의 CORS 설정을 확인해 주세요.";
      openReportBtn.disabled = false;
    }
  }

  async function fetchCdnJson(url, label) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${label} 요청 실패 (${response.status})`);
    return response.json();
  }

  function loadCdnReportFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const studentUrl = params.get("student");
    const teacherUrl = params.get("teacher");
    const audioUrl = params.get("audio");
    if (!studentUrl || !teacherUrl || !audioUrl) return;

    $("#studentUrl").value = studentUrl;
    $("#teacherUrl").value = teacherUrl;
    $("#audioUrl").value = audioUrl;
    loadCdnReport(studentUrl, teacherUrl, audioUrl);
  }

  loadCdnReportFromQuery();

  $("#reloadBtn").addEventListener("click", () => location.reload());

  /* ============================================================
     LAUNCH / RENDER
  ============================================================ */
  function launchReport(audioUrl) {
    const audioEl = $("#audioEl");
    audioEl.src = audioUrl;

    $("#uploadScreen").hidden = true;
    $("#topbarStatus").hidden = false;
    $("#playerBar").hidden = false;
    renderAll();
    initPlayer();
  }

  function currentReport() {
    return state.reports[state.reportIdx] || {};
  }

  function renderAll() {
    const root = $("#reportRoot");
    root.hidden = false;
    const data = currentReport();
    root.innerHTML = [
      buildSpeakerSwitch(),
      buildModuleNav(),
      buildHero(data),
      buildLessonSummary(data),
      buildOverview(data),
      buildVocabulary(data),
      buildInsightsOverview(data),
      buildLexicalModule(data),
      buildGrammarModule(data),
      buildDiscourseModule(data),
      buildGenerativeModule(data),
      buildGlossary(),
    ].join("");
    wireInteractions();
  }

  /* ---------------- speaker switch (if multiple entries) ---------------- */
  function buildSpeakerSwitch() {
    if (state.reports.length < 2) return "";
    const tabs = state.reports.map((r, i) => {
      const name = r.class_stats?.speaker_name || (r.class_stats?.role === "student" ? "학생" : `화자 ${i + 1}`);
      return `<button class="speaker-tab ${i === state.reportIdx ? "active" : ""}" data-speaker="${i}">${esc(name)}</button>`;
    }).join("");
    return `<div class="speaker-switch">${tabs}</div>`;
  }

  /* ---------------- sticky module nav ---------------- */
  function buildModuleNav() {
    const items = [
      ["#m0", "수업 요약"],
      ["#overview", "발화 지표"],
      ["#vocab", "어휘 레벨"],
      ["#insights", "인사이트 요약"],
      ["#m1", "어휘·표현 피드백"],
      ["#m2", "문법 피드백"],
      ["#m3", "대화 능력"],
      ["#m4", "학습 자료"],
    ];
    return `<nav class="module-nav">${items.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</nav>`;
  }

  function initials(name) {
    return (name || "?").slice(0, 2).toUpperCase();
  }

  function buildHero(data) {
    const cs = data.class_stats || {};
    const s = cs.summary || {};
    const topic = data.m0_summary?.prevailing_topic;
    return `
    <section class="section hero">
      <div class="hero-left">
        <div class="hero-avatar">${initials(cs.speaker_name)}</div>
        <div>
          <div class="hero-name">${esc(cs.speaker_name || "학생")} 님의 수업 리포트</div>
          <div class="hero-meta">수업 ID : ${esc(cs.class_id || "-")}${state.teacher?.speaker_name ? ` &nbsp;·&nbsp; 강사님: ${esc(state.teacher.speaker_name)}` : ""}</div>
          ${topic ? `<div class="hero-topic">${icon("sparkle", 13)} 이번 수업 주제 · ${esc(topic)}</div>` : ""}
        </div>
      </div>
      <div class="hero-chips">
        <div class="hero-chip"><b>${fmtMinSec(s.total_talk_time_sec || 0)}</b><span>총 발화 시간</span></div>
        <div class="hero-chip"><b>${s.total_words_spoken ?? "-"}</b><span>총 발화 단어 수</span></div>
        <div class="hero-chip"><b>${s.valid_turns_count ?? "-"}</b><span>유효 발화 턴</span></div>
        <div class="hero-chip"><b>${Math.round((s.participation_percentage || 0) * 100)}%</b><span>대화 참여율</span></div>
      </div>
    </section>`;
  }

  function buildLessonSummary(data) {
    const m0 = data.m0_summary;
    if (!m0) return "";
    return `
    <section class="section" id="m0">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--ink")}">${icon("book", 20)}</div>
        <div>
          <h2>수업 요약</h2>
          <p class="desc">AI가 이번 수업의 대화 내용을 읽고 정리한 전체 요약이에요. 무슨 이야기를 나눴는지, 학생이 어떤 점에서 잘했는지 먼저 확인해보세요.</p>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-block">
          <span class="summary-label">이번 수업 주제</span>
          <p class="summary-topic">${esc(m0.prevailing_topic || "-")}</p>
          <span class="summary-label" style="margin-top:14px;">수업 흐름</span>
          <p class="summary-text">${esc(m0.lesson_summary || "-")}</p>
        </div>
        <div class="summary-block praise-block">
          <span class="summary-label">${icon("trophy", 13)} 종합 칭찬</span>
          <p class="summary-text">${esc(m0.overall_praise || "-")}</p>
        </div>
      </div>
    </section>`;
  }

  function gaugeMarkup(value, min, max, zones) {
    const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    const zoneDivs = zones.map(z => {
      const left = ((z.from - min) / (max - min)) * 100;
      const width = ((z.to - z.from) / (max - min)) * 100;
      return `<div class="gauge-zone" style="left:${left}%;width:${width}%;background:${z.color};border-radius:6px;"></div>`;
    }).join("");
    return `
      <div class="gauge-track">${zoneDivs}<div class="gauge-marker" style="left:${pct}%"></div></div>
      <div class="gauge-labels"><span>${min}</span><span>${max} WPM</span></div>
    `;
  }

  function mtldGaugeMarkup(score) {
    const min = 0;
    const max = 90;
    const marker = Math.max(0, Math.min(100, ((score - min) / (max - min)) * 100));
    const zones = [
      { from: 0, to: 35, color: cssVar("--a2") },
      { from: 35, to: 65, color: cssVar("--mint") },
      { from: 65, to: 90, color: cssVar("--c1") },
    ];
    const zoneDivs = zones.map(z => {
      const left = ((z.from - min) / (max - min)) * 100;
      const width = ((z.to - z.from) / (max - min)) * 100;
      return `<div class="gauge-zone" style="left:${left}%;width:${width}%;background:${z.color};border-radius:6px;"></div>`;
    }).join("");
    return `
      <div class="gauge-track">${zoneDivs}<div class="gauge-marker" style="left:${marker}%"></div></div>
      <div class="gauge-labels"><span>0</span><span>35</span><span>65</span><span>90+</span></div>
    `;
  }
  function buildOverview(data) {
    const s = data.class_stats?.summary || {};
    const wpm = s.trimmed_mean_wpm ?? s.overall_session_wpm ?? 0;
    const wpmZones = [
      { from: 40, to: 100, color: cssVar("--a2") },
      { from: 100, to: 170, color: cssVar("--mint") },
      { from: 170, to: 260, color: cssVar("--c1") },
    ];
    const rawMtld = Number(s.mtld_score);
    const hasMtld = Number.isFinite(rawMtld);
    const mtldScore = hasMtld ? Math.round(rawMtld) : null;
    const mtldBand = !hasMtld
      ? null
      : rawMtld < 35
        ? { label: "낮은 다양성", description: "어휘 반복이 많고 기본 단어나 추임새에 주로 의존해요. 아는 단어만 반복하는 초급 학습자나 단답형 대화에서 흔히 볼 수 있어요." }
        : rawMtld <= 65
          ? { label: "보통 다양성", description: "일상 대화를 나누기 좋은 자연스러운 수준이에요. 표준 어휘로 무리 없이 대화를 이어가며, 중급 학습자에게서 가장 흔하게 나타나요." }
          : { label: "높은 다양성", description: "단어 사용이 아주 풍부하고 다채로워요. 어휘 중복을 줄이고 구체적인 표현을 쓰며, 토론이나 학술적 대화, 혹은 고급 학습자나 강사가 전문 지식을 설명할 때 나오는 수치예요." };
    const participation = Math.round((s.participation_percentage || 0) * 100);
    const shortCount = s.short_turns_filtered ?? 0;
    const validCount = s.valid_turns_count ?? 0;
    const totalCount = s.total_utterances ?? (shortCount + validCount);
    const validPct = totalCount ? Math.round((validCount / totalCount) * 100) : 0;

    return `
    <section class="section" id="overview">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--mint")}">${icon("bars", 20)}</div>
        <div>
          <h2>한눈에 보는 발화 활동 요약</h2>
          <p class="desc">수업 전체에서 뽑아낸 핵심 지표예요. 각 카드 아래 설명을 통해 숫자가 무엇을 의미하는지 쉽게 확인할 수 있어요.</p>
        </div>
      </div>
      <div class="grid-cards">

        <div class="metric-card">
          <div class="metric-top">
            <div class="metric-title"><span class="metric-icon" style="background:${cssVar("--mint")}">${icon("speed", 15)}</span>유창성</div>
          </div>
          <div class="metric-value">${wpm.toFixed(1)}<small>WPM</small></div>
          ${gaugeMarkup(wpm, 40, 260, wpmZones)}
          <p class="metric-desc">1분당 정확히 말한 단어 수예요. 너무 짧은 대답은 제외하고 계산한 '절사평균값'을 사용해 실제 속도를 더 정확히 보여줘요. 110~170 사이면 자연스러운 대화 속도예요.</p>
        </div>

        <div class="metric-card">
          <div class="metric-top">
            <div class="metric-title"><span class="metric-icon" style="background:${cssVar("--purple")}">${icon("users", 15)}</span>대화 참여율</div>
          </div>
          <div class="donut-wrap">
            <div class="donut" style="background: conic-gradient(${cssVar("--purple")} calc(${participation}*1%), #EEF1F5 0)">
              <div class="donut-inner"><b>${participation}%</b><span>참여</span></div>
            </div>
            <p class="metric-desc" style="margin:0;">전체 수업 대화 시간 중 학생이 말한 시간의 비율이에요. 총 <b>${fmtMinSec(s.total_talk_time_sec || 0)}</b> 동안 이야기했어요.</p>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-top">
            <div class="metric-title"><span class="metric-icon" style="background:${cssVar("--blue")}">${icon("chat", 15)}</span>평균 발화 길이 (MLU)</div>
          </div>
          <div class="metric-value">${(s.mlu_overall ?? 0).toFixed(1)}<small>단어 / 턴</small></div>
          <p class="metric-desc">한 번 말할 때 평균 몇 단어를 사용했는지를 나타내요. 숫자가 클수록 단답형 대신 문장을 길고 자세하게 만드는 능력이 좋다는 뜻이에요.</p>
        </div>

        <div class="metric-card">
          <div class="metric-top">
            <div class="metric-title"><span class="metric-icon" style="background:${cssVar("--amber")}">${icon("sparkle", 15)}</span>어휘 다양성 (MTLD)</div>
          </div>
          <div class="metric-value">${mtldScore ?? "-"}<small>단어</small></div>
          ${hasMtld ? mtldGaugeMarkup(rawMtld) : ""}
          <p class="metric-desc">${hasMtld
            ? `<b>${mtldBand.label}</b> · ${mtldBand.description} 이번 수업에 사용하신 고유 어휘는 총 <b>${s.unique_lemma_count ?? "-"}개</b>예요.`
            : "이 리포트에는 MTLD 점수가 없어 어휘 다양성을 표시할 수 없어요."}</p>
        </div>

        <div class="metric-card">
          <div class="metric-top">
            <div class="metric-title"><span class="metric-icon" style="background:${cssVar("--rose")}">${icon("target", 15)}</span>발화 턴 구성</div>
          </div>
          <div class="metric-value">${validCount}<small>/ ${totalCount} 턴</small></div>
          <div class="stack-bar"><div class="stack-seg valid" style="width:${validPct}%"></div><div class="stack-seg short" style="width:${100-validPct}%"></div></div>
          <div class="stack-legend">
            <span><i class="dot" style="background:${cssVar("--mint")}"></i>5단어 이상 발화 턴 ${validCount}</span>
            <span><i class="dot" style="background:#DDE3EA"></i>단답형 대답 턴 ${shortCount}</span>
          </div>
          <p class="metric-desc">
            총 ${totalCount}번의 대답 중 ${validCount}번(${validPct}%)을 5단어 이상으로 길게 말했어요. 
            ${validPct >= 50 
              ? '단답형 대답을 넘어 대화를 주도적으로 이끌어가는 능력이 돋보입니다.' 
              : '다음 수업에서는 짧은 대답 뒤에 이유나 내 생각을 한 줄 더 덧붙여 볼까요?'}
          </p>
        </div>

        <div class="metric-card">
          <div class="metric-top">
            <div class="metric-title"><span class="metric-icon" style="background:${cssVar("--ink")}">${icon("clock", 15)}</span>유창성 범위</div>
          </div>
          <div class="metric-value">${(s.min_turn_wpm ?? 0).toFixed(0)}<small>~ ${(s.max_turn_wpm ?? 0).toFixed(0)} WPM</small></div>
          <p class="metric-desc">가장 느렸던 발화와 가장 빨랐던 발화의 속도예요. 편차가 크다면 긴장했거나 확신이 없는 순간이 있었을 수 있어요.</p>
        </div>

      </div>
    </section>`;
  }

  function buildVocabulary(data) {
    const vocab = data.class_stats?.vocabulary || {};
    const dist = vocab.vocab_distrib_unique_lemmas || {};
    const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const max = Math.max(1, ...levels.map(l => dist[l] || 0));
    const bars = levels.map(l => {
      const count = dist[l] || 0;
      const h = Math.round((count / max) * 130) + 4;
      const meta = CEFR_META[l];
      return `
        <div class="vocab-bar-col">
          <span class="vocab-bar-count">${count}</span>
          <div class="vocab-bar" style="height:${h}px;background:var(${meta.color})"></div>
          <span class="vocab-bar-label" style="color:var(${meta.color});background:var(${meta.bg})">${l}</span>
        </div>`;
    }).join("");
    const legend = levels.map(l => {
      const meta = CEFR_META[l];
      return `<span class="legend-pill" style="background:var(${meta.bg});color:var(${meta.color})"><i class="sw" style="background:var(${meta.color})"></i>${l} · ${meta.label}</span>`;
    }).join("");

    const high = vocab.high_level || {};
    const chipGroups = [["B2", high.b2_vocab], ["C1", high.c1_vocab], ["C2", high.c2_vocab]];
    const chips = chipGroups.flatMap(([lvl, words]) => (words || []).map(w => {
      const meta = CEFR_META[lvl];
      return `<button class="vocab-chip static" type="button" data-vocab-word="${esc(w)}" aria-label="${esc(w)} 단어장에 추가"><span class="level-dot" style="background:var(${meta.color})"></span>${esc(w)}<span class="count" style="color:var(${meta.color})">${lvl}</span></button>`;
    })).join("") || `<p class="empty-state">이번 수업에서는 B1 이상의 고급 어휘가 발견되지 않았어요.</p>`;

    const teacher = state.teacher || {};
    const teacherChipGroups = [["B2", teacher.b2_vocab], ["C1", teacher.c1_vocab], ["C2", teacher.c2_vocab]];
    const teacherChips = teacherChipGroups.flatMap(([lvl, words]) => (words || []).map(w => {
      const meta = CEFR_META[lvl];
      return `<button class="vocab-chip static" type="button" data-vocab-word="${esc(w)}" aria-label="${esc(w)} 단어장에 추가"><span class="level-dot" style="background:var(${meta.color})"></span>${esc(w)}<span class="count" style="color:var(${meta.color})">${lvl}</span></button>`;
    })).join("") || `<p class="empty-state">이번 수업에서 강사님이 사용하신 B2 이상의 어휘가 발견되지 않았어요.</p>`;

    return `
    <section class="section" id="vocab">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--blue")}">${icon("book", 20)}</div>
        <div>
          <h2>어휘 레벨 분포 (CEFR)</h2>
          <p class="desc">CEFR은 유럽에서 만든 국제 어학 능력 기준이에요. A1(입문)부터 C2(최고급)까지 6단계로 나뉘며, 학생이 사용한 <b>고유 어휘 ${data.class_stats?.summary?.unique_lemma_count ?? "-"}개</b>가 각 레벨에 몇 개씩 속하는지 보여줘요.</p>
        </div>
      </div>
      <div class="vocab-chart">${bars}</div>
      <div class="vocab-legend-row">${legend}</div>
      <div class="subsection-title" style="margin-top:24px;">${icon("trophy", 16)} 내가 사용한 고급 어휘 (B2 이상)</div>
      <p class="desc" style="margin-bottom:14px;">일상 대화에서 자주 쓰지 않는, 한 단계 더 어려운 단어들이에요. 이런 단어를 쓸수록 어휘력이 풍부하다는 뜻이에요.</p>
      <div class="vocab-chip-grid">${chips}</div>
      <div class="subsection-title" style="margin-top:28px;">${icon("book", 16)} 강사님이 수업에 사용한 어휘 (B2 이상)</div>
      <p class="desc" style="margin-bottom:14px;">강사님이 수업 도중 사용하신 어려운 어휘들이에요. 클릭해서 내 단어장에 담아보세요.</p>
      <div class="vocab-chip-grid">${teacherChips}</div>
    </section>`;
  }

  function buildInsightsOverview(data) {
    const m1 = data.m1_lexical || {};
    const m2 = data.m2_grammar || {};
    const m3 = data.m3_discourse || {};
    const m4 = data.m4_generative || {};
    const discourseCats = ["topic_dev", "questioning", "cohesion", "backchannel", "meaning_neg"];
    const discourseStrengths = discourseCats.reduce((total, key) => total + (m3[key]?.strengths || []).length, 0);
    const discourseImprovements = discourseCats.reduce((total, key) => total + (m3[key]?.improvements || []).length, 0);

    const list = (items, tone) => items.filter(([, count]) => count > 0).map(([label, count]) => `
      <li class="insight-item ${tone}"><span>${esc(label)}</span><b>${count}</b></li>`).join("");
    const moduleCard = (href, title, iconName, color, positiveItems, focusItems, practiceItems) => {
      const positive = list(positiveItems || [], "positive");
      const focus = list(focusItems || [], "focus");
      const practice = list(practiceItems || [], "practice");
      if (!positive && !focus && !practice) return "";
      return `
        <a class="insight-card" href="${href}">
          <div class="insight-card-head"><span class="insight-card-icon" style="background:${color}">${icon(iconName, 17)}</span><h3>${esc(title)}</h3><span class="insight-more">상세 보기 ${icon("arrow", 13)}</span></div>
          ${positive ? `<div class="insight-group"><span class="insight-group-label positive">잘한 점</span><ul>${positive}</ul></div>` : ""}
          ${focus ? `<div class="insight-group"><span class="insight-group-label focus">집중할 점</span><ul>${focus}</ul></div>` : ""}
          ${practice ? `<div class="insight-group"><span class="insight-group-label practice">복습 활동</span><ul>${practice}</ul></div>` : ""}
        </a>`;
    };

    const cards = [
      moduleCard("#m1", "어휘·표현 피드백", "sparkle", cssVar("--amber"),
        [["센스있는 설명", (m1.circumloc || []).length]],
        [["추천 표현", (m1.better_expr || []).length], ["콩글리시 표현", (m1.l1_interf || []).length]]),
      moduleCard("#m2", "문법 피드백", "target", cssVar("--blue"),
        [["베스트 문장", (m2.golden_sentence || []).length], ["셀프 수정", (m2.self_corr || []).length]],
        [["문법 교정", (m2.grammar_corr || []).length], ["반복되는 실수", (m2.fossilized_errors || []).length]]),
      moduleCard("#m3", "대화 스킬 피드백", "users", cssVar("--purple"),
        [["대화 스킬강점", discourseStrengths]],
        [["성장 포인트", discourseImprovements]]),
      moduleCard("#m4", "맞춤 복습 자료", "puzzle", cssVar("--rose"), null, null,
        [["단어 퍼즐", (m4.vocab_mission || []).length], ["문법 퀴즈", (m4.grammar_quiz || []).length], ["문장 연결 챌린지", (m4.rewrite_challenge || []).length]])
    ].join("");

    if (!cards) return "";
    return `
    <section class="section" id="insights">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--ink")}">${icon("bars", 20)}</div>
        <div>
          <h2>인사이트 한눈에 보기</h2>
          <p class="desc">세부 피드백을 보기 전에, 이번 수업에서 잘한 점과 다음에 집중할 항목을 모아 봐요. 카드를 누르면 해당 피드백으로 바로 이동할 수 있어요.</p>
        </div>
      </div>
      <div class="insight-grid">${cards}</div>
    </section>`;
  }

  /* ============================================================
     GENERIC FEEDBACK CARD BUILDERS
  ============================================================ */
  // "Fix" card: what the student said -> a better way to say it
  function fixCard({ start_t, end_t, origLabel = "학생이 말한 표현", orig, corrLabel = "더 나은 표현", corr, expl, badge, tag }) {
    const hasTs = start_t != null;
    return `
    <div class="fb-card fb-fix">
      <div class="fb-top">
        ${hasTs ? tsButton(start_t, end_t) : ""}
        ${tag ? `<span class="fb-tag">${esc(tag)}</span>` : ""}
        ${badge ? `<span class="fb-badge">${esc(badge)}</span>` : ""}
      </div>
      <div class="fb-compare">
        <div class="fb-box orig"><span class="fb-box-label">${origLabel}</span><p>${esc(orig)}</p></div>
        <div class="fb-arrow">${icon("arrow", 16)}</div>
        <div class="fb-box corr"><span class="fb-box-label">${corrLabel}</span><p>${esc(corr)}</p></div>
      </div>
      ${expl ? `<p class="fb-expl">${esc(expl)}</p>` : ""}
    </div>`;
  }

  // "Praise" card: a highlighted quote + why it's great
  function praiseCard({ start_t, end_t, quote, expl, tag, meta }) {
    const hasTs = start_t != null;
    return `
    <div class="fb-card fb-praise">
      <div class="fb-top">
        ${hasTs ? tsButton(start_t, end_t) : ""}
        ${tag ? `<span class="fb-tag praise">${esc(tag)}</span>` : ""}
      </div>
      <div class="fb-quote">${icon("quote", 16)}<p>${esc(quote)}</p></div>
      ${meta ? `<p class="fb-meta-note">${esc(meta)}</p>` : ""}
      ${expl ? `<p class="fb-expl praise">${esc(expl)}</p>` : ""}
    </div>`;
  }

  function tsButton(start_t, end_t) {
    const s = parseTimecode(start_t), e = parseTimecode(end_t);
    return `<button class="ts-btn" data-start="${s}" data-end="${e}">
      <span class="ts-play-icon">${icon("play", 11)}</span>
      <span class="ts-pause-icon" hidden>${icon("pause", 11)}</span>
      ${fmtClock(s)} – ${fmtClock(e)}
    </button>`;
  }

  function subsectionHead(title, desc, count) {
    return `<div class="subsection-title">${esc(title)} ${count != null ? `<span class="count-chip">${count}</span>` : ""}</div><p class="desc" style="margin-bottom:14px;">${esc(desc)}</p>`;
  }

  /* ============================================================
     MODULE 1 — LEXICAL FEEDBACK
  ============================================================ */
  function buildLexicalModule(data) {
    const m1 = data.m1_lexical;
    if (!m1) return "";
    const better = (m1.better_expr || []).map(it => fixCard({
      ...it, origLabel: "학생이 말한 표현", corrLabel: "추천 표현", corr: it.sugg, expl: it.kr_expl, tag: "표현 업그레이드"
    })).join("");
    const l1 = (m1.l1_interf || []).map(it => fixCard({
      ...it, origLabel: "학생이 말한 표현", corrLabel: "영어식 표현", corr: it.corr, expl: it.kr_expl, tag: "모국어 영향"
    })).join("");
    const circ = (m1.circumloc || []).map(it => praiseCard({
      ...it, quote: it.orig, expl: it.kr_praise, tag: "센스있는 설명", meta: it.target ? `표현하고자 했던 단어: "${it.target}"` : null
    })).join("");

    return `
    <section class="section" id="m1">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--amber")}">${icon("sparkle", 20)}</div>
        <div>
          <h2>어휘·표현 피드백</h2>
          <p class="desc">학생이 실제로 사용한 단어와 표현을 살펴보고, 더 자연스럽거나 정확한 표현을 함께 제안해요. 재생 버튼을 누르면 그 순간의 목소리를 들을 수 있어요.</p>
        </div>
      </div>

      ${(m1.better_expr || []).length ? subsectionHead("추천 표현", "뜻은 통하지만 원어민이라면 조금 다르게 말했을 표현들이에요.", m1.better_expr.length) : ""}
      <div class="fb-list">${better}</div>

      ${(m1.l1_interf || []).length ? subsectionHead("콩글리시 표현", "한국어를 영어로 그대로 옮기면서 생긴 표현이에요. 영어식 표현으로 바꿔보세요.", m1.l1_interf.length) : ""}
      <div class="fb-list">${l1}</div>

      ${(m1.circumloc || []).length ? subsectionHead("풀어 설명하기", "정확한 단어가 떠오르지 않을 때, 설명으로 풀어서 의미를 잘 전달한 순간이에요. 훌륭한 의사소통 전략이에요!", m1.circumloc.length) : ""}
      <div class="fb-list">${circ}</div>
    </section>`;
  }

  /* ============================================================
     MODULE 2 — GRAMMAR FEEDBACK
  ============================================================ */
  function buildGrammarModule(data) {
    const m2 = data.m2_grammar;
    if (!m2) return "";
    const grammar = (m2.grammar_corr || []).map(it => fixCard({
      ...it, corrLabel: "바른 문장", corr: it.corr, expl: it.kr_expl, badge: ERR_CODE_LABELS[it.err_code] || it.err_code
    })).join("");
    const fossilized = (m2.fossilized_errors || []).map(it => fixCard({
      ...it, corrLabel: "바른 문장", corr: it.corr, expl: it.kr_advice,
      badge: ERR_CODE_LABELS[it.err_code] || it.err_code,
      tag: it.historical_count ? `이 유형 총 ${it.historical_count}회 반복` : "반복 오류"
    })).join("");
    const golden = (m2.golden_sentence || []).map(it => praiseCard({
      ...it, quote: it.sentence, expl: it.kr_praise, tag: "베스트 문장"
    })).join("");
    const selfCorr = (m2.self_corr || []).map(it => praiseCard({
      ...it, quote: it.orig, expl: it.kr_praise, tag: "스스로 고쳐 말하기"
    })).join("");

    return `
    <section class="section" id="m2">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--blue")}">${icon("target", 20)}</div>
        <div>
          <h2>문법 피드백</h2>
          <p class="desc">문장 구조와 문법 사용을 확인해요. 반복되는 습관은 따로 모아 보여주고, 훌륭한 문장은 칭찬으로 짚어드려요.</p>
        </div>
      </div>

      ${(m2.grammar_corr || []).length ? subsectionHead("문법 교정", "문법적으로 바로잡으면 더 정확해지는 문장이에요.", m2.grammar_corr.length) : ""}
      <div class="fb-list">${grammar}</div>

      ${(m2.fossilized_errors || []).length ? subsectionHead("반복되는 실수", "여러 번 반복해서 나타나는 문법적 실수예요. 패턴을 의식하면 빠르게 고칠 수 있어요.", m2.fossilized_errors.length) : ""}
      <div class="fb-list">${fossilized}</div>

      ${(m2.golden_sentence || []).length ? subsectionHead("오늘의 베스트 문장", "학생이 만든 문장 중 구조와 표현이 특히 훌륭했던 문장이에요.", m2.golden_sentence.length) : ""}
      <div class="fb-list">${golden}</div>

      ${(m2.self_corr || []).length ? subsectionHead("셀프 교정", "말하다가 스스로 실수를 알아차리고 바로 고쳐 말한 순간이에요. 매우 좋은 언어 감각이에요.", m2.self_corr.length) : ""}
      <div class="fb-list">${selfCorr}</div>
    </section>`;
  }

  /* ============================================================
     MODULE 3 — DISCOURSE SKILLS
  ============================================================ */
  function buildDiscourseModule(data) {
    const m3 = data.m3_discourse;
    if (!m3) return "";
    const cats = [
      ["topic_dev", "주제 확장", "이야기를 얼마나 길고 풍부하게 확장하는지를 봐요."],
      ["questioning", "질문 주도", "상대방에게 궁금한 점을 묻고 대화를 이어가는 능력이에요."],
      ["cohesion", "흐름 연결", "접속사나 연결어를 사용해 문장을 자연스럽게 잇는 능력이에요."],
      ["backchannel", "리액션", "상대방의 말에 반응하고 공감을 표현하는 능력이에요."],
      ["meaning_neg", "소통 조율", "오해가 생겼을 때 이를 알아차리고 바로잡는 능력이에요."],
    ];

    const blocks = cats.map(([key, title, desc]) => {
      const cat = m3[key];
      if (!cat) return "";
      const strengths = (cat.strengths || []).map(it => praiseCard({
        ...it, quote: it.orig, expl: it.kr_praise, tag: "자연스러운 대화",
        meta: it.connector ? `사용한 연결어: "${it.connector}"` : null
      })).join("");
      const improvements = (cat.improvements || []).map(it => fixCard({
        ...it, origLabel: it.context ? "학생이 말한 순간" : "학생이 말한 표현", corrLabel: "이렇게 말해보면 더 좋아요", corr: it.sugg, expl: it.context ? `${it.context}\n\n${it.kr_advice || ""}` : it.kr_advice, tag: "성장 포인트"
      })).join("");
      if (!strengths && !improvements) return "";
      return `
        <div class="discourse-cat">
          <div class="subsection-title">${esc(title)}</div>
          <p class="desc" style="margin-bottom:14px;">${esc(desc)}</p>
          ${strengths ? `<div class="fb-list">${strengths}</div>` : ""}
          ${improvements ? `<div class="fb-list" style="margin-top:10px;">${improvements}</div>` : ""}
        </div>`;
    }).join("");

    return `
    <section class="section" id="m3">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--purple")}">${icon("users", 20)}</div>
        <div>
          <h2>대화 능력</h2>
          <p class="desc">단순히 정확한 문장을 넘어, 대화를 얼마나 능숙하게 이끌어가는지를 살펴봐요. 주제 확장, 질문 주도, 흐름 연결, 리액션, 소통 조율 다섯 가지 영역으로 나눠서 보여줘요.</p>
        </div>
      </div>
      ${blocks}
    </section>`;
  }

  /* ============================================================
     MODULE 4 — GENERATIVE PRACTICE
  ============================================================ */
  function buildGenerativeModule(data) {
    const m4 = data.m4_generative;
    if (!m4) return "";

    const missions = (m4.vocab_mission || []).map((it, i) => buildJumbleGame(it, `vm-${i}`)).join("");
    const quiz = (m4.grammar_quiz || []).map((it, i) => buildQuizCard(it, `gq-${i}`)).join("");
    const rewrite = (m4.rewrite_challenge || []).map((it, i) => buildRewriteCard(it, `rw-${i}`)).join("");
    const warmup = m4.warmup_prompt ? `
      <div class="warmup-card">
        <span class="warmup-tag">${icon("sparkle", 13)} 이어지는 대화 주제</span>
        <p class="warmup-en">${esc(m4.warmup_prompt.en_question)}</p>
        <p class="warmup-kr">${esc(m4.warmup_prompt.kr_translation)}</p>
      </div>` : "";

    return `
    <section class="section" id="m4">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--rose")}">${icon("puzzle", 20)}</div>
        <div>
          <h2>맞춤 복습 자료</h2>
          <p class="desc">이번 수업에서 나온 표현과 오류를 바탕으로 만든 연습 문제예요. 직접 풀어보면서 배운 내용을 다시 한번 익혀보세요.</p>
        </div>
      </div>

      ${missions ? subsectionHead("단어 퍼즐", "뒤섞인 단어를 순서대로 클릭해서 올바른 문장을 완성해보세요.", m4.vocab_mission.length) : ""}
      <div class="game-grid">${missions}</div>

      ${quiz ? subsectionHead("문법 퀴즈", "빈칸에 알맞은 표현을 골라보세요.", m4.grammar_quiz.length) : ""}
      <div class="game-grid">${quiz}</div>

      ${rewrite ? subsectionHead("문장 연결 챌린지", "여러 문장을 자연스러운 한 문장으로 연결해보세요.", m4.rewrite_challenge.length) : ""}
      <div class="game-grid">${rewrite}</div>

      ${warmup}
    </section>`;
  }

  function buildJumbleGame(item, id) {
    const words = item.jumbled_words.map((w, i) => `<button class="jw-tile" data-id="${id}" data-word="${esc(w)}" data-i="${i}">${esc(w)}</button>`).join("");
    return `
    <div class="game-card" id="${id}" data-answer="${esc(item.correct_sentence)}">
      <span class="game-kr">${esc(item.kr_meaning)}</span>
      <div class="jw-assembly" data-id="${id}"></div>
      <div class="jw-bank" data-id="${id}">${words}</div>
      <div class="game-actions">
        <button class="btn ghost small jw-reset" data-id="${id}">다시 섞기</button>
        <button class="btn primary small jw-check" data-id="${id}">확인하기</button>
      </div>
      <p class="game-feedback" data-id="${id}"></p>
    </div>`;
  }

  function buildQuizCard(item, id) {
    const opts = item.options.map((o, i) => `<button class="quiz-opt" data-id="${id}" data-i="${i}" data-val="${esc(o)}">${esc(o)}</button>`).join("");
    return `
    <div class="game-card" id="${id}" data-answer="${esc(item.correct_answer)}" data-hint="${esc(item.kr_hint || "")}">
      <p class="quiz-sentence">${esc(item.sentence_with_blank)}</p>
      <div class="quiz-opts">${opts}</div>
      <p class="game-feedback" data-id="${id}"></p>
    </div>`;
  }

  function buildRewriteCard(item, id) {
    const originals = item.original_sentences.map(s => `<li>${esc(s)}</li>`).join("");
    const opts = item.options.map((o, i) => `<button class="quiz-opt" data-id="${id}" data-i="${i}" data-val="${esc(o)}">${esc(o)}</button>`).join("");
    return `
    <div class="game-card" id="${id}" data-answer="${esc(item.correct_answer)}">
      <span class="game-kr" style="margin-bottom:6px;">원래 문장들</span>
      <ul class="rw-originals">${originals}</ul>
      <p class="quiz-sentence">${esc(item.combined_sentence_with_blank)}</p>
      <div class="quiz-opts">${opts}</div>
      <p class="game-feedback" data-id="${id}"></p>
    </div>`;
  }

  function buildGlossary() {
    const items = [
      ["분당 단어 수 (WPM: Words Per Minute)", "1분 동안 말한 단어의 개수예요. 너무 빠르면 발음이 뭉개질 수 있고, 너무 느리면 자신감이 부족해 보일 수 있어요. 110~170 사이가 자연스러운 대화 속도예요."],
      ["절사평균 (Trimmed Mean)", "가장 빠르거나 느렸던 일부 발화를 제외하고 계산한 평균이에요. 순간적으로 아주 짧게 대답한 말 때문에 속도 지표가 왜곡되는 것을 막아줘요."],
      ["발화 턴 (Turn)", "대화 중 내가 끊기지 않고 한 번에 말한 단위를 뜻해요. 'Yes'나 'Okay' 같은 짧은 대답보다, 여러 단어를 조합해 문장을 길게 이어가는 턴이 많을수록 대화 주도력과 영어 구사력이 높게 평가돼요."],
      ["평균 발화 길이 (MLU: Mean Length of Utterance)", "한 번 말할 때(턴)마다 평균적으로 몇 단어를 사용했는지를 나타내요. 숫자가 클수록 짧은 대답보다 문장을 길고 자세하게 만드는 능력이 좋다는 뜻이에요."],
      ["어휘 다양성 지수 (MTLD: Measure of Textual Lexical Diversity)", "같은 말을 반복하지 않고 얼마나 다양한 어휘를 사용하는지 보여주는 지수예요. 35 미만은 낮은 다양성, 35~65는 보통 다양성, 65 초과는 높은 다양성으로 해석해요. 예시) MTLD값이 50인 경우, 어휘가 반복되어 다양성 수치가 떨어지기 전까지 평균적으로 50개의 단어를 다채롭게 사용했다는 뜻이에요."],
      ["CEFR 레벨", "유럽에서 만든 국제 어학 능력 기준이에요. A1(입문)부터 C2(최고급)까지 6단계로 나뉘며, 숫자와 알파벳이 뒤로 갈수록 더 어려운 어휘와 표현이에요."],
      ["대화 참여율 (Participation)", "전체 수업 대화 시간 중 수강생님이 말씀하신 시간이 차지하는 비율이에요. 이 수치가 너무 낮다면 강사님이 말씀을 너무 많이 하셨거나, 수강생님이 조금 소극적이셨을 수 있어요. 반대로 너무 높다면 강사님의 이야기를 주의 깊게 듣는 연습이 조금 더 필요할 수 있답니다."],
      ["풀어서 말하기 (Circumlocution)", "정확한 단어가 생각나지 않을 때 다른 말로 풀어서 설명하는 능력이에요. 실제 대화에서 매우 유용한 전략이에요."],
    ];
    const html = items.map(([q, a], i) => `
      <div class="gloss-item" data-i="${i}">
        <button class="gloss-q">${q}<span class="plus">+</span></button>
        <div class="gloss-a"><div class="gloss-a-inner">${a}</div></div>
      </div>`).join("");
    return `
    <section class="section">
      <div class="section-head">
        <div class="section-icon" style="background:${cssVar("--slate")}">${icon("info", 20)}</div>
        <div>
          <h2>용어가 궁금하신가요?</h2>
          <p class="desc">리포트에 나오는 어려운 용어들을 쉬운 말로 풀어 드릴게요.</p>
        </div>
      </div>
      <div class="glossary">${html}</div>
    </section>`;
  }

  /* ============================================================
     INTERACTIONS
  ============================================================ */
  function wireInteractions() {
    // speaker switch
    $$(".speaker-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        state.reportIdx = Number(btn.dataset.speaker);
        renderAll();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    // timestamp play buttons + glossary + games (event delegation on root)
    $("#reportRoot").addEventListener("click", (e) => {
      const vocabChip = e.target.closest("[data-vocab-word]");
      if (vocabChip) { showVocabularyModal(vocabChip.dataset.vocabWord); return; }

      const tsBtn = e.target.closest(".ts-btn");
      if (tsBtn) { toggleSegment(tsBtn); return; }

      const glossQ = e.target.closest(".gloss-q");
      if (glossQ) { glossQ.parentElement.classList.toggle("open"); return; }

      const jwTile = e.target.closest(".jw-tile");
      if (jwTile) { handleJumbleTileClick(jwTile); return; }

      const jwReset = e.target.closest(".jw-reset");
      if (jwReset) { resetJumble(jwReset.dataset.id); return; }

      const jwCheck = e.target.closest(".jw-check");
      if (jwCheck) { checkJumble(jwCheck.dataset.id); return; }

      const quizOpt = e.target.closest(".quiz-opt");
      if (quizOpt) { handleQuizOption(quizOpt); return; }
    });
  }

  /* ---------------- vocabulary book modal ---------------- */
  const vocabModal = $("#vocabModal");
  const vocabModalWord = $("#vocabModalWord");
  const vocabModalMessage = $("#vocabModalMessage");
  const vocabModalActions = $("#vocabModalActions");

  function showVocabularyModal(word) {
    state.selectedVocab = word;
    vocabModalWord.textContent = word;
    vocabModalMessage.textContent = "이 단어를 단어장에 추가할까요?";
    vocabModalActions.innerHTML = `<button id="vocabAddYes" class="btn primary" type="button">예</button><button id="vocabAddNo" class="btn ghost" type="button">아니오</button>`;
    vocabModal.hidden = false;
    $("#vocabAddYes").focus();
  }

  function hideVocabularyModal() {
    vocabModal.hidden = true;
    state.selectedVocab = null;
  }

  vocabModal.addEventListener("click", (e) => {
    if (e.target.closest("[data-vocab-modal-close]") || e.target.id === "vocabAddNo" || e.target.id === "vocabClose") {
      hideVocabularyModal();
      return;
    }
    if (e.target.id === "vocabAddYes") {
      vocabModalMessage.innerHTML = `<strong>${esc(state.selectedVocab)}</strong>가 단어장에 추가됐습니다.`;
      vocabModalActions.innerHTML = `<button id="vocabClose" class="btn primary" type="button">닫기</button>`;
      $("#vocabClose").focus();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !vocabModal.hidden) hideVocabularyModal();
  });

  function toggleSegment(btn) {
    const audioEl = $("#audioEl");
    const start = Number(btn.dataset.start);
    const end = Number(btn.dataset.end);
    const isThisPlaying = btn.classList.contains("playing");

    $$(".ts-btn.playing").forEach(b => setTsBtnPlaying(b, false));

    if (isThisPlaying) {
      audioEl.pause();
      state.activeSeg = null;
      return;
    }
    setTsBtnPlaying(btn, true);
    state.activeSeg = { start, end, btn };
    audioEl.currentTime = start;
    setPlayerPlaying(true);
    audioEl.play().catch(() => setPlayerPlaying(false));
    $("#playerSegmentLabel").textContent = `${fmtClock(start)} – ${fmtClock(end)} 구간 재생 중`;
  }

  function setTsBtnPlaying(btn, playing) {
    btn.classList.toggle("playing", playing);
    btn.querySelector(".ts-play-icon").hidden = playing;
    btn.querySelector(".ts-pause-icon").hidden = !playing;
  }

  /* ---------------- jumble word game ---------------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function handleJumbleTileClick(tile) {
    const id = tile.dataset.id;
    const card = $(`#${id}`);
    const assembly = $(`.jw-assembly[data-id="${id}"]`, card);
    const inBank = tile.parentElement.classList.contains("jw-bank");
    if (inBank) {
      assembly.appendChild(tile);
    } else {
      $(`.jw-bank[data-id="${id}"]`, card).appendChild(tile);
    }
    $(`.game-feedback[data-id="${id}"]`, card).textContent = "";
    card.classList.remove("correct", "incorrect");
  }

  function resetJumble(id) {
    const card = $(`#${id}`);
    const bank = $(`.jw-bank[data-id="${id}"]`, card);
    const assembly = $(`.jw-assembly[data-id="${id}"]`, card);
    const tiles = shuffle($$(".jw-tile", card));
    assembly.innerHTML = "";
    bank.innerHTML = "";
    tiles.forEach(t => bank.appendChild(t));
    $(`.game-feedback[data-id="${id}"]`, card).textContent = "";
    card.classList.remove("correct", "incorrect");
  }

  function normalizeWords(str) {
    return str.toLowerCase().replace(/[.,!?]/g, "").trim().split(/\s+/).filter(Boolean);
  }

  function checkJumble(id) {
    const card = $(`#${id}`);
    const assembly = $(`.jw-assembly[data-id="${id}"]`, card);
    const built = $$(".jw-tile", assembly).map(t => t.dataset.word).join(" ");
    const answer = card.dataset.answer;
    const feedback = $(`.game-feedback[data-id="${id}"]`, card);
    const isCorrect = normalizeWords(built).join(" ") === normalizeWords(answer).join(" ");
    card.classList.toggle("correct", isCorrect);
    card.classList.toggle("incorrect", !isCorrect);
    feedback.innerHTML = isCorrect
      ? `${icon("check", 14)} 정답이에요! 훌륭해요.`
      : `${icon("x", 14)} 다시 시도해보세요. 정답: <b>${esc(answer)}</b>`;
  }

  /* ---------------- multiple choice (quiz / rewrite) ---------------- */
  function handleQuizOption(optBtn) {
    const id = optBtn.dataset.id;
    const card = $(`#${id}`);
    const answer = card.dataset.answer;
    const feedback = $(`.game-feedback[data-id="${id}"]`, card);
    const isCorrect = optBtn.dataset.val === answer;

    $$(".quiz-opt", card).forEach(b => b.classList.remove("selected", "correct", "incorrect"));
    optBtn.classList.add("selected", isCorrect ? "correct" : "incorrect");
    feedback.innerHTML = isCorrect
      ? `${icon("check", 14)} 정답이에요!`
      : `${icon("x", 14)} 아쉬워요.${card.dataset.hint ? ` <span class="hint">Hint: ${esc(card.dataset.hint)}</span>` : ""}`;
  }

  /* ============================================================
     STICKY AUDIO PLAYER
  ============================================================ */
  function initPlayer() {
    const audioEl = $("#audioEl");
    const playBtn = $("#playPauseBtn");
    const speedBtn = $("#speedBtn");
    const speeds = [1, 1.25, 1.5, 0.75];
    let speedIdx = 0;

    playBtn.addEventListener("click", () => {
      if (audioEl.paused) {
        state.activeSeg = null;
        setPlayerPlaying(true);
        audioEl.play().catch(() => setPlayerPlaying(false));
      } else {
        audioEl.pause();
        setPlayerPlaying(false);
      }
    });

    speedBtn.addEventListener("click", () => {
      speedIdx = (speedIdx + 1) % speeds.length;
      audioEl.playbackRate = speeds[speedIdx];
      speedBtn.textContent = `${speeds[speedIdx].toFixed(2).replace(/0$/, "")}x`;
    });

    audioEl.addEventListener("play", () => {
      setPlayerPlaying(true);
      updatePlayerUI();
    });
    audioEl.addEventListener("pause", () => {
      setPlayerPlaying(false);
      updatePlayerUI();
      if (state.activeSeg?.btn) setTsBtnPlaying(state.activeSeg.btn, false);
    });
    audioEl.addEventListener("loadedmetadata", updatePlayerUI);

    audioEl.addEventListener("timeupdate", () => {
      updateSeekUI();
      if (state.activeSeg && audioEl.currentTime >= state.activeSeg.end + 0.15) {
        audioEl.pause();
        if (state.activeSeg.btn) setTsBtnPlaying(state.activeSeg.btn, false);
        state.activeSeg = null;
      }
    });

    const seekWrap = $("#playerSeek");
    seekWrap.addEventListener("click", (e) => {
      const track = $(".player-seek-track", seekWrap);
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      state.activeSeg = null;
      audioEl.currentTime = ratio * (audioEl.duration || 0);
    });

    setPlayerPlaying(false);
    updatePlayerUI();
  }

  function updatePlayerUI() {
    const audioEl = $("#audioEl");
    $("#playerTimeLabel").textContent = `${fmtClock(audioEl.currentTime)} / ${fmtClock(audioEl.duration)}`;
    if (audioEl.paused && !state.activeSeg) {
      $("#playerSegmentLabel").textContent = "재생할 구간을 선택하세요";
    }
  }

  function setPlayerPlaying(playing) {
    const playBtn = $("#playPauseBtn");
    playBtn.querySelector(".player-control-icon").innerHTML = icon(playing ? "pause" : "play", 18);
    playBtn.setAttribute("aria-label", playing ? "일시정지" : "재생");
  }

  function updateSeekUI() {
    const audioEl = $("#audioEl");
    const dur = audioEl.duration || 0;
    const pct = dur ? (audioEl.currentTime / dur) * 100 : 0;
    $("#playerSeekFill").style.width = `${pct}%`;
    $("#playerSeekHandle").style.left = `${pct}%`;
    $("#playerTimeLabel").textContent = `${fmtClock(audioEl.currentTime)} / ${fmtClock(dur)}`;
  }

  /* ============================================================ */
})();
