# CibcApp

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 15.0.4.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.


// kafka_io_avro.js
// Same CLI:
//   node kafka_io_avro.js produce '{"userId":1,"action":"login"}'
//   node kafka_io_avro.js consume
//   node kafka_io_avro.js repl   <-- type JSON lines matching your schema
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
//   # If AVRO_SCHEMA_JSON not set, you can point to a file:
//   AVRO_SCHEMA_PATH=./user_event.avsc
//
// Env (Avro w/o Registry, local only — for demos/tests):
//   AVRO_ENABLED=true
//   AVRO_LOCAL_ONLY=true
//   AVRO_SCHEMA_JSON=... (or AVRO_SCHEMA_PATH=...)
//   # In local-only mode, messages are raw Avro binary without Confluent magic bytes.

require('dotenv').config();
const { Kafka, logLevel } = require('kafkajs');

// ----- Avro helpers (registry + local) -----
const fs = require('fs');
const path = require('path');
const avsc = require('avsc');
const { SchemaRegistry, SchemaType } = require('@kafkajs/confluent-schema-registry');

const {
  KAFKA_BROKERS = 'localhost:9092',
  KAFKA_CLIENT_ID = 'node-kafka-demo',
  KAFKA_TOPIC = 'demo-topic',
  KAFKA_GROUP_ID = 'node-kafka-consumer',
  KAFKA_SSL,
  KAFKA_SASL_MECHANISM,
  KAFKA_SASL_USERNAME,
  KAFKA_SASL_PASSWORD,
  KAFKA_NUM_PARTITIONS = '1',
  KAFKA_REPLICATION_FACTOR = '1',

  // Avro/Registry
  AVRO_ENABLED = 'true',
  AVRO_LOCAL_ONLY = 'false',
  AVRO_SCHEMA_JSON,
  AVRO_SCHEMA_PATH,
  SCHEMA_REGISTRY_URL,
  SCHEMA_REGISTRY_USERNAME,
  SCHEMA_REGISTRY_PASSWORD,
  SCHEMA_SUBJECT_SUFFIX = 'value',
} = process.env;

const brokers = KAFKA_BROKERS.split(',').map(s => s.trim()).filter(Boolean);
const ssl = /^true$/i.test(String(KAFKA_SSL || 'false'));
const sasl = (KAFKA_SASL_MECHANISM && KAFKA_SASL_USERNAME && KAFKA_SASL_PASSWORD)
  ? { mechanism: KAFKA_SASL_MECHANISM, username: KAFKA_SASL_USERNAME, password: KAFKA_SASL_PASSWORD }
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

let schemaObj;
if (AVRO_SCHEMA_JSON) {
  try {
    schemaObj = JSON.parse(AVRO_SCHEMA_JSON);
  } catch (e) {
    console.error('[avro] Failed to parse AVRO_SCHEMA_JSON:', e.message);
    process.exit(1);
  }
} else if (AVRO_SCHEMA_PATH) {
  try {
    const p = path.resolve(AVRO_SCHEMA_PATH);
    schemaObj = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.error('[avro] Failed to read AVRO_SCHEMA_PATH:', e.message);
    process.exit(1);
  }
} else if (avroEnabled) {
  // A sensible default if you forget to provide one
  schemaObj = {
    type: 'record',
    name: 'UserEvent',
    fields: [
      { name: 'userId', type: 'long' },
      { name: 'action', type: 'string' },
    ],
  };
  console.log('[avro] Using default example schema:', JSON.stringify(schemaObj));
}

// Local avro type (used if localOnly OR for pre-validation)
const avroType = avroEnabled && schemaObj ? avsc.Type.forSchema(schemaObj) : null;

// Registry client (if not local-only)
let registry = null;
let registrySchemaId = null;

async function initRegistry(topic) {
  if (!avroEnabled || localOnly) return;
  if (!SCHEMA_REGISTRY_URL) {
    console.error('[avro] SCHEMA_REGISTRY_URL is required unless AVRO_LOCAL_ONLY=true.');
    process.exit(1);
  }

  registry = new SchemaRegistry({
    host: SCHEMA_REGISTRY_URL,
    auth: (SCHEMA_REGISTRY_USERNAME || SCHEMA_REGISTRY_PASSWORD)
      ? { username: SCHEMA_REGISTRY_USERNAME, password: SCHEMA_REGISTRY_PASSWORD }
      : undefined,
  });

  const subject = `${topic}-${SCHEMA_SUBJECT_SUFFIX}`;
  // Try to get latest ID; if subject missing, register.
  try {
    const { id } = await registry.getLatestSchemaId(subject)
      .then(id => ({ id }))
      .catch(() => ({ id: null }));

    if (id) {
      registrySchemaId = id;
      console.log(`[avro:registry] Found latest schema id ${id} for subject "${subject}"`);
    } else {
      console.log(`[avro:registry] Registering schema for subject "${subject}"`);
      const { id: newId } = await registry.register(
        { type: SchemaType.AVRO, schema: JSON.stringify(schemaObj) },
        { subject }
      );
      registrySchemaId = newId;
      console.log(`[avro:registry] Registered schema id ${newId}`);
    }
  } catch (e) {
    console.error('[avro:registry] Failed to initialize registry:', e);
    process.exit(1);
  }
}

async function avroEncode(valueObj) {
  if (!avroEnabled) {
    // JSON fallback
    return Buffer.from(typeof valueObj === 'string' ? valueObj : JSON.stringify(valueObj));
  }

  // Validate against schema before encode
  if (!avroType.isValid(valueObj, { errorHook: () => {} })) {
    throw new Error('[avro] Payload does not match schema: ' + JSON.stringify(valueObj));
  }

  if (localOnly) {
    // Raw Avro binary (no Confluent framing)
    return avroType.toBuffer(valueObj);
  }

  // Schema Registry framing
  return registry.encode(registrySchemaId, valueObj);
}

async function avroDecode(buffer) {
  if (!avroEnabled) {
    try { return JSON.parse(buffer.toString()); } catch { return buffer.toString(); }
  }

  if (localOnly) {
    // Raw Avro binary
    return avroType.fromBuffer(buffer);
  }

  // Detect Confluent framing automatically
  return registry.decode(buffer);
}

// ---------- Kafka admin ----------
async function ensureTopic(topic) {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const topics = await admin.listTopics();
    if (!topics.includes(topic)) {
      console.log(`[admin] Creating topic "${topic}"`);
      await admin.createTopics({
        topics: [{
          topic,
          numPartitions: parseInt(KAFKA_NUM_PARTITIONS, 10),
          replicationFactor: parseInt(KAFKA_REPLICATION_FACTOR, 10),
        }],
        waitForLeaders: true,
      });
    }
  } finally {
    await admin.disconnect();
  }
}

// ---------- Producer ----------
async function runProducer(message) {
  await ensureTopic(KAFKA_TOPIC);
  if (avroEnabled && !localOnly) await initRegistry(KAFKA_TOPIC);

  const producer = kafka.producer({ idempotent: true, allowAutoTopicCreation: true });
  await producer.connect();
  console.log(`[producer] Connected. Sending to "${KAFKA_TOPIC}" (avro=${avroEnabled}${localOnly ? ', local' : ', registry'})`);

  try {
    // Parse message if it looks like JSON
    let payloadObj = message;
    try {
      payloadObj = typeof message === 'string' ? JSON.parse(message) : message;
    } catch { /* leave as string */ }

    const valueBuf = await avroEncode(payloadObj);

    const resp = await producer.send({
      topic: KAFKA_TOPIC,
      messages: [{
        key: Buffer.from(Date.now().toString()),
        value: valueBuf,
        headers: { 'content-type': avroEnabled ? 'avro/binary' : 'application/json', 'x-sent-at': new Date().toISOString() },
      }],
    });
    console.log('[producer] Ack:', resp);
  } catch (err) {
    console.error('[producer] Error:', err);
    process.exitCode = 1;
  } finally {
    await producer.disconnect();
  }
}

async function runReplProducer() {
  await ensureTopic(KAFKA_TOPIC);
  if (avroEnabled && !localOnly) await initRegistry(KAFKA_TOPIC);

  const producer = kafka.producer({ idempotent: true, allowAutoTopicCreation: true });
  await producer.connect();
  console.log(`[producer:repl] Type JSON lines matching your schema. Ctrl+C to exit.`);
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (chunk) => {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        let obj = line;
        try { obj = JSON.parse(line); } catch { /* string OK if schema allows */ }
        const valueBuf = await avroEncode(obj);
        await producer.send({
          topic: KAFKA_TOPIC,
          messages: [{ value: valueBuf, headers: { 'content-type': 'avro/binary', 'x-sent-at': new Date().toISOString() } }],
        });
        console.log(`[producer:repl] sent: ${line}`);
      } catch (e) {
        console.error('[producer:repl] error:', e.message);
      }
    }
  });

  const shutdown = async () => {
    console.log('\n[producer:repl] Shutting down…');
    await producer.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ---------- Consumer ----------
async function runConsumer() {
  await ensureTopic(KAFKA_TOPIC);
  if (avroEnabled && !localOnly) await initRegistry(KAFKA_TOPIC);

  const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID, allowAutoTopicCreation: true });
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
  console.log(`[consumer] Subscribed to "${KAFKA_TOPIC}" as "${KAFKA_GROUP_ID}" (avro=${avroEnabled}${localOnly ? ', local' : ', registry'})`);

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const key = message.key ? message.key.toString() : null;
        const decoded = await avroDecode(message.value);
        const headers = Object.fromEntries(Object.entries(message.headers || {}).map(([k, v]) => [k, v?.toString()]));
        console.log(`[consumer] ${topic}[${partition}] @${message.offset} key=${key}`);
        console.log('          value:', decoded);
        console.log('          headers:', headers);
      } catch (e) {
        console.error('[consumer] decode error:', e.message);
      }
    },
  });

  const shutdown = async () => {
    console.log('\n[consumer] Shutting down…');
    await consumer.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ---------- CLI ----------
(async () => {
  const [,, cmd, ...rest] = process.argv;

  if (!cmd || !['produce', 'consume', 'repl'].includes(cmd)) {
    console.log(`Usage:
  node kafka_io_avro.js produce '{"userId":1,"action":"login"}'
  node kafka_io_avro.js consume
  node kafka_io_avro.js repl

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
    if (cmd === 'produce') {
      const msg = rest.length ? rest.join(' ') : `{"userId":1,"action":"ping","ts":"${new Date().toISOString()}"}`;
      await runProducer(msg);
    } else if (cmd === 'consume') {
      await runConsumer();
    } else if (cmd === 'repl') {
      await runReplProducer();
    }
  } catch (e) {
    console.error('[main] error:', e);
    process.exit(1);
  }
})();

