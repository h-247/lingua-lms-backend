import http from "k6/http";
import exec from "k6/execution";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:8080/api/v1";
const PASSWORD = __ENV.SEED_PASSWORD;
const COOKIE = __ENV.SESSION_COOKIE_NAME || "lingua.sid";
const mode = __ENV.MODE || "sustained";
const accountStart = Math.min(300, Math.max(1, Number(__ENV.ACCOUNT_START || 1)));
const accountCount = Math.min(301 - accountStart, Math.max(1, Number(__ENV.ACCOUNT_COUNT || __ENV.VUS || 300)));

export const options = {
  scenarios:
    mode === "fixed"
      ? { mixed: { executor: "constant-arrival-rate", rate: 30, timeUnit: "1s", duration: "5m", preAllocatedVUs: 300, maxVUs: 300 } }
      : { mixed: { executor: "constant-vus", vus: Number(__ENV.VUS || 300), duration: __ENV.DURATION || "15m" } },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(99)<3000"],
    "http_req_duration{kind:read}": ["p(95)<800"],
    "http_req_duration{kind:write}": ["p(95)<1500"],
    checks: ["rate==1"],
    dropped_iterations: ["count==0"],
  },
};

function login(index) {
  const jar = new http.CookieJar();
  const csrfResponse = http.get(`${BASE}/auth/csrf`, { jar });
  const csrf = csrfResponse.json("csrfToken");
  const response = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: `student${String(index).padStart(3, "0")}@seed.invalid`, password: PASSWORD }),
    { headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, jar },
  );
  const session = response.cookies[COOKIE]?.[0]?.value;
  check(response, { "login 200": (r) => r.status === 201 || r.status === 200, "session set": () => Boolean(session) });
  return { csrf: response.json("csrfToken"), session: decodeURIComponent(session) };
}

export function setup() {
  if (!PASSWORD) throw new Error("SEED_PASSWORD is required");
  const sessions = [];
  for (let index = 0; index < accountCount; index += 1) sessions.push(login(accountStart + index));
  return { sessions };
}

function installSession(session) {
  http.cookieJar().set(BASE, COOKIE, session.session, { path: "/", secure: BASE.startsWith("https") });
}

export default function (data) {
  const sessionIndex = (__VU - 1) % data.sessions.length;
  const identity = accountStart + sessionIndex;
  const session = data.sessions[sessionIndex];
  installSession(session);
  const classes = http.get(`${BASE}/classes?page=1&pageSize=20`, { tags: { kind: "read" } });
  check(classes, { "class list 200": (r) => r.status === 200 });
  const classId = classes.json("items.0.id");
  const step = exec.scenario.iterationInTest % 20;

  if (step < 12) {
    const assessments = http.get(`${BASE}/classes/${classId}/assessments?page=1&pageSize=20`, { tags: { kind: "read" } });
    check(assessments, { "assessment list 200": (r) => r.status === 200 });
  } else if (step < 17) {
    const list = http.get(`${BASE}/classes/${classId}/assessments?kind=HOMEWORK`, { tags: { kind: "read" } });
    const assessmentId = list.json("items.0.id");
    const current = http.get(`${BASE}/assessments/${assessmentId}/submission`, { tags: { kind: "read" } });
    const revision = Number(current.json("revision") || 0);
    const saved = http.patch(
      `${BASE}/assessments/${assessmentId}/submission`,
      JSON.stringify({ expectedRevision: revision, textAnswer: `Changed draft vu=${identity} iteration=${exec.scenario.iterationInTest}` }),
      { headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf }, tags: { kind: "write" } },
    );
    check(saved, { "draft saved": (r) => r.status === 200 });
  } else if (step < 19) {
    const list = http.get(`${BASE}/classes/${classId}/assessments?kind=PRACTICE_QUIZ`, { tags: { kind: "read" } });
    const assessmentId = list.json("items.0.id");
    const started = http.post(`${BASE}/assessments/${assessmentId}/practice/start`, null, { headers: { "X-CSRF-Token": session.csrf }, tags: { kind: "write" } });
    check(started, { "practice start/resume": (r) => r.status === 201 || r.status === 200 });
  } else {
    const progress = http.get(`${BASE}/reports/classes/${classId}/me`, { tags: { kind: "read" } });
    check(progress, { "own progress 200": (r) => r.status === 200 });
  }
  if (mode !== "fixed") sleep(5 + Math.random() * 10);
}
