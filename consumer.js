require('dotenv/config');
const { Kafka, logLevel } = require('kafkajs');
const { buildRegistry } = require('./avro/registry');


const {
    KAFKA_BROKERS = 'localhost:9092',
    KAFKA_CLIENT_ID = 'nodejs-kafka-app',
    KAFKA_CONSUME_TOPIC = 'demo.user.events',
    KAFKA_GROUP_ID = 'demo-user-events-group',
    USE_AVRO = 'false',
    SCHEMA_REGISTRY_URL = 'http://localhost:8081',
    SCHEMA_REGISTRY_USERNAME,
    SCHEMA_REGISTRY_PASSWORD,
} = process.env;


const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: KAFKA_BROKERS.split(',').map((s) => s.trim()),
    logLevel: logLevel.INFO,
});


const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });
let registry;


async function initAvro() {
    if (USE_AVRO !== 'true') return;
    registry = buildRegistry({
        url: SCHEMA_REGISTRY_URL,
        auth: SCHEMA_REGISTRY_USERNAME && SCHEMA_REGISTRY_PASSWORD
            ? { username: SCHEMA_REGISTRY_USERNAME, password: SCHEMA_REGISTRY_PASSWORD }
            : undefined,
    });
}


async function run() {
    await initAvro();
    await consumer.connect();
    await consumer.subscribe({ topic: KAFKA_CONSUME_TOPIC, fromBeginning: true });
    console.log(`Consumer connected → ${KAFKA_CONSUME_TOPIC} (Avro=${USE_AVRO})`);


    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            try {
                const key = message.key?.toString();
                let value;
                if (USE_AVRO === 'true') value = await registry.decode(message.value);
                else value = JSON.parse(message.value.toString());
                console.log(`← consumed [${topic}/${partition}] key=${key}`, value);
            } catch (e) {
                console.error('Decode error', e);
            }
        },
    });


    const shutdown = async () => {
        await consumer.disconnect();
        console.log('Consumer disconnected');
        process.exit(0);
    };


    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}


run().catch((err) => {
    console.error('Consumer error', err);
    process.exit(1);
});