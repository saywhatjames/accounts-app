require('dotenv/config');
const {
    KAFKA_BROKERS = 'localhost:9092',
    KAFKA_CLIENT_ID = 'nodejs-kafka-app',
    KAFKA_PRODUCE_TOPIC = 'demo.user.events',
    USE_AVRO = 'false',
    SCHEMA_REGISTRY_URL = 'http://localhost:8081',
    SCHEMA_REGISTRY_USERNAME,
    SCHEMA_REGISTRY_PASSWORD,
} = process.env;


const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS.split(',').map((s) => s.trim()),
    retry: { retries: 8 },
    logLevel: logLevel.INFO,
});


const producer = kafka.producer({
    allowAutoTopicCreation: true,
    idempotent: true,
    maxInFlightRequests: 1,
    retry: { retries: 8 },
});


let registry, avroId;


async function initAvro() {
    if (USE_AVRO !== 'true') return;
    registry = buildRegistry({
        url: SCHEMA_REGISTRY_URL,
        auth: SCHEMA_REGISTRY_USERNAME && SCHEMA_REGISTRY_PASSWORD
            ? { username: SCHEMA_REGISTRY_USERNAME, password: SCHEMA_REGISTRY_PASSWORD }
            : undefined,
    });
    const schema = loadAvroSchema('src/avro/schemas/user-event.avsc');
    const { id } = await registry.register(
        { type: 'AVRO', schema: JSON.stringify(schema) },
        { subject: `${KAFKA_PRODUCE_TOPIC}-value` }
    );
    avroId = id;
}


function plainEvent() {
    const id = crypto.randomUUID();
    const types = ['SIGNUP', 'LOGIN', 'PURCHASE'];
    const type = types[Math.floor(Math.random() * types.length)];
    const payload = type === 'PURCHASE' ? { amount: +(Math.random() * 100).toFixed(2) } : null;
    return { id, type, timestamp: Date.now(), payload };
}


async function run() {
    await initAvro();
    await producer.connect();
    console.log(`Producer connected → ${KAFKA_PRODUCE_TOPIC} (Avro=${USE_AVRO})`);


    const loop = async () => {
        const evt = plainEvent();
        const key = evt.id.slice(0, 8);
        const value = USE_AVRO === 'true' ? await registry.encode(avroId, evt) : JSON.stringify(evt);
        await producer.send({ topic: KAFKA_PRODUCE_TOPIC, messages: [{ key, value }] });
        console.log('→ produced', evt);
    };


    const interval = setInterval(loop, 1000);
    const shutdown = async () => {
        clearInterval(interval);
        await producer.disconnect();
        console.log('Producer disconnected');
        process.exit(0);
    };


    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}


run().catch((err) => {
    console.error('Producer error', err);
    process.exit(1);
});