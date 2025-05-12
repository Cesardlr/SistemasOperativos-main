

class HRRNScheduler {

  constructor(processes) {
    // Normalizamos los procesos con campos auxiliares
    this.processes = processes.map((p) => ({
      pid: p.pid,
      arrival: p.arrival,
      burst: p.burst,
      remaining: p.burst,
      waiting: 0,
      turnaround: 0,
      weightedTurnaround: 0,
      response: 0,
      completion: 0,
      finished: false,
    }));

    // El reloj inicia en el primer arribo
    this.clock = Math.min(...this.processes.map((p) => p.arrival));
    this.gantt = []; // Historial para diagrama de Gantt
  }

  /**
   * Filtra los procesos listos (arrival <= clock y no terminados)
   * @returns {Array}
   */
  _readyQueue() {
    return this.processes.filter((p) => !p.finished && p.arrival <= this.clock);
  }

  /**
   * Calcula el Ratio de Respuesta y selecciona el de mayor prioridad
   * Si hay empate usa el primer arribo como criterio secundario.
   * @param {Array} ready
   */
  _pickProcess(ready) {
    return ready.sort((a, b) => {
      const rrA = (this.clock - a.arrival + a.burst) / a.burst;
      const rrB = (this.clock - b.arrival + b.burst) / b.burst;

      if (rrB !== rrA) return rrB - rrA; // Descendente por RR
      return a.arrival - b.arrival; // Empate: FIFO
    })[0];
  }

  /**
   * Ejecuta la simulación completa hasta que todos los procesos terminen.
   */
  run() {
    while (this.processes.some((p) => !p.finished)) {
      const ready = this._readyQueue();

      // Si no hay procesos listos, adelantamos el reloj al próximo arribo
      if (ready.length === 0) {
        const nextArrival = Math.min(
          ...this.processes.filter((p) => !p.finished).map((p) => p.arrival)
        );
        this.clock = nextArrival;
        continue;
      }

      // Selección por HRRN (no expropiativo)
      const current = this._pickProcess(ready);
      const start = this.clock;
      
      // Response time is the time from arrival until first execution
      if (current.response === 0) {
        current.response = start - current.arrival;
      }
      
      this.clock += current.burst; // Ejecuta hasta completar ráfaga
      const finish = this.clock;

      // Actualiza métricas del proceso
      current.finished = true;
      current.completion = finish;
      current.turnaround = finish - current.arrival;
      current.waiting = current.turnaround - current.burst;
      current.weightedTurnaround = current.turnaround / current.burst;

      // Guarda segmento de Gantt
      this.gantt.push({ pid: current.pid, start, finish });
    }
  }

  /**
   * Devuelve los resultados individuales y promedios.
   */
  getResults() {
    const avgWaiting =
      this.processes.reduce((s, p) => s + p.waiting, 0) / this.processes.length;
    const avgTurnaround =
      this.processes.reduce((s, p) => s + p.turnaround, 0) /
      this.processes.length;
    const avgWeightedTurnaround =
      this.processes.reduce((s, p) => s + p.weightedTurnaround, 0) /
      this.processes.length;
    const avgResponse =
      this.processes.reduce((s, p) => s + p.response, 0) /
      this.processes.length;

    return {
      processes: this.processes.map((p) => ({
        PID: p.pid,
        Llegada: p.arrival,
        Rafaga: p.burst,
        Espera: p.waiting,
        Retorno: p.turnaround,
        RetornoPonderado: p.weightedTurnaround,
        TiempoRespuesta: p.response,
        Finalizacion: p.completion,
      })),
      gantt: this.gantt,
      avgWT: avgWaiting,
      avgTAT: avgTurnaround,
      avgWeightedTAT: avgWeightedTurnaround,
      avgResponse: avgResponse
    };
  }
}

// Exportación para Node.js o uso en navegador
if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
  module.exports = HRRNScheduler;
} else {
  window.HRRNScheduler = HRRNScheduler;
}

export { HRRNScheduler };

// Implementación del algoritmo Highest Response Ratio Next (HRRN)
// Este algoritmo ejecuta los procesos según su ratio de respuesta, que considera
// el tiempo de espera y el tiempo de ráfaga
export const hrrn = (arrivalTime, burstTime) => {
  // Creamos un array de objetos con la información de cada proceso
  const processesInfo = arrivalTime
    .map((item, index) => {
      // Si hay más de 26 procesos, usamos P1, P2, etc.
      // Si no, usamos letras (A, B, C, etc.)
      const job =
        arrivalTime.length > 26
          ? `P${index + 1}`
          : (index + 10).toString(36).toUpperCase();

      return {
        job,
        at: item,
        bt: burstTime[index],
      };
    })
    // Ordenamos los procesos por tiempo de llegada
    .sort((process1, process2) => {
      if (process1.at > process2.at) return 1;
      if (process1.at < process2.at) return -1;
      return 0;
    });

  // Arrays para almacenar tiempos y resultados
  let finishTime = [];
  let ganttChartInfo = [];

  const solvedProcessesInfo = [];
  const readyQueue = [];
  const finishedJobs = [];

  // Procesamos cada proceso
  for (let i = 0; i < processesInfo.length; i++) {
    // Manejo especial para el primer proceso
    if (i === 0) {
      readyQueue.push(processesInfo[0]);
      finishTime.push(processesInfo[0].at + processesInfo[0].bt);
      solvedProcessesInfo.push({
        ...processesInfo[0],
        ft: finishTime[0],
        tat: finishTime[0] - processesInfo[0].at,
        wat: finishTime[0] - processesInfo[0].at - processesInfo[0].bt,
      });

      // Agregamos procesos que llegaron durante la ejecución del primero
      processesInfo.forEach((p) => {
        if (p.at <= finishTime[0] && !readyQueue.includes(p)) {
          readyQueue.push(p);
        }
      });

      readyQueue.shift();
      finishedJobs.push(processesInfo[0]);

      // Agregamos al diagrama de Gantt
      ganttChartInfo.push({
        job: processesInfo[0].job,
        start: processesInfo[0].at,
        stop: finishTime[0],
      });
    }

    // Si no hay procesos en la cola pero hay procesos sin terminar
    if (
      readyQueue.length === 0 &&
      finishedJobs.length !== processesInfo.length
    ) {
      // Filtramos los procesos no terminados y los ordenamos
      const unfinishedJobs = processesInfo
        .filter((p) => {
          return !finishedJobs.includes(p);
        })
        .sort((a, b) => {
          if (a.at > b.at) return 1;
          if (a.at < b.at) return -1;
          return 0;
        });
      readyQueue.push(unfinishedJobs[0]);
    }

    // Calculamos el ratio de respuesta para cada proceso en la cola
    const rqSortedByResponseRatio = [...readyQueue].sort((a, b) => {
      const aResponseRatio =
        (finishTime[finishTime.length - 1] - a.at + a.bt) / a.bt;
      const bResponseRatio =
        (finishTime[finishTime.length - 1] - b.at + b.bt) / b.bt;
      if (aResponseRatio < bResponseRatio) return 1;
      if (aResponseRatio > bResponseRatio) return -1;
      if (a.at > b.at) return 1;
      if (a.at < b.at) return -1;
      return 0;
    });

    const processToExecute = rqSortedByResponseRatio[0];
    const previousFinishTime = finishTime[finishTime.length - 1];

    // Calculamos el tiempo de finalización
    if (processToExecute.at > previousFinishTime) {
      finishTime.push(processToExecute.at + processToExecute.bt);
      const newestFinishTime = finishTime[finishTime.length - 1];
      ganttChartInfo.push({
        job: processToExecute.job,
        start: processToExecute.at,
        stop: newestFinishTime,
      });
    } else {
      finishTime.push(previousFinishTime + processToExecute.bt);
      const newestFinishTime = finishTime[finishTime.length - 1];
      ganttChartInfo.push({
        job: processToExecute.job,
        start: previousFinishTime,
        stop: newestFinishTime,
      });
    }

    const newestFinishTime = finishTime[finishTime.length - 1];

    // Agregamos la información del proceso ejecutado
    solvedProcessesInfo.push({
      ...processToExecute,
      ft: newestFinishTime,
      tat: newestFinishTime - processToExecute.at,
      wat: newestFinishTime - processToExecute.at - processToExecute.bt,
    });

    // Agregamos nuevos procesos que llegaron durante la ejecución
    processesInfo.forEach((p) => {
      if (
        p.at <= newestFinishTime &&
        !readyQueue.includes(p) &&
        !finishedJobs.includes(p)
      ) {
        readyQueue.push(p);
      }
    });

    // Removemos el proceso ejecutado de la cola
    const indexToRemove = readyQueue.indexOf(processToExecute);
    if (indexToRemove > -1) {
      readyQueue.splice(indexToRemove, 1);
    }

    // Marcamos el proceso como terminado
    finishedJobs.push(processToExecute);
  }

  // Ordenamos los resultados por tiempo de llegada y nombre del proceso
  solvedProcessesInfo.sort((obj1, obj2) => {
    if (obj1.at > obj2.at) return 1;
    if (obj1.at < obj2.at) return -1;
    if (obj1.job > obj2.job) return 1;
    if (obj1.job < obj2.job) return -1;
    return 0;
  });

  return { solvedProcessesInfo, ganttChartInfo };
};
