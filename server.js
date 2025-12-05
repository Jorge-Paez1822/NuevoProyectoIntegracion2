// server.js
// Servidor Express + cliente MQTT para recibir datos desde Wokwi (broker.hivemq.com)

require('dotenv').config();
const express = require('express');
const mqtt = require('mqtt');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// MQTT setup
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'orquideas/datos/ambiental';

const mqttClient = mqtt.connect(MQTT_BROKER);

// Inicializar con datos simulados mientras el ESP32/Wokwi no publique (evita UI vacía)
let latest_data = {
  humedad: 81.5,
  temperatura: 22.0,
  timestamp: new Date().toISOString()
};
let latest_config = { schedule: null, updatedAt: null };
// Variables para modelos de persistencia (si no usas DB, quedan como null)
let Reading = null;
let RiegoConfig = null;

// Fallback en memoria cuando la BD no está disponible
const inMemoryReadings = [];
const OPTIMAL = {
  TEMP_MIN: 15,
  TEMP_MAX: 30,
  HUM_MIN: 50,
  HUM_MAX: 90,
};

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'simulator_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

mqttClient.on('connect', () => {
  console.log(`Conectado al broker MQTT: ${MQTT_BROKER}`);
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error('Error suscribiéndose al tópico MQTT:', err.message);
    } else {
      console.log(`Suscrito al tópico MQTT: ${MQTT_TOPIC}`);
    }
  });
});

mqttClient.on('message', (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    data.timestamp = new Date().toISOString();
    latest_data = data;

    // Aquí podrías insertar en una BD (Postgres/Mongo) si lo deseas
    // db.insert(data).catch(console.error);

    console.log(`Dato recibido [${topic}] -> H:${data.humedad} T:${data.temperatura}`);
    // Persistir si está disponible la conexión a MongoDB
    if (Reading) {
      const r = new Reading({ humedad: Number(data.humedad), temperatura: Number(data.temperatura), timestamp: new Date(data.timestamp), source: data.source || 'esp32' });
      r.save().catch(err => console.error('Error guardando lectura:', err));
    }
  } catch (err) {
    console.warn('Mensaje MQTT recibido no es JSON válido:', message.toString());
  }
});

// Endpoint para que el frontend obtenga el dato más reciente
app.get('/api/datos_actuales', (req, res) => {
  // Si hay persistencia, intentar devolver el último valor guardado en DB
  if (Reading) {
    Reading.findOne().sort({ timestamp: -1 }).limit(1).exec()
      .then(doc => {
        if (doc) return res.json({ humedad: doc.humedad, temperatura: doc.temperatura, timestamp: doc.timestamp });
        return res.json(latest_data);
      })
      .catch(err => {
        console.error('Error consultando lectura en DB:', err);
        res.json(latest_data);
      });
    return;
  }
  res.json(latest_data);
});

// Endpoint para guardar configuración de riego (temporal en memoria)
app.post('/api/config_riego', (req, res) => {
  const cfg = req.body;
  latest_config = { schedule: cfg, updatedAt: new Date().toISOString() };
  // Persistir configuración si hay DB
  if (RiegoConfig) {
    const c = new RiegoConfig({ schedule: cfg });
    c.save().then(saved => res.json({ ok: true, config: saved })).catch(err => {
      console.error('Error guardando config:', err);
      res.status(500).json({ ok: false, error: 'DB error' });
    });
    return;
  }
  res.json({ ok: true, config: latest_config });
});

// Endpoint para consultar histórico (params: limit, from, to)
app.get('/api/historico', (req, res) => {
  if (!Reading) return res.status(503).json({ error: 'DB not configured' });
  const limit = Math.min(1000, parseInt(req.query.limit || '100'));
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  let q = {};
  if (from || to) q.timestamp = {};
  if (from) q.timestamp.$gte = from;
  if (to) q.timestamp.$lte = to;
  Reading.find(q).sort({ timestamp: -1 }).limit(limit).exec()
    .then(docs => res.json(docs))
    .catch(err => res.status(500).json({ error: 'DB error', detail: err }));
});

// --- Simulación integrada en el servidor (genera datos aleatorios de 'óptimo' o 'alerta')
let simulationIntervalId = null;
let simulationConfig = { enabled: false, pattern: 'alternate', interval: 5000 };

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function generateSimulatedReading(mode) {
  let humedad, temperatura;
  if (mode === 'optimal') {
    humedad = parseFloat((randomBetween(77, 83)).toFixed(1));
    temperatura = parseFloat((randomBetween(19, 23)).toFixed(1));
  } else if (mode === 'alert_low') {
    humedad = parseFloat((randomBetween(30, 60)).toFixed(1));
    temperatura = parseFloat((randomBetween(10, 17)).toFixed(1));
  } else if (mode === 'alert_high') {
    humedad = parseFloat((randomBetween(86, 98)).toFixed(1));
    temperatura = parseFloat((randomBetween(25, 35)).toFixed(1));
  } else { // random
    if (Math.random() < 0.5) return generateSimulatedReading('optimal');
    return Math.random() < 0.5 ? generateSimulatedReading('alert_low') : generateSimulatedReading('alert_high');
  }
  const payload = { humedad, temperatura, timestamp: new Date().toISOString(), source: 'server-sim' };
  return payload;
}

function startSimulation(pattern = 'alternate', interval = 5000) {
  stopSimulation();
  simulationConfig = { enabled: true, pattern, interval };
  let toggle = true;
  simulationIntervalId = setInterval(() => {
    let mode;
    if (pattern === 'alternate') {
      mode = toggle ? 'optimal' : (Math.random() < 0.5 ? 'alert_low' : 'alert_high');
      toggle = !toggle;
    } else if (pattern === 'random') {
      mode = 'random';
    } else if (pattern === 'always_optimal') {
      mode = 'optimal';
    } else if (pattern === 'always_alert') {
      mode = Math.random() < 0.5 ? 'alert_low' : 'alert_high';
    } else {
      mode = 'random';
    }

    const data = generateSimulatedReading(mode);
    data.timestamp = new Date().toISOString();
    latest_data = data;
    console.log(`Simulación (${pattern}): H:${data.humedad} T:${data.temperatura}`);

    // Persistir si hay DB
    if (Reading) {
      const r = new Reading({ humedad: Number(data.humedad), temperatura: Number(data.temperatura), timestamp: new Date(data.timestamp), source: data.source });
      r.save().catch(err => console.error('Error guardando lectura (sim):', err));
    }
  }, interval);
}

function stopSimulation() {
  if (simulationIntervalId) {
    clearInterval(simulationIntervalId);
    simulationIntervalId = null;
  }
  simulationConfig = { enabled: false, pattern: 'alternate', interval: 5000 };
}

app.post('/api/simulate', (req, res) => {
  // body: { enable: true|false, pattern: 'alternate'|'random'|'always_optimal'|'always_alert', interval: 5000 }
  const body = req.body || {};
  const enable = body.enable === true;
  const pattern = body.pattern || 'alternate';
  const interval = parseInt(body.interval || 5000, 10);
  if (enable) {
    startSimulation(pattern, interval);
    return res.json({ ok: true, msg: 'Simulation started', config: simulationConfig });
  } else {
    stopSimulation();
    return res.json({ ok: true, msg: 'Simulation stopped' });
  }
});

app.get('/api/simulate/status', (req, res) => {
  res.json({ enabled: simulationConfig.enabled, config: simulationConfig, latest_data });
});

// Endpoint para insertar lectura (con fallback en memoria si falla la BD)
app.post('/api/readings', async (req, res) => {
  const { temperature, humidity } = req.body || {};
  if (temperature == null || humidity == null) {
    return res.status(400).json({ error: 'temperature and humidity required' });
  }

  const readingObj = {
    temperature: Number(temperature),
    humidity: Number(humidity),
    created_at: new Date(),
    source: 'api'
  };

  try {
    const [result] = await pool.execute(
      'INSERT INTO readings (temperature, humidity) VALUES (?, ?)',
      [readingObj.temperature, readingObj.humidity]
    );
    const insertedId = result.insertId;
    const [rows] = await pool.execute('SELECT * FROM readings WHERE id = ?', [insertedId]);
    return res.status(201).json({ reading: rows[0] });
  } catch (err) {
    console.error('DB error on /api/readings, usando memoria:', err.message);
    inMemoryReadings.unshift(readingObj);
    if (inMemoryReadings.length > 200) inMemoryReadings.pop();
    return res.status(201).json({ reading: readingObj, storage: 'memory' });
  }
});

// Endpoint para comparar último dato con optimal_values (o valores por defecto si no hay BD)
app.get('/api/check', async (req, res) => {
  // Helper para evaluar rangos
  function evalStatus(temp, hum, optimal) {
    const issues = [];
    if (optimal.min_temp != null && temp < optimal.min_temp) issues.push('temperature below min');
    if (optimal.max_temp != null && temp > optimal.max_temp) issues.push('temperature above max');
    if (optimal.min_humidity != null && hum < optimal.min_humidity) issues.push('humidity below min');
    if (optimal.max_humidity != null && hum > optimal.max_humidity) issues.push('humidity above max');
    const status = issues.length ? 'alert' : 'ok';
    return { status, issues };
  }

  try {
    const [[last]] = await pool.query('SELECT * FROM readings ORDER BY created_at DESC LIMIT 1');
    if (!last) return res.json({ status: 'no-data', message: 'No readings available' });

    const [opts] = await pool.query('SELECT * FROM optimal_values ORDER BY id LIMIT 1');
    const optimal = opts[0] || {
      min_temp: OPTIMAL.TEMP_MIN,
      max_temp: OPTIMAL.TEMP_MAX,
      min_humidity: OPTIMAL.HUM_MIN,
      max_humidity: OPTIMAL.HUM_MAX,
    };

    const temp = parseFloat(last.temperature);
    const hum = parseFloat(last.humidity);
    const { status, issues } = evalStatus(temp, hum, optimal);
    return res.json({ status, issues, reading: last, optimal });
  } catch (err) {
    console.error('DB error on /api/check, usando memoria:', err.message);
    const last = inMemoryReadings[0];
    if (!last) return res.json({ status: 'no-data', message: 'No readings available (memory)' });
    const optimal = {
      min_temp: OPTIMAL.TEMP_MIN,
      max_temp: OPTIMAL.TEMP_MAX,
      min_humidity: OPTIMAL.HUM_MIN,
      max_humidity: OPTIMAL.HUM_MAX,
    };
    const { status, issues } = evalStatus(last.temperature, last.humidity, optimal);
    return res.json({ status, issues, reading: last, optimal, storage: 'memory' });
  }
});

// Endpoint para obtener últimas lecturas guardadas (histórico) con fallback en memoria
app.get('/api/readings/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const [rows] = await pool.query(
      'SELECT id, temperature, humidity, created_at FROM readings ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    return res.json({ readings: rows });
  } catch (err) {
    console.error('DB error on /api/readings/recent, usando memoria:', err.message);
    const subset = inMemoryReadings.slice(0, limit).map((r, idx) => ({
      id: idx + 1,
      temperature: r.temperature,
      humidity: r.humidity,
      created_at: r.created_at,
      storage: 'memory'
    }));
    return res.json({ readings: subset, storage: 'memory' });
  }
});

app.listen(port, () => {
  console.log(`Servidor Node.js corriendo en http://localhost:${port}`);
});

// Mejor manejo de errores no capturados para ayudar a diagnosticar cierres
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err && err.stack ? err.stack : err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('unhandledRejection at:', promise, 'reason:', reason);
});
