// Loads TLS configuration from environment to pass into KafkaJS `ssl` option.
// Supports either a PKCS#12 keystore (PFX) or individual PEM files.
const fs = require('fs');
const path = require('path');


function maybeRead(filePath) {
    if (!filePath) return undefined;
    const p = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(p)) throw new Error(`TLS file not found: ${p}`);
    return fs.readFileSync(p);
}


function buildSslConfig() {
    const {
        KAFKA_SSL,
        KAFKA_SSL_PFX_PATH,
        KAFKA_SSL_PASSPHRASE,
        KAFKA_SSL_CA_PATH,
        KAFKA_SSL_CERT_PATH,
        KAFKA_SSL_KEY_PATH,
        KAFKA_SSL_KEY_PASSPHRASE,
    } = process.env;


    if (String(KAFKA_SSL).toLowerCase() !== 'true') return undefined; // PLAINTEXT


    // Option A: PKCS#12 bundle (.p12/.pfx)
    if (KAFKA_SSL_PFX_PATH) {
        return {
            rejectUnauthorized: true,
            pfx: maybeRead(KAFKA_SSL_PFX_PATH),
            passphrase: KAFKA_SSL_PASSPHRASE || undefined,
        };
    }


    // Option B: PEM files
    const ca = maybeRead(KAFKA_SSL_CA_PATH);
    const cert = maybeRead(KAFKA_SSL_CERT_PATH);
    const key = maybeRead(KAFKA_SSL_KEY_PATH);


    // If any of cert/key are provided, use client auth
    if (cert && key) {
        return {
            rejectUnauthorized: true,
            ca: ca ? [ca] : undefined,
            cert,
            key,
            passphrase: KAFKA_SSL_KEY_PASSPHRASE || undefined,
        };
    }


    // CA only (server validation)
    if (ca) {
        return {
            rejectUnauthorized: true,
            ca: [ca],
        };
    }


    // SSL without custom materials (system CAs)
    return { rejectUnauthorized: true };
}


module.exports = { buildSslConfig };