// public/js/config_riego.js
// Sistema de Calendario de Riego con Notificaciones

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const STORAGE_KEY = 'orquideas_schedule';
const HISTORY_KEY = 'orquideas_schedule_history';

// ============ CARGAR CALENDARIO ============
function loadSchedule() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Error cargando calendario:', e);
    }
  }
  return {};
}

// ============ GUARDAR CALENDARIO ============
function saveSchedule(schedule) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
  console.log('Calendario guardado:', schedule);
}

// ============ MOSTRAR HORARIOS PROGRAMADOS (RF2) ============
function displaySchedule() {
  const schedule = loadSchedule();
  const listEl = document.getElementById('schedule-list');
  if (!listEl) return;

  const dias = [];
  DIAS_SEMANA.forEach(dia => {
    if (schedule[dia] && schedule[dia].enabled) {
      dias.push({ dia, time: schedule[dia].time });
    }
  });
  
  if (dias.length === 0) {
    listEl.innerHTML = '<li style="text-align:center; color:#999;">No hay horarios configurados</li>';
    return;
  }

  listEl.innerHTML = dias.map(item => {
    const diaCapitalizado = item.dia.charAt(0).toUpperCase() + item.dia.slice(1);
    return `
      <li class="schedule-item">
        <div><strong> ${diaCapitalizado}</strong> a las <strong>${item.time}</strong></div>
        <button class="btn-eliminar" onclick="removeScheduleDay('${item.dia}')"></button>
      </li>
    `;
  }).join('');

  calculateNextWatering();
}

// ============ ELIMINAR UN DÍA DEL CALENDARIO ============
function removeScheduleDay(dia) {
  const schedule = loadSchedule();
  if (schedule[dia]) {
    delete schedule[dia];
    saveSchedule(schedule);
    
    const checkbox = document.getElementById(`dia-${dia}`);
    if (checkbox) checkbox.checked = false;
    
    displaySchedule();
    alert(`Riego de ${dia.charAt(0).toUpperCase() + dia.slice(1)} eliminado`);
  }
}

// ============ CALCULAR PRÓXIMO RIEGO ============
function calculateNextWatering() {
  const schedule = loadSchedule();
  const nextEl = document.getElementById('next-watering');
  if (!nextEl) return;

  const now = new Date();
  const currentDayIndex = now.getDay(); // 0 = domingo, 1 = lunes, etc.
  const currentTime = now.getHours() * 60 + now.getMinutes();

  let nextWatering = null;
  let minDiff = Infinity;

  DIAS_SEMANA.forEach((dia, index) => {
    if (schedule[dia] && schedule[dia].enabled) {
      const [hours, minutes] = schedule[dia].time.split(':').map(Number);
      const scheduleTime = hours * 60 + minutes;
      
      let dayDiff = index - currentDayIndex;
      if (dayDiff < 0) dayDiff += 7;
      if (dayDiff === 0 && scheduleTime <= currentTime) dayDiff = 7;
      
      const totalMinDiff = dayDiff * 24 * 60 + (scheduleTime - currentTime);
      
      if (totalMinDiff > 0 && totalMinDiff < minDiff) {
        minDiff = totalMinDiff;
        nextWatering = {
          dia: dia,
          time: schedule[dia].time,
          dayDiff: dayDiff
        };
      }
    }
  });

  if (nextWatering) {
    const diaCapitalizado = nextWatering.dia.charAt(0).toUpperCase() + nextWatering.dia.slice(1);
    if (nextWatering.dayDiff === 0) {
      nextEl.innerHTML = `<span style="color:#28a745; font-size:1.3em;"> Hoy a las <strong>${nextWatering.time}</strong></span>`;
    } else if (nextWatering.dayDiff === 1) {
      nextEl.innerHTML = `<span style="color:#007bff; font-size:1.3em;"> Mañana (${diaCapitalizado}) a las <strong>${nextWatering.time}</strong></span>`;
    } else {
      nextEl.innerHTML = `<span style="color:#007bff; font-size:1.3em;"> ${diaCapitalizado} a las <strong>${nextWatering.time}</strong></span>`;
    }
  } else {
    nextEl.innerHTML = '<span style="color:#999; font-size:1.1em;"> No hay riegos programados</span>';
  }
}

// ============ NOTIFICACIONES DEL NAVEGADOR ============
function checkNotificationStatus() {
  const statusEl = document.getElementById('notif-status');
  if (!statusEl) return;

  if (!('Notification' in window)) {
    statusEl.textContent = ' No soportadas en este navegador';
  } else if (Notification.permission === 'granted') {
    statusEl.textContent = ' Activadas';
  } else if (Notification.permission === 'denied') {
    statusEl.textContent = ' Bloqueadas (verifica configuración del navegador)';
  } else {
    statusEl.textContent = ' Pendientes (activa)';
  }
}

function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Tu navegador no soporta notificaciones');
    return;
  }

  if (Notification.permission === 'granted') {
    alert('Las notificaciones ya están activadas');
    return;
  }

  if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        alert('¡Notificaciones activadas!');
        checkNotificationStatus();
        new Notification(' Monitor de Orquídeas', {
          body: 'Las notificaciones de riego están activadas',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90"></text></svg>'
        });
      } else {
        alert('Notificaciones rechazadas. Puedes activarlas en la configuración del navegador.');
      }
    });
  }
}

// ============ VERIFICAR HORA DE RIEGO ============
function checkWateringTime() {
  const schedule = loadSchedule();
  const now = new Date();
  const diaActual = DIAS_SEMANA[now.getDay()];
  const horaActual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (schedule[diaActual] && schedule[diaActual].enabled && schedule[diaActual].time === horaActual) {
    if (Notification.permission === 'granted') {
      new Notification(' ¡Hora de Regar!', {
        body: `Es hora de regar tus orquídeas (${diaActual.charAt(0).toUpperCase() + diaActual.slice(1)} a las ${horaActual})`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90"></text></svg>',
        tag: 'watering-notification'
      });
      console.log(' Notificación de riego enviada');
    }
  }
}

// ============ FORM SUBMIT - GUARDAR CALENDARIO ============
document.addEventListener('DOMContentLoaded', () => {
  const formCalendario = document.getElementById('form-calendario');
  
  if (formCalendario) {
    formCalendario.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const schedule = {};
      let diasSeleccionados = 0;
      
      DIAS_SEMANA.forEach(dia => {
        const checkbox = document.getElementById(`dia-${dia}`);
        const timeInput = document.getElementById(`hora-${dia}`);
        
        if (checkbox && checkbox.checked && timeInput && timeInput.value) {
          schedule[dia] = {
            enabled: true,
            time: timeInput.value
          };
          diasSeleccionados++;
        }
      });

      if (diasSeleccionados === 0) {
        alert(' Selecciona al menos un día para regar');
        return;
      }

      saveSchedule(schedule);
      
      const mensajeEl = document.getElementById('mensaje-guardado');
      if (mensajeEl) {
        mensajeEl.className = 'alert-success';
        mensajeEl.innerHTML = ` Calendario guardado: ${diasSeleccionados} día(s) configurado(s)`;
        mensajeEl.style.display = 'block';
        
        setTimeout(() => {
          mensajeEl.style.display = 'none';
        }, 5000);
      }
      
      displaySchedule();
      
      // Guardar en historial
      addToHistory(schedule);
    });
  }

  // Inicializar
  checkNotificationStatus();
  const btnNotif = document.getElementById('btn-enable-notifications');
  if (btnNotif) {
    btnNotif.addEventListener('click', requestNotificationPermission);
  }
  
  // Cargar calendario guardado
  const schedule = loadSchedule();
  DIAS_SEMANA.forEach(dia => {
    if (schedule[dia] && schedule[dia].enabled) {
      const checkbox = document.getElementById(`dia-${dia}`);
      const timeInput = document.getElementById(`hora-${dia}`);
      if (checkbox) checkbox.checked = true;
      if (timeInput) timeInput.value = schedule[dia].time;
    }
  });
  
  displaySchedule();
  
  // Verificar hora de riego cada minuto
  setInterval(checkWateringTime, 60000);
  checkWateringTime();
  
  // Recalcular próximo riego cada minuto
  setInterval(() => {
    calculateNextWatering();
  }, 60000);
});

// ============ HISTORIAL DE CAMBIOS ============
function addToHistory(schedule) {
  let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  
  const diasConfigurables = Object.keys(schedule).filter(dia => schedule[dia].enabled);
  
  history.unshift({
    date: new Date().toLocaleString('es-ES'),
    dias: diasConfigurables.length,
    horarios: diasConfigurables.map(dia => `${dia}: ${schedule[dia].time}`).join(', ')
  });
  
  if (history.length > 50) history.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}
