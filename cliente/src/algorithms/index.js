import { fcfs } from './fcfs';
import { sjf } from './sjf';
import { srtf } from './srtf';
import { rr } from './rr';
import { npp } from './npp';
import { pp } from './pp';
import { HRRNScheduler } from './hrrn';

// Función principal que selecciona y ejecuta el algoritmo de planificación apropiado
// según el nombre del algoritmo proporcionado
export const solve = (
  algo,
  arrivalTime,
  burstTime,
  timeQuantum,
  priorities
) => {
  // Importamos todos los algoritmos disponibles
  const { fcfs } = require("./fcfs");
  const { sjf } = require("./sjf");
  const { srtf } = require("./srtf");
  const { rr } = require("./rr");
  const { npp } = require("./npp");
  const { pp } = require("./pp");
  const { hrrn } = require("./hrrn");

  // Seleccionamos el algoritmo según el nombre proporcionado
  switch (algo) {
    case 'FCFS':
      // First-Come First-Served: ejecuta los procesos en orden de llegada
      return fcfs(arrivalTime, burstTime);
    case 'SJF':
      // Shortest Job First: ejecuta primero los procesos con menor tiempo de ráfaga
      return sjf(arrivalTime, burstTime);
    case 'SRTF':
      // Shortest Remaining Time First: ejecuta el proceso con menor tiempo restante
      return srtf(arrivalTime, burstTime);
    case 'RR':
      // Round Robin: asigna un quantum de tiempo a cada proceso en forma circular
      return rr(arrivalTime, burstTime, timeQuantum);
    case 'NPP':
      // Non-Preemptive Priority: ejecuta los procesos según prioridad sin interrupciones
      return npp(arrivalTime, burstTime, priorities);
    case 'PP':
      // Preemptive Priority: ejecuta los procesos según prioridad permitiendo interrupciones
      return pp(arrivalTime, burstTime, priorities);
    case 'HRRN':
      // Highest Response Ratio Next: ejecuta los procesos según su ratio de respuesta
      return hrrn(arrivalTime, burstTime);
    default:
      // Si el algoritmo no es reconocido, lanzamos un error
      throw new Error(`Algoritmo no reconocido: ${algo}`);
  }
};

// Adaptador para HRRN que hace coincidir la interfaz con los otros algoritmos
function hrrn(arrivalTime, burstTime) {
  // Creamos objetos de proceso con pid, tiempo de llegada y ráfaga
  const processes = arrivalTime.map((arrival, i) => ({
    pid: `P${i + 1}`,
    arrival,
    burst: burstTime[i],
  }));
  
  // Creamos y ejecutamos el planificador HRRN
  const scheduler = new HRRNScheduler(processes);
  scheduler.run();
  const results = scheduler.getResults();
  
  // Transformamos los resultados al formato esperado por la interfaz común
  return {
    solvedProcessesInfo: results.processes.map(p => ({
      job: p.PID,
      at: p.Llegada,
      bt: p.Rafaga,
      ft: p.Finalizacion,
      tat: p.Retorno,
      wat: p.Espera,
      weightedTAT: p.RetornoPonderado,
      response: p.TiempoRespuesta
    })),
    ganttChartInfo: results.gantt.map(g => ({
      job: g.pid,
      start: g.start,
      stop: g.finish
    })),
    avgWT: results.avgWT,
    avgTAT: results.avgTAT,
    avgWeightedTAT: results.avgWeightedTAT,
    avgResponse: results.avgResponse
  };
} 