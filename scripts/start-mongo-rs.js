/**
 * Starts a single-node MongoDB replica set on port 27018 (required by Prisma).
 * Usage: node scripts/start-mongo-rs.js
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { MongoClient } = require("mongodb");

const PORT = 27018;
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "mongo-data");
const LOG_DIR = path.join(ROOT, "mongo-log");
const LOG_FILE = path.join(LOG_DIR, "mongod.log");
const MONGOD =
  process.env.MONGOD_PATH ||
  "C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe";

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

async function ensureReplicaSet() {
  const client = new MongoClient(
    `mongodb://127.0.0.1:${PORT}/?directConnection=true`,
    { serverSelectionTimeoutMS: 10000 }
  );
  await client.connect();
  const admin = client.db("admin").admin();
  try {
    const status = await admin.command({ replSetGetStatus: 1 });
    console.log(`Replica set already ready: ${status.set}`);
  } catch {
    const result = await admin.command({
      replSetInitiate: {
        _id: "rs0",
        members: [{ _id: 0, host: `127.0.0.1:${PORT}` }],
      },
    });
    console.log("Replica set initiated:", result.ok === 1 ? "ok" : result);
    // Wait briefly for PRIMARY election
    await new Promise((r) => setTimeout(r, 3000));
  } finally {
    await client.close();
  }
}

async function main() {
  if (!fs.existsSync(MONGOD)) {
    console.error(`mongod not found at: ${MONGOD}`);
    console.error("Set MONGOD_PATH env var to your mongod.exe location.");
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });

  if (await isPortOpen(PORT)) {
    console.log(`MongoDB already listening on ${PORT}`);
  } else {
    console.log(`Starting mongod on port ${PORT}...`);
    const child = spawn(
      MONGOD,
      [
        "--dbpath",
        DATA_DIR,
        "--logpath",
        LOG_FILE,
        "--port",
        String(PORT),
        "--bind_ip",
        "127.0.0.1",
        "--replSet",
        "rs0",
      ],
      { detached: true, stdio: "ignore" }
    );
    child.unref();

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isPortOpen(PORT)) break;
    }
    if (!(await isPortOpen(PORT))) {
      console.error("Failed to start mongod. Check mongo-log/mongod.log");
      process.exit(1);
    }
    console.log(`mongod started on port ${PORT}`);
  }

  await ensureReplicaSet();
  console.log(
    `Ready. DATABASE_URL=mongodb://127.0.0.1:${PORT}/harvester_db?replicaSet=rs0&directConnection=true`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
