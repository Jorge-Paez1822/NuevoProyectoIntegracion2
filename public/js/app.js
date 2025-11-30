// public/js/app.js
// Cliente que consulta /api/datos_actuales y actualiza el dashboard

const OPTIMAL_HUMIDITY_LOW = 75;
const OPTIMAL_HUMIDITY_HIGH = 85;
const OPTIMAL_TEMP_LOW = 18;
const OPTIMAL_TEMP_HIGH = 24;

async function fetchAndUpdateData() {
    try {
        const response = await fetch('/api/datos_actuales');
        if (!response.ok) throw new Error('Respuesta no OK');
        const data = await response.json();

        const humEl = document.getElementById('humedad-actual');
        const tempEl = document.getElementById('temperatura-actual');
        const estadoText = document.getElementById('estado-cultivo');
        const statusDetail = document.getElementById('status-detail');
        const ultimaUpd = document.getElementById('ultima-actualizacion');
        const estadoCard = document.getElementById('estado-card');

        const h = data && data.humedad != null ? Number(data.humedad) : null;
        const t = data && data.temperatura != null ? Number(data.temperatura) : null;

        if (h !== null && t !== null && !isNaN(h) && !isNaN(t)) {
            humEl.textContent = `${h.toFixed(1)}%`;
            tempEl.textContent = `${t.toFixed(1)}°C`;
            const ts = data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString();
            if (ultimaUpd) ultimaUpd.textContent = `Última actualización: ${ts}`;

            // Lógica de estado
            if (h < OPTIMAL_HUMIDITY_LOW || h > OPTIMAL_HUMIDITY_HIGH || t < OPTIMAL_TEMP_LOW || t > OPTIMAL_TEMP_HIGH) {
                estadoCard.className = 'card kpi status-alert';
                estadoText.textContent = '¡ALERTA!';
                if (statusDetail) statusDetail.textContent = 'Condiciones fuera de rango óptimo (80% / 18°C-24°C)';
                document.getElementById('alertas-list').innerHTML = `<li style="color:#dc3545;">ALERTA: Valores fuera de rango (H:${h}% T:${t}°C)</li>`;
            } else {
                estadoCard.className = 'card kpi status-optimal';
                estadoText.textContent = 'Óptimo';
                if (statusDetail) statusDetail.textContent = 'Humedad y Temperatura dentro del rango (80% / 18°C-24°C)';
                document.getElementById('alertas-list').innerHTML = `<li>Sin alertas.</li>`;
            }
        } else {
            // No hay datos válidos
            humEl.textContent = '-- %';
            tempEl.textContent = '-- °C';
            estadoText.textContent = 'Cargando...';
            if (statusDetail) statusDetail.textContent = 'Esperando datos...';
        }
    } catch (error) {
        console.error('Error al obtener datos del servidor Node.js:', error);
        const estadoText = document.getElementById('estado-cultivo');
        if (estadoText) estadoText.textContent = 'ERROR DE CONEXIÓN';
    }
}

// Actualizar la interfaz cada 5 segundos (RF7 - Tiempo Real)
setInterval(fetchAndUpdateData, 5000);
fetchAndUpdateData(); // Llamar inmediatamente al cargar la página
