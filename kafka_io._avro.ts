// src/kafka_io_avro.ts
// CLI:
//   npx ts-node src/kafka_io_avro.ts produce '{"userId":1,"action":"login"}'
//   npx ts-node src/kafka_io_avro.ts consume
//   npx ts-node src/kafka_io_avro.ts repl
//
// Env (Kafka):
//   KAFKA_BROKERS=localhost:9092
//   KAFKA_CLIENT_ID=node-kafka-demo
//   KAFKA_TOPIC=demo-topic
//   KAFKA_GROUP_ID=node-kafka-consumer
//   KAFKA_SSL=true|false
//   KAFKA_SASL_MECHANISM=plain|scram-sha-256|scram-sha-512
//   KAFKA_SASL_USERNAME=xxx
//   KAFKA_SASL_PASSWORD=yyy
//   KAFKA_NUM_PARTITIONS=1
//   KAFKA_REPLICATION_FACTOR=1
//
// Env (Avro w/ Schema Registry - recommended):
//   AVRO_ENABLED=true
//   SCHEMA_REGISTRY_URL=http://localhost:8081
//   SCHEMA_REGISTRY_USERNAME=<key>            # optional
//   SCHEMA_REGISTRY_PASSWORD=<secret>         # optional
//   SCHEMA_SUBJECT_SUFFIX=value               # default "value"
//   AVRO_SCHEMA_JSON='{"type":"record","name":"UserEvent","fields":[{"name":"userId","type":"long"},{"name":"action","type":"string"}]}'
//   # or:
//   AVRO_SCHEMA_PATH=./user_event.avsc
//
// Env (Avro local-only, no registry):
//   AVRO_ENABLED=true
//   AVRO_LOCAL_ONLY=true
//   AVRO_SCHEMA_JSON=... (or AVRO_SCHEMA_PATH=...)
//   # Messages are raw Avro binary without Confluent framing.

import dotenv from "dotenv";
dotenv.config();

import { Kafka, logLevel, SASLOptions } from "kafkajs";
import fs from "fs";
import path from "path";
import * as avsc from "avsc";
import {
  SchemaRegistry,
  SchemaType,
} from "@kafkajs/confluent-schema-registry";

// ---------- Env ----------
const {
  KAFKA_BROKERS = "localhost:9092",
  KAFKA_CLIENT_ID = "node-kafka-demo",
  KAFKA_TOPIC = "demo-topic",
  KAFKA_GROUP_ID = "node-kafka-consumer",
  KAFKA_SSL,
  KAFKA_SASL_MECHANISM,
  KAFKA_SASL_USERNAME,
  KAFKA_SASL_PASSWORD,
  KAFKA_NUM_PARTITIONS = "1",
  KAFKA_REPLICATION_FACTOR = "1",

  AVRO_ENABLED = "true",
  AVRO_LOCAL_ONLY = "false",
  AVRO_SCHEMA_JSON,
  AVRO_SCHEMA_PATH,
  SCHEMA_REGISTRY_URL,
  SCHEMA_REGISTRY_USERNAME,
  SCHEMA_REGISTRY_PASSWORD,
  SCHEMA_SUBJECT_SUFFIX = "value",
} = process.env;

const brokers = KAFKA_BROKERS.split(",").map((s) => s.trim()).filter(Boolean);
const ssl = /^true$/i.test(String(KAFKA_SSL ?? "false"));
const sasl: SASLOptions | undefined =
  KAFKA_SASL_MECHANISM && KAFKA_SASL_USERNAME && KAFKA_SASL_PASSWORD
    ? {
        mechanism: KAFKA_SASL_MECHANISM as SASLOptions["mechanism"],
        username: KAFKA_SASL_USERNAME,
        password: KAFKA_SASL_PASSWORD,
      }
    : undefined;

const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers,
  ssl: ssl || undefined,
  sasl,
  logLevel: logLevel.INFO,
});

// ---------- Avro init ----------
const avroEnabled = /^true$/i.test(AVRO_ENABLED);
const localOnly = /^true$/i.test(AVRO_LOCAL_ONLY);

type Json = Record<string, unknown> | unknown;

let schemaObj: any | undefined;
if (AVRO_SCHEMA_JSON) {
  try {
    schemaObj = JSON.parse(AVRO_SCHEMA_JSON);
  } catch (e: any) {
    console.error("[avro] Failed to parse AVRO_SCHEMA_JSON:", e?.message);
    process.exit(1);
  }
} else if (AVRO_SCHEMA_PATH) {
  try {
    const p = path.resolve(AVRO_SCHEMA_PATH);
    const raw = fs.readFileSync(p, "utf8");
    schemaObj = JSON.parse(raw);
  } catch (e: any) {
    console.error("[avro] Failed to read AVRO_SCHEMA_PATH:", e?.message);
    process.exit(1);
  }
} else if (avroEnabled) {
  // default example schema if nothing provided
  schemaObj = {
    type: "record",
    name: "UserEvent",
    fields: [
      { name: "userId", type: "long" },
      { name: "action", type: "string" },
    ],
  };
  console.log("[avro] Using default example schema:", JSON.stringify(schemaObj));
}

const avroType = avroEnabled && schemaObj ? avsc.Type.forSchema(schemaObj) : null;

let registry: SchemaRegistry | null = null;
let registrySchemaId: number | null = null;

async function initRegistry(topic: string): Promise<void> {
  if (!avroEnabled || localOnly) return;
  if (!SCHEMA_REGISTRY_URL) {
    console.error(
      "[avro] SCHEMA_REGISTRY_URL is required unless AVRO_LOCAL_ONLY=true."
    );
    process.exit(1);
  }

  registry = new SchemaRegistry({
    host: SCHEMA_REGISTRY_URL,
    auth:
      SCHEMA_REGISTRY_USERNAME || SCHEMA_REGISTRY_PASSWORD
        ? {
            username: String(SCHEMA_REGISTRY_USERNAME),
            password: String(SCHEMA_REGISTRY_PASSWORD),
          }
        : undefined,
  });

  const subject = `${topic}-${SCHEMA_SUBJECT_SUFFIX}`;

  try {
    // getLatestSchemaId throws if subject missing; we fall back to register
    let id: number | null = null;
    try {
      id = await (registry as SchemaRegistry).getLatestSchemaId(subject);
    } catch {
      id = null;
    }

    if (id) {
      registrySchemaId = id;
      console.log(
        `[avro:registry] Found latest schema id ${id} for subject "${subject}"`
      );
    } else {
      console.log(`[avro:registry] Registering schema for subject "${subject}"`);
      const { id: newId } = await (registry as SchemaRegistry).register(
        { type: SchemaType.AVRO, schema: JSON.stringify(schemaObj) },
        { subject }
      );
      registrySchemaId = newId;
      console.log(`[avro:registry] Registered schema id ${newId}`);
    }
  } catch (e) {
    console.error("[avro:registry] Failed to initialize registry:", e);
    process.exit(1);
  }
}

async function avroEncode(valueObj: any): Promise<Buffer> {
  if (!avroEnabled) {
    const s =
      typeof valueObj === "string" ? valueObj : JSON.stringify(valueObj ?? "");
    return Buffer.from(s);
  }

  if (!avroType) {
    throw new Error("[avro] Avro schema type is not initialized.");
  }

  // validate against schema first
  if (!avroType.isValid(valueObj, { errorHook: () => {} })) {
    throw new Error(
      "[avro] Payload does not match schema: " + JSON.stringify(valueObj)
    );
  }

  if (localOnly) {
    return avroType.toBuffer(valueObj);
  }

  if (!registry || registrySchemaId == null) {
    throw new Error("[avro] Registry not initialized.");
  }

  return registry.encode(registrySchemaId, valueObj);
}

async function avroDecode(buffer: Buffer): Promise<any> {
  if (!avroEnabled) {
    try {
      return JSON.parse(buffer.toString());
    } catch {
      return buffer.toString();
    }
  }

  if (localOnly) {
    if (!avroType) throw new Error("[avro] Avro type not initialized.");
    return avroType.fromBuffer(buffer);
  }

  if (!registry) throw new Error("[avro] Registry not initialized.");
  return registry.decode(buffer);
}

// ---------- Kafka admin ----------
async function ensureTopic(topic: string): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const topics = await admin.listTopics();
    if (!topics.includes(topic)) {
      console.log(`[admin] Creating topic "${topic}"`);
      await admin.createTopics({
        topics: [
          {
            topic,
            numPartitions: parseInt(KAFKA_NUM_PARTITIONS, 10),
            replicationFactor: parseInt(KAFKA_REPLICATION_FACTOR, 10),
          },
        ],
        waitForLeaders: true,
      });
    }
  } finally {
    await admin.disconnect();
  }
}

// ---------- Producer ----------
async function runProducer(message: string): Promise<void> {
  await ensureTopic(KAFKA_TOPIC);
  if (avroEnabled && !localOnly) await initRegistry(KAFKA_TOPIC);

  const producer = kafka.producer({
    idempotent: true,
    allowAutoTopicCreation: true,
  });

  await producer.connect();
  console.log(
    `[producer] Connected. Sending to "${KAFKA_TOPIC}" (avro=${avroEnabled}${
      localOnly ? ", local" : ", registry"
    })`
  );

  try {
    let payloadObj: any = message;
    try {
      payloadObj =
        typeof message === "string" ? (JSON.parse(message) as Json) : message;
    } catch {
      // keep as string; schema may allow "string"
    }

    const valueBuf = await avroEncode(payloadObj);

    const resp = await producer.send({
      topic: KAFKA_TOPIC,
      messages: [
        {
          key: Buffer.from(Date.now().toString()),
          value: valueBuf,
          headers: {
            "content-type": avroEnabled ? "avro/binary" : "application/json",
            "x-sent-at": new Date().toISOString(),
          },
        },
      ],
    });
    console.log("[producer] Ack:", resp);
  } catch (err) {
    console.error("[producer] Error:", err);
    process.exitCode = 1;
  } finally {
    await producer.disconnect();
  }
}

async function runReplProducer(): Promise<void> {
  await ensureTopic(KAFKA_TOPIC);
  if (avroEnabled && !localOnly) await initRegistry(KAFKA_TOPIC);

  const producer = kafka.producer({
    idempotent: true,
    allowAutoTopicCreation: true,
  });
  await producer.connect();
  console.log(
    `[producer:repl] Type JSON lines matching your schema. Ctrl+C to exit.`
  );

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk: string) => {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        let obj: any = line;
        try {
          obj = JSON.parse(line);
        } catch {
          // string OK if schema allows
        }
        const valueBuf = await avroEncode(obj);
        await producer.send({
          topic: KAFKA_TOPIC,
          messages: [
            {
              value: valueBuf,
              headers: {
                "content-type": "avro/binary",
                "x-sent-at": new Date().toISOString(),
              },
            },
          ],
        });
        console.log(`[producer:repl] sent: ${line}`);
      } catch (e: any) {
        console.error("[producer:repl] error:", e.message);
      }
    }
  });

  const shutdown = async () => {
    console.log("\n[producer:repl] Shutting down…");
    await producer.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ---------- Consumer ----------
async function runConsumer(): Promise<void> {
  await ensureTopic(KAFKA_TOPIC);
  if (avroEnabled && !localOnly) await initRegistry(KAFKA_TOPIC);

  const consumer = kafka.consumer({
    groupId: KAFKA_GROUP_ID,
    allowAutoTopicCreation: true,
  });

  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
  console.log(
    `[consumer] Subscribed to "${KAFKA_TOPIC}" as "${KAFKA_GROUP_ID}" (avro=${avroEnabled}${
      localOnly ? ", local" : ", registry"
    })`
  );

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const key = message.key ? message.key.toString() : null;
        const decoded = await avroDecode(message.value as Buffer);
        const headers: Record<string, string | undefined> = Object.fromEntries(
          Object.entries(message.headers ?? {}).map(([k, v]) => [k, v?.toString()])
        );
        console.log(`[consumer] ${topic}[${partition}] @${message.offset} key=${key}`);
        console.log("          value:", decoded);
        console.log("          headers:", headers);
      } catch (e: any) {
        console.error("[consumer] decode error:", e.message);
      }
    },
  });

  const shutdown = async () => {
    console.log("\n[consumer] Shutting down…");
    await consumer.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ---------- CLI dispatcher ----------
(async () => {
  const [, , cmd, ...rest] = process.argv;

  if (!cmd || !["produce", "consume", "repl"].includes(cmd)) {
    console.log(`Usage:
  npx ts-node src/kafka_io_avro.ts produce '{"userId":1,"action":"login"}'
  npx ts-node src/kafka_io_avro.ts consume
  npx ts-node src/kafka_io_avro.ts repl

Env (quick start):
  KAFKA_BROKERS=localhost:9092
  KAFKA_TOPIC=demo-topic
  KAFKA_GROUP_ID=node-kafka-consumer
  AVRO_ENABLED=true
  # With Schema Registry:
  SCHEMA_REGISTRY_URL=http://localhost:8081
  AVRO_SCHEMA_JSON={"type":"record","name":"UserEvent","fields":[{"name":"userId","type":"long"},{"name":"action","type":"string"}]}
`);
    process.exit(1);
  }

  try {
    if (cmd === "produce") {
      const msg =
        rest.length > 0
          ? rest.join(" ")
          : `{"userId":1,"action":"ping","ts":"${new Date().toISOString()}"}`;
      await runProducer(msg);
    } else if (cmd === "consume") {
      await runConsumer();
    } else if (cmd === "repl") {
      await runReplProducer();
    }
  } catch (e) {
    console.error("[main] error:", e);
    process.exit(1);
  }
})();
