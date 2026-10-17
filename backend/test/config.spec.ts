import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuration } from "../src/config/config";
import { secretEqual } from "../src/common/http";
let folder: string;
let env: NodeJS.ProcessEnv;
beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "vms-config-"));
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  writeFileSync(join(folder, "private.pem"), keys.privateKey);
  writeFileSync(join(folder, "public.pem"), keys.publicKey);
  env = {
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://127.0.0.1/vms_test",
    FRONTEND_ORIGIN: "http://localhost:3000",
    JWT_PRIVATE_KEY_PATH: join(folder, "private.pem"),
    JWT_PUBLIC_KEY_PATH: join(folder, "public.pem"),
    PII_ENCRYPTION_KEY: "ab".repeat(32),
    OUTBOX_ENCRYPTION_KEY: "cd".repeat(32),
  };
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));
it("validates local configuration without production defaults", () => {
  expect(configuration(env).accessTtl).toBe(600);
});
it.each([
  { PORT: "99999" },
  { TRUST_PROXY: "NaN" },
  { MONGODB_URI: "https://example.com" },
  { PII_ENCRYPTION_KEY: "placeholder" },
  { ORGANIZATION_TIMEZONE: "UTC" },
  { NODE_ENV: "production" },
])("rejects invalid configuration %j", (override) => {
  expect(() => configuration({ ...env, ...override })).toThrow();
});
it("compares readiness secrets safely with multibyte input", () => {
  expect(secretEqual("é", "a")).toBe(false);
  expect(secretEqual("secret", "secret")).toBe(true);
});
