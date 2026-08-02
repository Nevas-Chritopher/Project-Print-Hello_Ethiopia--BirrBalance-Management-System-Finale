import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://postgres:postgres@localhost:5432/esrom_test";
process.env.JWT_SECRET ||= "test-jwt-secret-with-at-least-32-characters";
process.env.AES_SECRET ||= "test-aes-secret-with-at-least-32-characters";
process.env.CORS_ORIGIN ||= "http://localhost:3000";

let server;
let baseUrl;

before(async () => {
  const { default: app } = await import("../src/app.js");
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

const jsonRequest = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
};

test("GET /health returns liveness payload", async () => {
  const response = await jsonRequest("/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(typeof response.body.uptime, "number");
  assert.equal(typeof response.body.timestamp, "string");
});

test("POST /api/auth/login returns 400 for invalid body", async () => {
  const response = await jsonRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ employee_external_id: "", password: "" }),
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("POST /api/auth/password-reset/confirm returns 400 for invalid body", async () => {
  const response = await jsonRequest("/api/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ employee_external_id: "", otp_code: "", new_password: "short" }),
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test("GET /api/employee/orders requires authentication", async () => {
  const response = await jsonRequest("/api/employee/orders?page=1&limit=20&sort=-created_at");
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
});
