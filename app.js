const STORAGE_KEY = "job-board-v2";
const API_BASE = "/api";
const AUTH_TOKEN_KEY = "job-board-auth-token";
const AUTH_USER_KEY = "job-board-auth-user";

const STATUSES = ["待投递", "已投递", "笔试中", "面试中", "Offer", "已结束"];

const TASK_TEMPLATES = {
  通用: ["定制简历", "补全岗位动机", "确认投递材料"],
  产品: ["整理作品集案例", "准备业务分析题", "模拟产品思维面试"],
  研发: ["刷算法题", "复习项目亮点", "准备系统设计题"],
  运营: ["准备活动复盘案例", "梳理数据分析方法", "模拟场景题"]
};

const state = {
  applications: [],
  search: "",
  priority: "all",
  due: "all",
  currentView: "kanbanView",
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  useApi: false,
  authToken: "",
  currentUser: ""
};

const els = {
  apiMode: document.getElementById("apiMode"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  userBadge: document.getElementById("userBadge"),
  addBtn: document.getElementById("addBtn"),
  seedBtn: document.getElementById("seedBtn"),
  metrics: document.getElementById("metrics"),
  kanbanBoard: document.getElementById("kanbanBoard"),
  listBody: document.getElementById("listBody"),
  offerBody: document.getElementById("offerBody"),
  weeklyReport: document.getElementById("weeklyReport"),
  reminderList: document.getElementById("reminderList"),
  riskCount: document.getElementById("riskCount"),
  tabs: document.getElementById("tabs"),
  searchInput: document.getElementById("searchInput"),
  priorityFilter: document.getElementById("priorityFilter"),
  dueFilter: document.getElementById("dueFilter"),
  appModal: document.getElementById("appModal"),
  appForm: document.getElementById("appForm"),
  modalTitle: document.getElementById("modalTitle"),
  appId: document.getElementById("appId"),
  company: document.getElementById("company"),
  role: document.getElementById("role"),
  city: document.getElementById("city"),
  source: document.getElementById("source"),
  deadline: document.getElementById("deadline"),
  priority: document.getElementById("priority"),
  status: document.getElementById("status"),
  roleType: document.getElementById("roleType"),
  salary: document.getElementById("salary"),
  growth: document.getElementById("growth"),
  fit: document.getElementById("fit"),
  stability: document.getElementById("stability"),
  nextAction: document.getElementById("nextAction"),
  resume: document.getElementById("resume"),
  portfolio: document.getElementById("portfolio"),
  notes: document.getElementById("notes"),
  calendarTitle: document.getElementById("calendarTitle"),
  calendarGrid: document.getElementById("calendarGrid")
};

init();

async function init() {
  mountStatusOptions();
  bindEvents();
  state.useApi = await checkApi();
  await restoreAuth();
  await loadData();
  renderAll();
  syncAuthUi();
}

function mountStatusOptions() {
  els.status.innerHTML = STATUSES.map((s) => `<option value="${s}">${s}</option>`).join("");
}

function bindEvents() {
  els.addBtn.addEventListener("click", () => openModal());
  document.getElementById("cancelBtn").addEventListener("click", () => els.appModal.close());
  els.seedBtn.addEventListener("click", onResetSeed);
  els.loginBtn.addEventListener("click", onLogin);
  els.logoutBtn.addEventListener("click", onLogout);
  document.getElementById("generateReportBtn").addEventListener("click", renderWeeklyReport);
  document.getElementById("copyReportBtn").addEventListener("click", copyWeeklyReport);
  document.getElementById("downloadReportBtn").addEventListener("click", downloadWeeklyReport);

  els.appForm.addEventListener("submit", onSubmitForm);

  els.tabs.addEventListener("click", (e) => {
    if (!e.target.classList.contains("tab")) return;
    const viewId = e.target.dataset.view;
    switchView(viewId);
  });

  els.searchInput.addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderAll();
  });

  els.priorityFilter.addEventListener("change", (e) => {
    state.priority = e.target.value;
    renderAll();
  });

  els.dueFilter.addEventListener("change", (e) => {
    state.due = e.target.value;
    renderAll();
  });

  document.getElementById("prevMonth").addEventListener("click", () => {
    state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() - 1, 1);
    renderCalendar();
  });

  document.getElementById("nextMonth").addEventListener("click", () => {
    state.currentMonth = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 1);
    renderCalendar();
  });
}

function syncAuthUi() {
  if (!state.useApi) {
    els.userBadge.textContent = "本地模式";
    els.loginBtn.disabled = true;
    els.logoutBtn.disabled = true;
    els.usernameInput.disabled = true;
    els.passwordInput.disabled = true;
    els.addBtn.disabled = false;
    els.seedBtn.disabled = false;
    return;
  }

  const loggedIn = Boolean(state.authToken && state.currentUser);
  els.userBadge.textContent = loggedIn ? `用户: ${state.currentUser}` : "未登录";
  els.logoutBtn.disabled = !loggedIn;
  els.addBtn.disabled = !loggedIn;
  els.seedBtn.disabled = !loggedIn;
}

async function checkApi() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) return false;
    const json = await res.json();
    els.apiMode.textContent = `数据模式：${json.ok ? "后端API + SQLite" : "本地存储"}`;
    return !!json.ok;
  } catch {
    els.apiMode.textContent = "数据模式：本地存储（未检测到后端）";
    return false;
  }
}

async function restoreAuth() {
  if (!state.useApi) return;
  const token = localStorage.getItem(AUTH_TOKEN_KEY) || "";
  const username = localStorage.getItem(AUTH_USER_KEY) || "";
  if (!token || !username) return;

  state.authToken = token;
  state.currentUser = username;

  try {
    const res = await authFetch(`${API_BASE}/auth/me`);
    if (!res.ok) throw new Error("invalid token");
    const data = await res.json();
    state.currentUser = data.username;
  } catch {
    clearAuth();
  }
}

function saveAuth(token, username) {
  state.authToken = token;
  state.currentUser = username;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, username);
}

function clearAuth() {
  state.authToken = "";
  state.currentUser = "";
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

async function authFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (state.authToken) {
    headers.Authorization = `Bearer ${state.authToken}`;
  }

  return fetch(url, {
    ...options,
    headers
  });
}

async function onLogin() {
  if (!state.useApi) {
    alert("当前未连接后端，无法使用登录。请先启动服务器。");
    return;
  }

  const username = els.usernameInput.value.trim();
  const password = els.passwordInput.value.trim();
  if (!username || !password) {
    alert("请输入用户名和密码");
    return;
  }

  const res = await fetch(`${API_BASE}/auth/register-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.message || "登录失败");
    return;
  }

  saveAuth(data.token, data.user.username);
  els.passwordInput.value = "";
  await loadData();
  renderAll();
  syncAuthUi();
}

async function onLogout() {
  if (state.useApi && state.authToken) {
    try {
      await authFetch(`${API_BASE}/auth/logout`, { method: "POST" });
    } catch {
      // ignore network failure on logout
    }
  }

  clearAuth();
  state.applications = [];
  renderAll();
  syncAuthUi();
}

async function onResetSeed() {
  if (state.useApi) {
    if (!state.authToken) {
      alert("请先登录后再重置数据");
      return;
    }

    const res = await authFetch(`${API_BASE}/seed`, { method: "POST" });
    if (!res.ok) {
      alert("重置失败，请检查登录状态");
      return;
    }
    await loadData();
  } else {
    localStorage.removeItem(STORAGE_KEY);
    state.applications = getSeedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.applications));
  }
  renderAll();
}

function switchView(viewId) {
  state.currentView = viewId;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewId);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });
}

async function loadData() {
  if (state.useApi) {
    if (!state.authToken) {
      state.applications = [];
      return;
    }

    const res = await authFetch(`${API_BASE}/applications`);
    if (res.status === 401) {
      clearAuth();
      state.applications = [];
      return;
    }

    const data = await res.json();
    state.applications = Array.isArray(data) ? data : [];
    return;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    state.applications = JSON.parse(raw);
    return;
  }

  state.applications = getSeedData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.applications));
}

function getSeedData() {
  return [
    {
      id: crypto.randomUUID(),
      company: "美团",
      role: "产品经理实习生",
      city: "北京",
      source: "官网",
      deadline: offsetDate(4),
      priority: "高",
      status: "笔试中",
      roleType: "产品",
      nextAction: "4月23日前完成在线笔试",
      resume: "简历_产品_v3.pdf",
      portfolio: "https://portfolio.example.com",
      notes: "关注业务分析题和增长案例",
      salary: 12000,
      growth: 8,
      fit: 8,
      stability: 7,
      tasks: toTasks(TASK_TEMPLATES["产品"])
    },
    {
      id: crypto.randomUUID(),
      company: "腾讯",
      role: "产品策划",
      city: "深圳",
      source: "官网",
      deadline: offsetDate(18),
      priority: "中",
      status: "Offer",
      roleType: "产品",
      nextAction: "确认 offer 选择并回复 HR",
      resume: "简历_产品_v2.pdf",
      portfolio: "",
      notes: "一面反馈沟通良好",
      salary: 14000,
      growth: 8,
      fit: 9,
      stability: 8,
      tasks: toTasks(TASK_TEMPLATES["产品"])
    }
  ];
}

function toTasks(list) {
  return list.map((text) => ({ text, done: false }));
}

async function persistUpsert(payload) {
  if (state.useApi) {
    if (!state.authToken) {
      alert("请先登录");
      return;
    }

    const exists = state.applications.some((x) => x.id === payload.id);
    const url = exists ? `${API_BASE}/applications/${payload.id}` : `${API_BASE}/applications`;
    const method = exists ? "PUT" : "POST";
    const res = await authFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      alert("保存失败，请检查登录状态");
      return;
    }

    await loadData();
  } else {
    const existing = state.applications.find((x) => x.id === payload.id);
    if (existing) {
      state.applications = state.applications.map((x) => (x.id === payload.id ? payload : x));
    } else {
      state.applications.unshift(payload);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.applications));
  }
}

async function persistDelete(id) {
  if (state.useApi) {
    if (!state.authToken) {
      alert("请先登录");
      return;
    }

    const res = await authFetch(`${API_BASE}/applications/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("删除失败，请检查登录状态");
      return;
    }
    await loadData();
  } else {
    state.applications = state.applications.filter((x) => x.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.applications));
  }
}

function renderAll() {
  renderMetrics();
  renderKanban();
  renderList();
  renderOfferComparison();
  renderReminders();
  renderCalendar();
  renderWeeklyReport();
}

function getFilteredApplications() {
  return state.applications.filter((item) => {
    const hay = `${item.company} ${item.role} ${item.city}`.toLowerCase();
    const hitSearch = !state.search || hay.includes(state.search);
    const hitPriority = state.priority === "all" || item.priority === state.priority;
    const hitDue = dueMatch(item.deadline, state.due);
    return hitSearch && hitPriority && hitDue;
  });
}

function dueMatch(deadline, dueFilter) {
  if (dueFilter === "all") return true;
  const d = daysUntil(deadline);
  if (dueFilter === "overdue") return d < 0;
  return d >= 0 && d <= Number(dueFilter);
}

function renderMetrics() {
  const items = state.applications;
  const total = items.length;
  const submitted = items.filter((x) => x.status !== "待投递").length;
  const interviews = items.filter((x) => x.status === "面试中").length;
  const offers = items.filter((x) => x.status === "Offer").length;
  const overdue = items.filter((x) => daysUntil(x.deadline) < 0 && x.status !== "已结束").length;

  const interviewRate = submitted ? `${Math.round((interviews / submitted) * 100)}%` : "0%";
  const offerRate = submitted ? `${Math.round((offers / submitted) * 100)}%` : "0%";

  const cards = [
    ["申请总数", total],
    ["已投递", submitted],
    ["面试中", interviews],
    ["面试率", interviewRate],
    ["Offer率", offerRate]
  ];

  els.metrics.innerHTML = cards
    .map(
      ([label, val]) =>
        `<article class="metric-card"><p>${label}</p><strong>${val}</strong>${label === "申请总数" ? `<p>逾期风险 ${overdue}</p>` : ""}</article>`
    )
    .join("");
}

function renderKanban() {
  const items = getFilteredApplications();

  els.kanbanBoard.innerHTML = STATUSES.map((status) => {
    const list = items.filter((item) => item.status === status);

    const cards = list
      .map(
        (item) => `
        <div class="card" draggable="true" data-id="${item.id}" data-priority="${item.priority}">
          <h5>${item.company} · ${item.role}</h5>
          <p>${item.city} | ${item.source} | ${item.priority}优先级</p>
          <p class="deadline ${daysUntil(item.deadline) < 0 ? "overdue" : ""}">截止：${item.deadline}（${humanDeadline(item.deadline)}）</p>
          <p>下一步：${item.nextAction || "待补充"}</p>
        </div>
      `
      )
      .join("");

    return `
      <section class="kanban-col" data-status="${status}">
        <div class="col-head"><h4>${status}</h4><span class="badge">${list.length}</span></div>
        ${cards || "<p class='empty'>暂无申请</p>"}
      </section>
    `;
  }).join("");

  wireKanbanEvents();
}

function wireKanbanEvents() {
  const cards = document.querySelectorAll(".card");
  const cols = document.querySelectorAll(".kanban-col");

  cards.forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", card.dataset.id);
    });

    card.addEventListener("click", () => {
      openModal(state.applications.find((x) => x.id === card.dataset.id));
    });
  });

  cols.forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });

    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));

    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      const targetStatus = col.dataset.status;
      const item = state.applications.find((x) => x.id === id);
      if (!item) return;
      await persistUpsert({ ...item, status: targetStatus });
      renderAll();
    });
  });
}

function renderList() {
  const list = getFilteredApplications();
  els.listBody.innerHTML = list
    .map(
      (item) => `
      <tr>
        <td>${item.company}</td>
        <td>${item.role}</td>
        <td>${item.city}</td>
        <td>${item.deadline}</td>
        <td>${item.priority}</td>
        <td>
          <select data-action="status" data-id="${item.id}">
            ${STATUSES.map((s) => `<option value="${s}" ${s === item.status ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
        <td>${item.nextAction || "-"}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost" data-action="edit" data-id="${item.id}">编辑</button>
            <button class="btn btn-ghost" data-action="delete" data-id="${item.id}">删除</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");

  els.listBody.querySelectorAll("button,select").forEach((node) => {
    node.addEventListener("click", onListAction);
    node.addEventListener("change", onListAction);
  });
}

async function onListAction(e) {
  const action = e.target.dataset.action;
  const id = e.target.dataset.id;
  if (!action || !id) return;

  if (action === "edit") {
    openModal(state.applications.find((x) => x.id === id));
    return;
  }

  if (action === "delete") {
    if (!confirm("确认删除该申请记录？")) return;
    await persistDelete(id);
    renderAll();
    return;
  }

  if (action === "status") {
    const item = state.applications.find((x) => x.id === id);
    if (!item) return;
    await persistUpsert({ ...item, status: e.target.value });
    renderAll();
  }
}

function renderOfferComparison() {
  const offers = state.applications.filter((x) => x.status === "Offer");
  if (!offers.length) {
    els.offerBody.innerHTML = "<tr><td colspan='8'>暂无 Offer 数据。将申请状态更新为 Offer 后会显示在这里。</td></tr>";
    return;
  }

  const ranked = offers
    .map((x) => {
      const salary = Number(x.salary || 0);
      const growth = Number(x.growth || 5);
      const fit = Number(x.fit || 5);
      const stability = Number(x.stability || 5);
      const score = Math.round(salary / 2000 + growth * 2 + fit * 2 + stability * 1.5);
      return { ...x, salary, growth, fit, stability, score };
    })
    .sort((a, b) => b.score - a.score);

  els.offerBody.innerHTML = ranked
    .map(
      (item) => `
      <tr>
        <td>${item.company}</td>
        <td>${item.role}</td>
        <td>${item.city}</td>
        <td>${item.salary}</td>
        <td>${item.growth}</td>
        <td>${item.fit}</td>
        <td>${item.stability}</td>
        <td><strong>${item.score}</strong></td>
      </tr>
    `
    )
    .join("");
}

function renderReminders() {
  if (state.useApi && !state.authToken) {
    els.riskCount.textContent = "风险事项 0";
    els.reminderList.innerHTML = "<li>请先登录后查看你的专属提醒。</li>";
    return;
  }

  const reminders = state.applications
    .filter((item) => item.status !== "已结束")
    .map((item) => {
      const d = daysUntil(item.deadline);
      let level = "";
      if (d < 0) level = "已逾期";
      else if (d <= 1) level = "1天内";
      else if (d <= 3) level = "3天内";
      else if (d <= 7) level = "7天内";
      else if (d <= 14) level = "14天内";
      return { ...item, d, level };
    })
    .filter((x) => x.level)
    .sort((a, b) => a.d - b.d);

  els.riskCount.textContent = `风险事项 ${reminders.length}`;
  els.reminderList.innerHTML = reminders.length
    ? reminders
        .map((item) => {
          const cls = item.priority === "高" ? "priority-high" : item.priority === "中" ? "priority-mid" : "priority-low";
          const msg = item.d < 0 ? `逾期 ${Math.abs(item.d)} 天` : `剩余 ${item.d} 天`;
          return `<li><strong>${item.company} · ${item.role}</strong> <span class="${cls}">[${item.priority}优先级]</span> - 截止 ${item.deadline}，${msg}，请尽快处理。</li>`;
        })
        .join("")
    : "<li>暂无风险事项，保持节奏即可。</li>";
}

function renderCalendar() {
  const first = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
  const last = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth() + 1, 0);
  const startWeekday = first.getDay();
  const totalDays = last.getDate();

  els.calendarTitle.textContent = `${first.getFullYear()} 年 ${first.getMonth() + 1} 月`;

  const weekLabels = ["日", "一", "二", "三", "四", "五", "六"]
    .map((d) => `<div class="weekday">${d}</div>`)
    .join("");

  let daysHtml = "";
  for (let i = 0; i < startWeekday; i += 1) daysHtml += `<div class="day muted"></div>`;

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(first.getFullYear(), first.getMonth(), day);
    const dateStr = formatDate(date);
    const daily = state.applications.filter((x) => x.deadline === dateStr);
    const isToday = formatDate(new Date()) === dateStr;

    daysHtml += `
      <div class="day ${isToday ? "today" : ""}">
        <div class="day-num">${day}</div>
        ${daily.slice(0, 2).map((x) => `<div class="day-item">${x.company}-${x.role}</div>`).join("")}
        ${daily.length > 2 ? `<div class="day-item">+${daily.length - 2} 条</div>` : ""}
      </div>
    `;
  }

  els.calendarGrid.innerHTML = weekLabels + daysHtml;
}

function renderWeeklyReport() {
  const all = state.applications;
  const submitted = all.filter((x) => x.status !== "待投递");
  const interviewing = all.filter((x) => x.status === "面试中");
  const offers = all.filter((x) => x.status === "Offer");

  const risks = all
    .filter((x) => x.status !== "已结束")
    .map((x) => ({ ...x, d: daysUntil(x.deadline) }))
    .filter((x) => x.d <= 7)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);

  const nextFocus = all
    .filter((x) => x.nextAction)
    .sort((a, b) => daysUntil(a.deadline) - daysUntil(b.deadline))
    .slice(0, 5);

  const text = [
    `【求职周报】${formatDate(new Date())}`,
    "",
    "1. 本周进展",
    `- 申请总数：${all.length}`,
    `- 已投递：${submitted.length}`,
    `- 面试中：${interviewing.length}`,
    `- Offer 数：${offers.length}`,
    "",
    "2. 风险与卡点（7天内）",
    ...(risks.length
      ? risks.map((r) => `- ${r.company}-${r.role}：${r.d < 0 ? `已逾期${Math.abs(r.d)}天` : `剩余${r.d}天`}，动作：${r.nextAction || "待补充"}`)
      : ["- 无高风险事项"]),
    "",
    "3. 下周重点动作",
    ...(nextFocus.length
      ? nextFocus.map((f) => `- ${f.company}-${f.role}：${f.nextAction}`)
      : ["- 补充目标岗位并完成首批投递"]),
    "",
    "4. 复盘结论",
    `- 当前投递->Offer 转化率：${submitted.length ? Math.round((offers.length / submitted.length) * 100) : 0}%`,
    "- 建议保持高优先级岗位的节奏，并在每次面试后24小时内补充复盘。"
  ].join("\n");

  els.weeklyReport.value = text;
}

async function copyWeeklyReport() {
  if (!els.weeklyReport.value.trim()) renderWeeklyReport();

  try {
    await navigator.clipboard.writeText(els.weeklyReport.value);
    alert("周报已复制到剪贴板");
  } catch {
    els.weeklyReport.select();
    document.execCommand("copy");
    alert("周报已复制到剪贴板");
  }
}

function downloadWeeklyReport() {
  if (!els.weeklyReport.value.trim()) renderWeeklyReport();
  const blob = new Blob([els.weeklyReport.value], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `求职周报_${formatDate(new Date())}.txt`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

async function onSubmitForm(e) {
  e.preventDefault();

  const payload = {
    id: els.appId.value || crypto.randomUUID(),
    company: els.company.value.trim(),
    role: els.role.value.trim(),
    city: els.city.value.trim(),
    source: els.source.value.trim(),
    deadline: els.deadline.value,
    priority: els.priority.value,
    status: els.status.value,
    roleType: els.roleType.value,
    nextAction: els.nextAction.value.trim(),
    resume: els.resume.value.trim(),
    portfolio: els.portfolio.value.trim(),
    notes: els.notes.value.trim(),
    salary: Number(els.salary.value || 12000),
    growth: Number(els.growth.value || 7),
    fit: Number(els.fit.value || 7),
    stability: Number(els.stability.value || 7),
    tasks: []
  };

  const existing = state.applications.find((x) => x.id === payload.id);
  payload.tasks = existing?.tasks?.length ? existing.tasks : toTasks(TASK_TEMPLATES[payload.roleType] || TASK_TEMPLATES["通用"]);
  payload.salary = Number(payload.salary || existing?.salary || 12000);
  payload.growth = Number(payload.growth || existing?.growth || 7);
  payload.fit = Number(payload.fit || existing?.fit || 7);
  payload.stability = Number(payload.stability || existing?.stability || 7);

  await persistUpsert(payload);
  renderAll();
  els.appModal.close();
}

function openModal(item = null) {
  els.modalTitle.textContent = item ? "编辑申请" : "新建申请";
  els.appId.value = item?.id || "";
  els.company.value = item?.company || "";
  els.role.value = item?.role || "";
  els.city.value = item?.city || "";
  els.source.value = item?.source || "";
  els.deadline.value = item?.deadline || formatDate(new Date());
  els.priority.value = item?.priority || "中";
  els.status.value = item?.status || "待投递";
  els.roleType.value = item?.roleType || "通用";
  els.salary.value = Number(item?.salary ?? 12000);
  els.growth.value = Number(item?.growth ?? 7);
  els.fit.value = Number(item?.fit ?? 7);
  els.stability.value = Number(item?.stability ?? 7);
  els.nextAction.value = item?.nextAction || "";
  els.resume.value = item?.resume || "";
  els.portfolio.value = item?.portfolio || "";
  els.notes.value = item?.notes || "";
  els.appModal.showModal();
}

function daysUntil(dateStr) {
  const today = new Date();
  const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d2 = new Date(dateStr);
  return Math.ceil((d2 - d1) / 86400000);
}

function humanDeadline(dateStr) {
  const d = daysUntil(dateStr);
  if (d < 0) return `逾期${Math.abs(d)}天`;
  if (d === 0) return "今天";
  return `${d}天后`;
}

function offsetDate(delta) {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
