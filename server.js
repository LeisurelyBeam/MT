const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "jobs.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  city TEXT NOT NULL,
  source TEXT NOT NULL,
  deadline TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  roleType TEXT NOT NULL,
  nextAction TEXT,
  resume TEXT,
  portfolio TEXT,
  notes TEXT,
  salary INTEGER DEFAULT 12000,
  growth INTEGER DEFAULT 7,
  fit INTEGER DEFAULT 7,
  stability INTEGER DEFAULT 7,
  tasks TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`);

const columns = db.prepare("PRAGMA table_info(applications)").all();
if (!columns.some((c) => c.name === "userId")) {
  db.exec("ALTER TABLE applications ADD COLUMN userId TEXT");
}

function nowIso() {
  return new Date().toISOString();
}

function genId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function offsetDate(delta) {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function seedData() {
  return [
    {
      id: genId(),
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
      tasks: JSON.stringify([{ text: "整理作品集案例", done: false }, { text: "准备业务分析题", done: false }])
    },
    {
      id: genId(),
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
      notes: "建议对比城市与成长性",
      salary: 14000,
      growth: 8,
      fit: 9,
      stability: 8,
      tasks: JSON.stringify([{ text: "准备确认话术", done: false }])
    }
  ];
}

function ensureSeedIfEmpty(userId) {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM applications WHERE userId = ?").get(userId);
  if (row.cnt > 0) return;

  const insert = db.prepare(`
    INSERT INTO applications (
      id, userId, company, role, city, source, deadline, priority, status, roleType,
      nextAction, resume, portfolio, notes, salary, growth, fit, stability, tasks, createdAt, updatedAt
    ) VALUES (
      @id, @userId, @company, @role, @city, @source, @deadline, @priority, @status, @roleType,
      @nextAction, @resume, @portfolio, @notes, @salary, @growth, @fit, @stability, @tasks, @createdAt, @updatedAt
    )
  `);

  const tx = db.transaction((items) => {
    for (const item of items) {
      const t = nowIso();
      insert.run({ ...item, userId, createdAt: t, updatedAt: t });
    }
  });

  tx(seedData());
}

function normalize(row) {
  return {
    ...row,
    tasks: row.tasks ? JSON.parse(row.tasks) : []
  };
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const user = db.prepare("SELECT id, username FROM users WHERE id = ?").get(session.userId);
  if (!user) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  req.token = token;
  req.user = user;
  next();
}

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/register-login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");

  if (!username || !password) {
    res.status(400).json({ message: "用户名和密码不能为空" });
    return;
  }

  const passwordHash = hashPassword(password);
  let user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user) {
    const newUser = {
      id: genId(),
      username,
      passwordHash,
      createdAt: nowIso()
    };
    db.prepare("INSERT INTO users (id, username, passwordHash, createdAt) VALUES (@id, @username, @passwordHash, @createdAt)").run(newUser);
    user = newUser;
  } else if (user.passwordHash !== passwordHash) {
    res.status(401).json({ message: "密码错误" });
    return;
  }

  const token = genId();
  db.prepare("INSERT INTO sessions (token, userId, createdAt) VALUES (?, ?, ?)").run(token, user.id, nowIso());

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username
    }
  });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

app.post("/api/auth/logout", authMiddleware, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.json({ ok: true });
});

app.get("/api/applications", authMiddleware, (req, res) => {
  ensureSeedIfEmpty(req.user.id);
  const rows = db
    .prepare("SELECT * FROM applications WHERE userId = ? ORDER BY datetime(updatedAt) DESC")
    .all(req.user.id)
    .map(normalize);
  res.json(rows);
});

app.post("/api/applications", authMiddleware, (req, res) => {
  const body = req.body || {};
  const t = nowIso();
  const payload = {
    id: body.id || genId(),
    userId: req.user.id,
    company: body.company || "",
    role: body.role || "",
    city: body.city || "",
    source: body.source || "",
    deadline: body.deadline || offsetDate(7),
    priority: body.priority || "中",
    status: body.status || "待投递",
    roleType: body.roleType || "通用",
    nextAction: body.nextAction || "",
    resume: body.resume || "",
    portfolio: body.portfolio || "",
    notes: body.notes || "",
    salary: Number(body.salary || 12000),
    growth: Number(body.growth || 7),
    fit: Number(body.fit || 7),
    stability: Number(body.stability || 7),
    tasks: JSON.stringify(body.tasks || []),
    createdAt: t,
    updatedAt: t
  };

  db.prepare(`
    INSERT INTO applications (
      id, userId, company, role, city, source, deadline, priority, status, roleType,
      nextAction, resume, portfolio, notes, salary, growth, fit, stability, tasks, createdAt, updatedAt
    ) VALUES (
      @id, @userId, @company, @role, @city, @source, @deadline, @priority, @status, @roleType,
      @nextAction, @resume, @portfolio, @notes, @salary, @growth, @fit, @stability, @tasks, @createdAt, @updatedAt
    )
  `).run(payload);

  res.status(201).json(normalize(payload));
});

app.put("/api/applications/:id", authMiddleware, (req, res) => {
  const idParam = req.params.id;
  const body = req.body || {};

  const old = db.prepare("SELECT * FROM applications WHERE id = ? AND userId = ?").get(idParam, req.user.id);
  if (!old) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const payload = {
    ...old,
    ...body,
    id: idParam,
    userId: req.user.id,
    tasks: JSON.stringify(body.tasks || JSON.parse(old.tasks || "[]")),
    salary: Number(body.salary ?? old.salary ?? 12000),
    growth: Number(body.growth ?? old.growth ?? 7),
    fit: Number(body.fit ?? old.fit ?? 7),
    stability: Number(body.stability ?? old.stability ?? 7),
    updatedAt: nowIso()
  };

  db.prepare(`
    UPDATE applications SET
      company=@company, role=@role, city=@city, source=@source, deadline=@deadline,
      priority=@priority, status=@status, roleType=@roleType, nextAction=@nextAction,
      resume=@resume, portfolio=@portfolio, notes=@notes, salary=@salary,
      growth=@growth, fit=@fit, stability=@stability, tasks=@tasks, updatedAt=@updatedAt
    WHERE id=@id AND userId=@userId
  `).run(payload);

  res.json(normalize(payload));
});

app.delete("/api/applications/:id", authMiddleware, (req, res) => {
  const info = db.prepare("DELETE FROM applications WHERE id = ? AND userId = ?").run(req.params.id, req.user.id);
  res.json({ deleted: info.changes > 0 });
});

app.post("/api/seed", authMiddleware, (req, res) => {
  db.prepare("DELETE FROM applications WHERE userId = ?").run(req.user.id);
  ensureSeedIfEmpty(req.user.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://localhost:${PORT}`);
});
