// public/js/app.js
// Dashboard con datos reales MQTT + Simulador manual para guardar lecturas en BD

const OPTIMAL_HUMIDITY_LOW = 50;
const OPTIMAL_HUMIDITY_HIGH = 90;
const OPTIMAL_TEMP_LOW = 15;
const OPTIMAL_TEMP_HIGH = 30;

// ============ FUNCIONES COMUNES ============

function updateStatusCard(h, t) {
  const estadoCard = document.getElementById('estado-card');
  const estadoText = document.getElementById('estado-cultivo');
  const statusDetail = document.getElementById('status-detail');
  const alertasList = document.getElementById('alertas-list');

  if (h !== null && t !== null && !isNaN(h) && !isNaN(t)) {
    let issues = [];
    if (h < OPTIMAL_HUMIDITY_LOW) issues.push('Humedad baja');
    if (h > OPTIMAL_HUMIDITY_HIGH) issues.push('Humedad alta');
    if (t < OPTIMAL_TEMP_LOW) issues.push('Temperatura baja');
    if (t > OPTIMAL_TEMP_HIGH) issues.push('Temperatura alta');

    if (issues.length > 0) {
      estadoCard.className = 'card kpi status-alert';
      estadoText.textContent = '⚠️ ALERTA';
      if (statusDetail) statusDetail.textContent = issues.join(' | ');
      if (alertasList) alertasList.innerHTML = `<li style="color:#dc3545;">⚠️ ${issues.join(' • ')}</li>`;
    } else {
      estadoCard.className = 'card kpi status-optimal';
      estadoText.textContent = '✓ ÓPTIMO';
      if (statusDetail) statusDetail.textContent = `H: ${h.toFixed(1)}% | T: ${t.toFixed(1)}°C - Rango óptimo`;
      if (alertasList) alertasList.innerHTML = `<li style="color:#28a745;">✓ Condiciones óptimas</li>`;
    }
  }
}

// ============ DASHBOARD (DATOS REALES MQTT) ============

async function fetchAndUpdateData() {
    try {
        const response = await fetch('/api/datos_actuales');
        if (!response.ok) throw new Error('Respuesta no OK');
        const data = await response.json();

        const humEl = document.getElementById('humedad-actual');
        const tempEl = document.getElementById('temperatura-actual');
        const ultimaUpd = document.getElementById('ultima-actualizacion');

        const h = data && data.humedad != null ? Number(data.humedad) : null;
        const t = data && data.temperatura != null ? Number(data.temperatura) : null;

        if (h !== null && t !== null && !isNaN(h) && !isNaN(t)) {
            humEl.textContent = `${h.toFixed(1)}%`;
            tempEl.textContent = `${t.toFixed(1)}°C`;
            const ts = data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString();
            if (ultimaUpd) ultimaUpd.textContent = `Última actualización: ${ts}`;
            updateStatusCard(h, t);
        } else {
            humEl.textContent = '-- %';
            tempEl.textContent = '-- °C';
        }
    } catch (error) {
        console.error('Error al obtener datos:', error);
    }
}

// Actualizar cada 5 segundos
setInterval(fetchAndUpdateData, 5000);
fetchAndUpdateData();

// ============ SIMULADOR (BOTONES + GUARDAR EN BD) ============

document.addEventListener('DOMContentLoaded', () => {
  const tempEl = document.getElementById('temp');
  const humEl = document.getElementById('hum');
  const btnRand = document.getElementById('btn-rand');
  const btnSave = document.getElementById('btn-save');
  const alertArea = document.getElementById('alert-area');

  console.log('✓ DOMContentLoaded: elementos encontrados', { tempEl, humEl, btnRand, btnSave });

  // Variables para almacenar los datos actuales de Wokwi
  let currentWokwiTemp = null;
  let currentWokwiHum = null;

  // Actualizar valores del simulador con los datos reales de Wokwi
  async function updateSimulatorWithWokwiData() {
    try {
      const response = await fetch('/api/datos_actuales');
      if (!response.ok) {
        console.warn('Response not OK:', response.status);
        return;
      }
      const data = await response.json();
      console.log('📡 Datos recibidos de /api/datos_actuales:', data);

      const h = data && data.humedad != null ? Number(data.humedad) : null;
      const t = data && data.temperatura != null ? Number(data.temperatura) : null;

      if (h !== null && t !== null && !isNaN(h) && !isNaN(t)) {
        currentWokwiTemp = t;
        currentWokwiHum = h;
        tempEl.textContent = t.toFixed(1);
        humEl.textContent = h.toFixed(1);
        console.log(`✓ Simulador actualizado: T=${t.toFixed(1)}°C, H=${h.toFixed(1)}%`);
      } else {
        console.warn('Datos inválidos:', { h, t });
      }
    } catch (error) {
      console.error('❌ Error obteniendo datos de Wokwi:', error);
    }
  }

  // Actualizar cada 5 segundos con datos de Wokwi
  setInterval(updateSimulatorWithWokwiData, 5000);
  updateSimulatorWithWokwiData(); // Cargar inmediatamente

  function randBetween(min, max) {
    return (Math.random() * (max - min) + min).toFixed(2);
  }

  // Botón: Cambiar valores de forma aleatoria (modo manual)
  if (btnRand) {
    btnRand.addEventListener('click', () => {
      const newTemp = randBetween(10, 40);
      const newHum = randBetween(20, 95);
      tempEl.textContent = newTemp;
      humEl.textContent = newHum;
      if (alertArea) alertArea.textContent = '';
      console.log(`Manual: T=${newTemp}°C, H=${newHum}%`);
    });
  }

  // Botón: Guardar lectura en BD (usa los valores mostrados, sean de Wokwi o manuales)
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const tempText = tempEl.textContent.trim();
      const humText = humEl.textContent.trim();
      
      console.log('📌 Botón Guardar presionado:', { tempText, humText });

      const temperature = parseFloat(tempText);
      const humidity = parseFloat(humText);

      console.log('🔢 Valores parseados:', { temperature, humidity });

      if (isNaN(temperature) || isNaN(humidity)) {
        const msg = `❌ Valores inválidos: T=${tempText}, H=${humText}`;
        console.error(msg);
        if (alertArea) {
          alertArea.innerHTML = `<div style="color:white; padding:10px; background:#f8d7da; border-radius:4px;">${msg}</div>`;
        }
        return;
      }

      try {
        console.log('🚀 Enviando POST a /api/readings:', { temperature, humidity });
        
        // 1. Guardar lectura
        const saveResp = await fetch('/api/readings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ temperature, humidity })
        });

        console.log('📨 Respuesta del servidor:', { status: saveResp.status, ok: saveResp.ok });

        if (!saveResp.ok) {
          const err = await saveResp.json();
          throw new Error(err.error || 'Error al guardar lectura');
        }

        const saved = await saveResp.json();
        console.log('✓ Lectura guardada:', saved);

        // 2. Comprobar estado con /api/check
        const checkResp = await fetch('/api/check');
        const check = await checkResp.json();
        console.log('✓ Resultado de /api/check:', check);

        if (alertArea) {
          if (check.status === 'alert') {
            const msg = check.issues.length > 0 ? check.issues.join(', ') : 'Fuera de rango';
            alertArea.innerHTML = `<div style="color:white; padding:10px; background:#dc3545; border-radius:4px; margin-top:10px;">⚠️ ALERTA: ${msg}</div>`;
          } else if (check.status === 'ok') {
            alertArea.innerHTML = `<div style="color:white; padding:10px; background:#28a745; border-radius:4px; margin-top:10px;">✓ ÓPTIMO (T: ${temperature}°C | H: ${humidity}%)</div>`;
          } else {
            alertArea.innerHTML = `<div style="color:#666; padding:10px; background:#e9ecef; border-radius:4px; margin-top:10px;">ℹ️ ${check.message || check.status}</div>`;
          }
        }

        // Actualizar UI de estado general si es necesario
        updateStatusCard(humidity, temperature);
        
        // Recargar tabla de histórico después de guardar
        console.log('🔄 Recargando histórico...');
        loadReadingsHistory();
      } catch (err) {
        console.error('❌ Error:', err);
        if (alertArea) {
          alertArea.innerHTML = `<div style="color:white; padding:10px; background:#6c757d; border-radius:4px;">❌ Error: ${err.message}</div>`;
        }
      }
    });
  }
});

// ============ HISTÓRICO DE LECTURAS (TABLA) ============

async function loadReadingsHistory() {
  try {
    const response = await fetch('/api/readings/recent?limit=20');
    if (!response.ok) throw new Error('Error cargando histórico');
    const data = await response.json();
    
    const tbody = document.getElementById('readings-tbody');
    if (!tbody) return;
    
    if (data.readings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999;">No hay datos guardados aún</td></tr>';
      return;
    }
    
    // Obtener valores óptimos para determinar estado
    const OPTIMAL_TEMP_MIN = 15;
    const OPTIMAL_TEMP_MAX = 30;
    const OPTIMAL_HUM_MIN = 50;
    const OPTIMAL_HUM_MAX = 90;
    
    tbody.innerHTML = data.readings.map((reading, index) => {
      const temp = parseFloat(reading.temperature);
      const hum = parseFloat(reading.humidity);
      
      // Determinar estado
      const isOptimal = 
        temp >= OPTIMAL_TEMP_MIN && temp <= OPTIMAL_TEMP_MAX &&
        hum >= OPTIMAL_HUM_MIN && hum <= OPTIMAL_HUM_MAX;
      
      const statusClass = isOptimal ? 'status-ok' : 'status-alert';
      const statusText = isOptimal ? '✓ Óptimo' : '⚠️ Alerta';
      
      // Formatear fecha
      const date = new Date(reading.created_at);
      const dateStr = date.toLocaleDateString('es-ES');
      const timeStr = date.toLocaleTimeString('es-ES');
      
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${temp.toFixed(1)}°C</td>
          <td>${hum.toFixed(1)}%</td>
          <td>${dateStr} ${timeStr}</td>
          <td class="${statusClass}">${statusText}</td>
        </tr>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error cargando histórico:', error);
    const tbody = document.getElementById('readings-tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#dc3545;">Error al cargar datos</td></tr>';
    }
  }
}

// Botón para actualizar tabla manualmente
const btnRefresh = document.getElementById('btn-refresh-history');
if (btnRefresh) {
  btnRefresh.addEventListener('click', () => {
    loadReadingsHistory();
  });
}

// Cargar histórico al iniciar y actualizar cada 30 segundos
loadReadingsHistory();
setInterval(loadReadingsHistory, 30000);
