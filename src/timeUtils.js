import config from './config.js';

export function hojeKey(date = new Date()) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function horaAtualHHMM(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// valida e normaliza hora em dois formatos: "8:5" -> "08:05" ou "0805" -> "08:05"
// retorna null se invalido
export function normalizarHora(texto) {
  const valor = texto.trim();

  const comDoisPontos = valor.match(/^(\d{1,2}):(\d{2})$/);
  const somenteNumeros = valor.match(/^(\d{1,2})(\d{2})$/);
  const match = comDoisPontos || somenteNumeros;

  if (!match) return null;

  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// diferenca em horas (decimal) entre duas strings HH:MM
export function diferencaEmHoras(horaInicio, horaFim) {
  const [h1, m1] = horaInicio.split(':').map(Number);
  const [h2, m2] = horaFim.split(':').map(Number);
  const minutosInicio = h1 * 60 + m1;
  let minutosFim = h2 * 60 + m2;
  if (minutosFim < minutosInicio) {
    // virou o dia (ex: turno noturno), assume que terminou no dia seguinte
    minutosFim += 24 * 60;
  }
  return (minutosFim - minutosInicio) / 60;
}

export function formatarHoras(horasDecimal) {
  const sinal = horasDecimal < 0 ? '-' : '';
  const abs = Math.abs(horasDecimal);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  return `${sinal}${h}h${String(m).padStart(2, '0')}min`;
}

export function eDiaUtil(date = new Date()) {
  return config.diasUteis.includes(date.getDay());
}
