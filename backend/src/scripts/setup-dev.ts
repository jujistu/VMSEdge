import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
// Local convenience only. Never runs on application startup or in production.
if (process.env.NODE_ENV === "production")
  throw new Error("Development setup is forbidden in production");
if (existsSync(".env"))
  throw new Error(".env already exists; refusing to overwrite secrets");
mkdirSync("secrets", { recursive: true, mode: 0o700 });
if (existsSync("secrets/jwt-private.pem"))
  throw new Error("Existing keys found; refusing to overwrite");
const keys = generateKeyPairSync("rsa", {
  modulusLength: 3072,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
writeFileSync("secrets/jwt-private.pem", keys.privateKey, { mode: 0o600 });
writeFileSync("secrets/jwt-public.pem", keys.publicKey, { mode: 0o644 });
writeFileSync(
  ".env",
  `NODE_ENV=development\nPORT=4000\nMONGODB_URI=mongodb://127.0.0.1:27017/vms_dev?replicaSet=rs0&directConnection=true\nFRONTEND_ORIGIN=http://localhost:3000\nJWT_PRIVATE_KEY_PATH=./secrets/jwt-private.pem\nJWT_PUBLIC_KEY_PATH=./secrets/jwt-public.pem\nPII_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nOUTBOX_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nSMTP_HOST=localhost\nSMTP_PORT=1025\nMAIL_FROM=vms@localhost\nRESET_PASSWORD_BASE_URL=http://localhost:3000/reset-password\n`,
  { mode: 0o600 },
);
console.log(
  "Created local .env and RSA keys. No accounts or passwords were created.",
);
