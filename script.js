// ===== AUDIO (Fix iOS/PWA) =====
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  audioCtx = new AudioCtx();
}

// ปลดล็อกเสียงบน iOS: ต้องเรียกจาก user gesture ครั้งแรก
function unlockAudioOnce() {
  initAudio();
  if (!audioCtx) return;

  audioCtx.resume?.();
  // เอา listener ออกหลังปลดล็อกครั้งแรก
  window.removeEventListener("touchstart", unlockAudioOnce);
  window.removeEventListener("mousedown", unlockAudioOnce);
  window.removeEventListener("pointerdown", unlockAudioOnce);
}

// ใส่ listener เพื่อปลดล็อก
window.addEventListener("touchstart", unlockAudioOnce, { passive: true });
window.addEventListener("mousedown", unlockAudioOnce);
window.addEventListener("pointerdown", unlockAudioOnce);

const STORAGE_KEY = "jo_todos_final_v3";
const THEME_KEY = "jo_theme_final_v2"; // ใช้คีย์เดิมได้

// ===== ELEMENTS =====
const todoForm = document.getElementById("todoForm");
const todoInput = document.getElementById("todoInput");
const dueInput = document.getElementById("dueInput");
const todoList = document.getElementById("todoList");
const countText = document.getElementById("countText");

const tabAll = document.getElementById("tabAll");
const tabTodo = document.getElementById("tabTodo");
const tabDone = document.getElementById("tabDone");

const clearDoneBtn = document.getElementById("clearDoneBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

const progressText = document.getElementById("progressText");
const progressDetail = document.getElementById("progressDetail");
const progressFill = document.getElementById("progressFill");

const emptyState = document.getElementById("emptyState");

const toast = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");
const toastCancelBtn = document.getElementById("toastCancelBtn");
const toastOkBtn = document.getElementById("toastOkBtn");
const undoBtn = document.getElementById("undoBtn");

const fabAdd = document.getElementById("fabAdd");
const themeBtn = document.getElementById("themeBtn");

// ===== STATE =====
let todos = loadTodos();
let currentFilter = "all";

// undo (เฉพาะลบ 1 รายการ)
let lastDeleted = null; // { todo, index }

// toast state
let toastTimer = null;
let toastToken = 0; // กัน timer เก่าทำงานทับ
let toastMode = "none"; // "none" | "confirm" | "undo"
let confirmAction = null; // function|null

// drag state
let dragId = null;

// ===== INIT =====
initTheme();
setFilter("all");
closeToastHard();
render();

// ===== THEME =====
function initTheme() {
  if (!themeBtn) return;

  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light") {
    document.body.classList.add("light");
    themeBtn.textContent = "☀️";
  } else {
    document.body.classList.remove("light");
    themeBtn.textContent = "🌙";
  }

  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    if (document.body.classList.contains("light")) {
      localStorage.setItem(THEME_KEY, "light");
      themeBtn.textContent = "☀️";
    } else {
      localStorage.setItem(THEME_KEY, "dark");
      themeBtn.textContent = "🌙";
    }
    feedback("toggle");
  });
}

// ===== ADD =====
todoForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = todoInput.value.trim();
  if (!text) return;

  const newTodo = {
    id: Date.now(),
    text,
    done: false,
    due: (dueInput.value || "").trim()
  };

  todos.unshift(newTodo);
  saveTodos();
  feedback("add");

  todoInput.value = "";
  dueInput.value = "";
  render(true);
});

// ===== FAB (+) =====
fabAdd.addEventListener("click", () => {
  if (todoInput.value.trim()) {
    todoForm.requestSubmit();
  } else {
    todoInput.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

// ===== TABS =====
tabAll.onclick = () => setFilter("all");
tabTodo.onclick = () => setFilter("todo");
tabDone.onclick = () => setFilter("done");

function setFilter(filter) {
  currentFilter = filter;
  tabAll.classList.toggle("active", filter === "all");
  tabTodo.classList.toggle("active", filter === "todo");
  tabDone.classList.toggle("active", filter === "done");
  render();
}

// ===== CLEAR BUTTONS =====
// ลบที่ทำเสร็จ: ให้ขึ้น confirm toast เหมือนลบทั้งหมด ✅
clearDoneBtn.addEventListener("click", () => {
  const doneCount = todos.filter(t => t.done).length;
  if (doneCount === 0) return;

  showConfirmToast(
    `ลบงานที่ทำเสร็จ ${doneCount} รายการใช่ไหม?`,
    () => {
      todos = todos.filter(t => !t.done);
      saveTodos();
      feedback("delete");
      render();
    }
  );
});

// ลบทั้งหมด: confirm toast แบบมือถือ ✅
clearAllBtn.addEventListener("click", () => {
  if (todos.length === 0) return;

  showConfirmToast(
    "ต้องการลบทั้งหมดจริงไหม?",
    () => {
      todos = [];
      saveTodos();
      feedback("delete");
      render();
    }
  );
});

// ===== LIST CLICK =====
todoList.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;

  const id = Number(li.dataset.id);

  if (e.target.matches(".chk")) toggleDone(id);
  if (e.target.matches(".deleteBtn")) deleteTodoAnimated(id, li);
});

// ===== DRAG & DROP =====
todoList.addEventListener("dragstart", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  dragId = Number(li.dataset.id);
  li.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
});

todoList.addEventListener("dragend", (e) => {
  const li = e.target.closest("li");
  if (li) li.classList.remove("dragging");
  dragId = null;
});

todoList.addEventListener("dragover", (e) => e.preventDefault());

todoList.addEventListener("drop", (e) => {
  e.preventDefault();
  const target = e.target.closest("li");
  if (!target || dragId == null) return;

  const dropId = Number(target.dataset.id);
  if (dropId === dragId) return;

  reorderWithinVisible(dragId, dropId);
  saveTodos();
  render();
});

// ===== CORE =====
function toggleDone(id) {
  const t = todos.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveTodos();
  feedback("toggle");
  render();
}

// ลบ 1 รายการ + undo 10 วิ
function deleteTodoAnimated(id, li) {
  const index = todos.findIndex(x => x.id === id);
  if (index === -1) return;

  // ตั้งค่า undo ล่าสุด
  lastDeleted = { todo: todos[index], index };

  li.classList.add("removing");
  feedback("delete");

  setTimeout(() => {
    const idx2 = todos.findIndex(x => x.id === id);
    if (idx2 !== -1) {
      todos.splice(idx2, 1);
      saveTodos();
      render();
      showUndoToast10s();
    }
  }, 200);
}

// ===== TOAST (fix: ไม่ค้างแน่นอน) =====
function showUndoToast10s() {
  // ปิด toast เดิมก่อน (กันค้าง)
  closeToastHard();

  toastMode = "undo";
  confirmAction = null;

  toastMsg.textContent = "ลบแล้ว (กดย้อนกลับได้ภายใน 10 วินาที)";
  setToastButtons({ undo: true, confirm: false });
  openToast();
    document.body.classList.add("show-confirm");

  const myToken = ++toastToken;

  toastTimer = setTimeout(() => {
    // ซ่อนเฉพาะ toast ล่าสุด
    if (myToken === toastToken) {
      lastDeleted = null;
      closeToastHard();
    }
  }, 10000);
}

function showConfirmToast(message, onConfirm) {
  // ปิด toast เดิมก่อน (กันค้าง)
  closeToastHard();

  toastMode = "confirm";
  confirmAction = onConfirm;
  lastDeleted = null; // confirm ไม่ใช้ undo

  toastMsg.textContent = message;
  setToastButtons({ undo: false, confirm: true });
  openToast();
    document.body.classList.add("show-confirm");

  // ถ้าไม่กดอะไร ให้หายเองใน 10 วิ
  const myToken = ++toastToken;
  toastTimer = setTimeout(() => {
    if (myToken === toastToken) closeToastHard();
  }, 10000);
}

function setToastButtons({ undo, confirm }) {
  undoBtn.classList.toggle("hidden", !undo);
  toastCancelBtn.classList.toggle("hidden", !confirm);
  toastOkBtn.classList.toggle("hidden", !confirm);
}

function openToast() {
  toast.classList.remove("hidden");
}

// ปิดแบบ “ชัวร์” เคลียร์ทุกอย่าง
function closeToastHard() {
  toast.classList.add("hidden");
    document.body.classList.remove("show-confirm");

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  toastMode = "none";
  confirmAction = null;

  // กัน timer เก่ามาทับ
  toastToken++;
}

// ===== Toast Buttons =====
undoBtn.addEventListener("click", () => {
  if (toastMode !== "undo") {
    closeToastHard();
    return;
  }
  if (!lastDeleted) {
    closeToastHard();
    return;
  }

  todos.splice(lastDeleted.index, 0, lastDeleted.todo);
  lastDeleted = null;
  saveTodos();
  feedback("undo");
  closeToastHard();   // ✅ ปิดทันทีแน่นอน
  render(true);
});

toastCancelBtn.addEventListener("click", () => {
  // confirm cancel
  closeToastHard();   // ✅ ปิดทันทีแน่นอน
});

toastOkBtn.addEventListener("click", () => {
  if (toastMode !== "confirm") {
    closeToastHard();
    return;
  }

  const fn = confirmAction;
  closeToastHard();   // ✅ ปิดก่อนทำงานกันค้าง
  if (typeof fn === "function") fn();
});

// ===== RENDER =====
function render(animateEnter = false) {
  todoList.innerHTML = "";

  const visible = getVisibleTodos();

  if (visible.length === 0) emptyState.classList.remove("hidden");
  else emptyState.classList.add("hidden");

  for (const t of visible) {
    const li = document.createElement("li");
    li.className = "item" + (t.done ? " done" : "");
    li.dataset.id = String(t.id);
    li.draggable = true;

    li.innerHTML = `
      <input type="checkbox" class="chk" ${t.done ? "checked" : ""} />
      <span class="text"></span>
      ${makeDueBadge(t)}
      <button class="deleteBtn" type="button">ลบ</button>
    `;

    li.querySelector(".text").textContent = t.text;

    if (animateEnter) {
      li.classList.add("enter");
      requestAnimationFrame(() => li.classList.remove("enter"));
    }

    todoList.appendChild(li);
  }

  updateCount();
}

function getVisibleTodos() {
  if (currentFilter === "todo") return todos.filter(t => !t.done);
  if (currentFilter === "done") return todos.filter(t => t.done);
  return todos;
}

// ===== PROGRESS =====
function updateCount() {
  const total = todos.length;
  const done = todos.filter(t => t.done).length;
  countText.textContent = `${total} รายการ (เสร็จ ${done})`;
  updateProgress(done, total);
}

function updateProgress(done, total) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  progressText.textContent = `${percent}%`;
  progressDetail.textContent = `เสร็จ ${done} / ${total}`;
  progressFill.style.width = `${percent}%`;
}

// ===== DUE BADGE =====
function makeDueBadge(t) {
  if (!t.due) return `<span class="badge none">ไม่กำหนด</span>`;

  const status = dueStatus(t.due);
  if (t.done) return `<span class="badge none">${t.due}</span>`;
  if (status === "overdue") return `<span class="badge overdue">เกินกำหนด</span>`;
  if (status === "today") return `<span class="badge today">วันนี้</span>`;
  if (status === "tomorrow") return `<span class="badge tomorrow">พรุ่งนี้</span>`;
  return `<span class="badge none">${t.due}</span>`;
}

function dueStatus(dueStr) {
  const due = new Date(dueStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  if (due.getTime() === tomorrow.getTime()) return "tomorrow";
  return "future";
}

// ===== DRAG REORDER (รองรับแท็บ) =====
function reorderWithinVisible(dragId, dropId) {
  const visible = getVisibleTodos();
  const visibleIds = visible.map(t => t.id);

  const from = visibleIds.indexOf(dragId);
  const to = visibleIds.indexOf(dropId);
  if (from === -1 || to === -1) return;

  const [moved] = visibleIds.splice(from, 1);
  visibleIds.splice(to, 0, moved);

  const visibleSet = new Set(visibleIds);
  const reorderedVisible = visibleIds
    .map(id => todos.find(t => t.id === id))
    .filter(Boolean);

  const result = [];
  let visIndex = 0;

  for (const t of todos) {
    if (visibleSet.has(t.id)) result.push(reorderedVisible[visIndex++]);
    else result.push(t);
  }

  todos = result;
}

// ===== STORAGE =====
function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function loadTodos() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map(x => ({
        id: Number(x.id) || Date.now(),
        text: String(x.text || ""),
        done: Boolean(x.done),
        due: typeof x.due === "string" ? x.due : ""
      }))
      .filter(x => x.text.trim().length > 0);
  } catch {
    return [];
  }
}

// ===== FEEDBACK =====
function feedback(type) {
  // สั่น (ยังใช้ได้ปกติ)
  if (navigator.vibrate) {
    if (type === "delete") navigator.vibrate([20, 30, 20]);
    else navigator.vibrate(15);
  }

  // เสียง
  initAudio();
  if (!audioCtx) return;

  // iOS บางที context ถูก pause เอง ต้อง resume ก่อน
  if (audioCtx.state === "suspended") {
    audioCtx.resume?.();
  }

  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";

    // เลือกโทนเสียง
    if (type === "delete") osc.frequency.value = 360;
    else if (type === "undo") osc.frequency.value = 620;
    else if (type === "toggle") osc.frequency.value = 520;
    else osc.frequency.value = 740;

    // เสียงเบา ๆ แต่ชัด (ปรับได้)
    gain.gain.value = 0.06;

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    // ทำ envelope กันเสียงแตก
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    // เงียบไว้ ถ้าเครื่องบล็อกเสียง
  }
}