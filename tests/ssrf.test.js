"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { classifyAddress, assertUrlAllowed } = require("../src/ssrfGuard");
const { FetchError } = require("../src/errors");

test("classifyAddress blocks private, loopback, link-local and reserved ranges", () => {
  assert.notEqual(classifyAddress("127.0.0.1"), true); // loopback
  assert.notEqual(classifyAddress("10.0.0.5"), true); // private
  assert.notEqual(classifyAddress("192.168.1.1"), true); // private
  assert.notEqual(classifyAddress("169.254.169.254"), true); // cloud metadata
  assert.notEqual(classifyAddress("::1"), true); // ipv6 loopback
  assert.notEqual(classifyAddress("::ffff:127.0.0.1"), true); // ipv4-mapped loopback
});

test("classifyAddress allows ordinary public addresses", () => {
  assert.equal(classifyAddress("8.8.8.8"), true);
  assert.equal(classifyAddress("1.1.1.1"), true);
});

test("assertUrlAllowed rejects a loopback IP-literal URL", async () => {
  await assert.rejects(() => assertUrlAllowed(new URL("http://127.0.0.1:6379/")), FetchError);
});

test("assertUrlAllowed rejects the cloud metadata address", async () => {
  await assert.rejects(
    () => assertUrlAllowed(new URL("http://169.254.169.254/latest/meta-data/")),
    FetchError
  );
});

test("assertUrlAllowed rejects non-http(s) protocols", async () => {
  await assert.rejects(() => assertUrlAllowed(new URL("ftp://example.com/")), FetchError);
});

test("assertUrlAllowed rejects internal hostnames without DNS", async () => {
  await assert.rejects(() => assertUrlAllowed(new URL("http://localhost:3000/")), FetchError);
});

test("assertUrlAllowed permits a public IP literal", async () => {
  await assert.doesNotReject(() => assertUrlAllowed(new URL("http://8.8.8.8/")));
});
