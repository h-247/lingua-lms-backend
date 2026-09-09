import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

const BASE = __ENV.BASE_URL || "http://localhost:8080/api/v1";
export const options = {
  scenarios: { login: { executor: "shared-iterations", vus: 300, iterations: 300, maxDuration: "120s" } },
  thresholds: { http_req_failed: ["rate<0.01"], "http_req_duration{operation:login}": ["p(95)<2500"], checks: ["rate==1"] },
};

export default function () {
  const index = exec.scenario.iterationInTest + 1;
  const csrfResponse = http.get(`${BASE}/auth/csrf`);
  const response = http.post(`${BASE}/auth/login`, JSON.stringify({ email: `student${String(index).padStart(3, "0")}@seed.invalid`, password: __ENV.SEED_PASSWORD }), {
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfResponse.json("csrfToken") }, tags: { operation: "login" },
  });
  check(response, { "login succeeds": (r) => r.status === 201 || r.status === 200 });
}
