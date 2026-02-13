
const DATA_FILE = "GP_test.json";

let settings = {
  show_progress: true,
  shuffle_options: true,
  show_explanation: true,
  shuffle_questions: true
};

let questions = [];
let order = [];
let idx = 0;

let score = 0;
let answered = 0;
let currentAnswered = false;
let lastWasCorrect = false;


// key: question.id  value: { selected: string, isCorrect: boolean }
const responses = new Map();

const elStatus = document.getElementById("status");
const elProgress = document.getElementById("progress");
const elQuestion = document.getElementById("question");
const elOptions = document.getElementById("options");
const elResult = document.getElementById("result");
const elExplanation = document.getElementById("explanation");
const elScore = document.getElementById("score");
const elAnswered = document.getElementById("answered");
const elTotal = document.getElementById("total");
const elFails = document.getElementById("fails");

const btnAnswer = document.getElementById("btnAnswer");
const btnNext = document.getElementById("btnNext");
const btnPrev = document.getElementById("btnPrev");     
const btnRestart = document.getElementById("btnRestart");

btnAnswer.addEventListener("click", onAnswer);
btnNext.addEventListener("click", onNext);
btnPrev.addEventListener("click", onPrev);              
btnRestart.addEventListener("click", restart);

init();

async function init() {
  try {
   
    elStatus.textContent = "Cargando preguntas…";

    const res = await fetch(DATA_FILE, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${DATA_FILE} (HTTP ${res.status})`);

    const data = await res.json();

    if (data.settings && typeof data.settings === "object") {
      settings = { ...settings, ...data.settings };
    }

    if (!Array.isArray(data.questions)) throw new Error("El JSON no contiene 'questions' como array.");

    questions = data.questions.map(q => normalizeQuestion(q));
    order = Array.from({ length: questions.length }, (_, i) => i);

    if (settings.shuffle_questions) shuffleInPlace(order);

    elTotal.textContent = String(questions.length);
    elStatus.textContent = ""; 
    btnRestart.disabled = false;

    renderQuestion();
  } catch (err) {
    elStatus.textContent = "Error al cargar.";
    elQuestion.textContent = "No se pudo iniciar el test.";
    elOptions.innerHTML = `<div class="muted small">Detalle: ${escapeHtml(err.message)}</div>`;
    btnAnswer.disabled = true;
    btnNext.disabled = true;
    btnPrev.disabled = true;
  }
}

// Si tus preguntas traen explanation en raíz o explicacion en meta:
function normalizeQuestion(q) {
  const question = String(q.question ?? "");
  const options = Array.isArray(q.options) ? q.options.map(String) : [];
  const correct = String(q.correct_answer ?? "");

  const meta = (q.meta && typeof q.meta === "object") ? q.meta : {};
  const explanation =
    q.explanation != null ? String(q.explanation) :
    meta.explicacion != null ? String(meta.explicacion) :
    "";

  return {
    id: String(q.id ?? ""),
    type: String(q.type ?? "single_choice"),
    question,
    options,
    correct_answer: correct,
    explanation
  };
}

function renderQuestion() {
  const q = questions[order[idx]];
  const saved = responses.get(q.id);

  currentAnswered = Boolean(saved);
  lastWasCorrect = saved ? saved.isCorrect : false;

  elResult.innerHTML = "";
  elExplanation.style.display = "none";
  elExplanation.textContent = "";

  elQuestion.textContent = q.question || "(Sin enunciado)";
  elOptions.innerHTML = "";

  // progreso
  if (settings.show_progress) {
    elProgress.textContent = `Pregunta ${idx + 1} / ${questions.length}`;
  } else {
    elProgress.textContent = "";
  }

  // opciones (con shuffle opcional)
  // IMPORTANTE: si ya estaba respondida, NO barajar, para que coincida la selección guardada
  const opts = q.options.slice();
  if (!saved && settings.shuffle_options) shuffleInPlace(opts);

  opts.forEach((opt, i) => {
    const id = `opt_${idx}_${i}`;
    const label = document.createElement("label");
    label.className = "opt";
    label.setAttribute("for", id);

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "opt";
    input.id = id;
    input.value = opt;

    // restaurar selección si ya estaba respondida
    if (saved && saved.selected === opt) input.checked = true;

    // si no está respondida, habilita botón responder al seleccionar
    input.addEventListener("change", () => {
      if (!currentAnswered) btnAnswer.disabled = false;
    });

    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + opt));
    elOptions.appendChild(label);
  });

  // botones
  btnPrev.disabled = idx === 0;         // habilita si no es la primera
  btnNext.disabled = !currentAnswered;  // si ya respondida, puedes avanzar
  btnAnswer.disabled = true;            // hasta que selecciones algo (si no respondida)

  // si ya estaba respondida, mostramos feedback y bloqueamos inputs
  if (saved) {
    showFeedbackForSaved(q, saved);
    document.querySelectorAll('input[name="opt"]').forEach(inp => (inp.disabled = true));
    btnAnswer.disabled = true;
  }

  elStatus.textContent = ""; // sin "Listo."
  updateScoreboard();
}

function showFeedbackForSaved(q, saved) {
  if (saved.isCorrect) {
    elResult.innerHTML = `<span class="ok">Correcta</span>`;
  } else {
    elResult.innerHTML =
      `<span class="bad">Incorrecta</span>` +
      `<div class="muted small" style="margin-top:6px;">Correcta: <strong>${escapeHtml(q.correct_answer)}</strong></div>`;
  }

  if (settings.show_explanation && q.explanation && q.explanation.trim().length > 0) {
    elExplanation.textContent = q.explanation;
    elExplanation.style.display = "block";
  }
}

function onAnswer() {
  if (currentAnswered) return;

  const q = questions[order[idx]];
  const selected = document.querySelector('input[name="opt"]:checked');
  if (!selected) return;

  const isCorrect = selected.value === q.correct_answer;

  // guardar respuesta para permitir volver atrás sin recontar
  responses.set(q.id, { selected: selected.value, isCorrect });

  currentAnswered = true;
  answered += 1;
  if (isCorrect) score += 1;

  // feedback
  if (isCorrect) {
    elResult.innerHTML = `<span class="ok">Correcta</span>`;
  } else {
    elResult.innerHTML =
      `<span class="bad">Incorrecta</span>` +
      `<div class="muted small" style="margin-top:6px;">Correcta: <strong>${escapeHtml(q.correct_answer)}</strong></div>`;
  }

  // explicación
  if (settings.show_explanation && q.explanation && q.explanation.trim().length > 0) {
    elExplanation.textContent = q.explanation;
    elExplanation.style.display = "block";
  }

  // bloquear cambios
  document.querySelectorAll('input[name="opt"]').forEach(inp => (inp.disabled = true));

  btnAnswer.disabled = true;
  btnNext.disabled = false;
  btnPrev.disabled = idx === 0;

  elStatus.textContent = ""; // sin "Respondida." también (si quieres)
  updateScoreboard();
}

function onNext() {
  if (!currentAnswered) return;

  if (idx < questions.length - 1) {
    idx += 1;
    renderQuestion();
  } else {
    showEnd();
  }
}

function onPrev() {
  if (idx === 0) return;
  idx -= 1;
  renderQuestion();
}

function showEnd() {
  elStatus.textContent = ""; // o "Fin del test." si quieres
  elProgress.textContent = settings.show_progress ? `Fin` : "";
  elQuestion.textContent = "Fin del test";
  elOptions.innerHTML = "";

  elResult.innerHTML = `<div><strong>Puntuación:</strong> ${score} / ${questions.length}</div>`;
  elExplanation.style.display = "none";
  elExplanation.textContent = "";

  btnAnswer.disabled = true;
  btnNext.disabled = true;
  btnPrev.disabled = false;

  updateScoreboard();
}

function restart() {
  idx = 0;
  score = 0;
  answered = 0;
  currentAnswered = false;

  responses.clear();

  order = Array.from({ length: questions.length }, (_, i) => i);
  if (settings.shuffle_questions) shuffleInPlace(order);

  elStatus.textContent = "";
  renderQuestion();
}

function updateScoreboard() {
  elScore.textContent = String(score);
  elAnswered.textContent = String(answered);
  elTotal.textContent = String(questions.length);

  const fails = Math.max(0, answered - score);

  // Seguridad: si no existe el elemento, no rompas el test
  if (elFails) {
    elFails.textContent = String(fails);
  } else {
    console.warn("No existe #fails en el HTML");
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
