const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');
const fs = require('fs');
const path = require('path');

/**
 * Build a Schema Registry client
 * @param {Object} cfg
 * @param {string} cfg.url - The schema registry URL
 * @param {Object} [cfg.auth] - Optional auth { username, password }
 * @returns {SchemaRegistry}
 */
function buildRegistry(cfg) {
  const { url, auth } = cfg;
  return new SchemaRegistry({ host: url, auth });
}

/**
 * Load an Avro schema file from disk
 * @param {string} relativePath - relative path to schema file
 * @returns {Object} parsed JSON schema
 */
function loadAvroSchema(relativePath) {
  const p = path.join(process.cwd(), relativePath);
  const schemaData = fs.readFileSync(p, 'utf8');
  return JSON.parse(schemaData);
}

module.exports = {
  buildRegistry,
  loadAvroSchema,
};
