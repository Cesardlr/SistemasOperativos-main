import { fcfs } from './fcfs';
import { sjf } from './sjf';
import { srtf } from './srtf';
import { rr } from './rr';
import { npp } from './npp';
import { pp } from './pp';
import { HRRNScheduler } from './hrrn';

export const solve = (
  algo,
  arrivalTime,
  burstTime,
  timeQuantum,
  priorities
) => {
  switch (algo) {
    case 'FCFS':
      return fcfs(arrivalTime, burstTime);
    case 'SJF':
      return sjf(arrivalTime, burstTime);
    case 'SRTF':
      return srtf(arrivalTime, burstTime);
    case 'RR':
      return rr(arrivalTime, burstTime, timeQuantum);
    case 'NPP':
      return npp(arrivalTime, burstTime, priorities);
    case 'PP':
      return pp(arrivalTime, burstTime, priorities);
    case 'HRRN':
      return hrrn(arrivalTime, burstTime);
    default:
      return { solvedProcessesInfo: [], ganttChartInfo: [] };
  }
};

// HRRN wrapper to match the interface
function hrrn(arrivalTime, burstTime) {
  // Compose process objects with pid, arrival, burst
  const processes = arrivalTime.map((arrival, i) => ({
    pid: `P${i + 1}`,
    arrival,
    burst: burstTime[i],
  }));
  const scheduler = new HRRNScheduler(processes);
  scheduler.run();
  const results = scheduler.getResults();
  
  // Transform the results to match the expected format
  return {
    solvedProcessesInfo: results.processes.map(p => ({
      job: p.PID,
      at: p.Llegada,
      bt: p.Rafaga,
      ft: p.Finalizacion,
      tat: p.Retorno,
      wat: p.Espera
    })),
    ganttChartInfo: results.gantt.map(g => ({
      job: g.pid,
      start: g.start,
      stop: g.finish
    })),
    avgWT: results.avgWT,
    avgTAT: results.avgTAT
  };
} 