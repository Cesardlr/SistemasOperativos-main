/**
 * Highest Response Ratio Next (HRRN) – Algoritmo de Planificación de CPU
 * ================================================================
 * Calcula el orden de ejecución basándose en el Ratio de Respuesta:
 *      RR = (Tiempo de Espera + Tiempo de Rafaga) / Tiempo de Rafaga
 * Donde el proceso con el mayor RR obtiene la CPU.
 *
 * Ejemplo de uso (Node.js o navegador):
 * ------------------------------------------------
 *   const scheduler = new HRRNScheduler([
 *     { pid: "P1", arrival: 0, burst: 3 },
 *     { pid: "P2", arrival: 2, burst: 6 },
 *     { pid: "P3", arrival: 4, burst: 4 },
 *     { pid: "P4", arrival: 6, burst: 5 },
 *     { pid: "P5", arrival: 8, burst: 2 }
 *   ]);
 *   scheduler.run();
 *   console.table(scheduler.getResults().processes);
 *   console.log("Promedio espera:", scheduler.getResults().promedioEspera);
 *   console.log("Promedio retorno:", scheduler.getResults().promedioRetorno);
 * ------------------------------------------------
 */

class HRRNScheduler {
  /**
   * @param {Array<{pid:string,arrival:number,burst:number}>} processes
   */
  constructor(processes) {
    // Normalizamos los procesos con campos auxiliares
    this.processes = processes.map((p) => ({
      pid: p.pid,
      arrival: p.arrival,
      burst: p.burst,
      remaining: p.burst,
      waiting: 0,
      turnaround: 0,
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
      this.clock += current.burst; // Ejecuta hasta completar ráfaga
      const finish = this.clock;

      // Actualiza métricas del proceso
      current.finished = true;
      current.completion = finish;
      current.turnaround = finish - current.arrival;
      current.waiting = current.turnaround - current.burst;

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

    return {
      processes: this.processes.map((p) => ({
        PID: p.pid,
        Llegada: p.arrival,
        Rafaga: p.burst,
        Espera: p.waiting,
        Retorno: p.turnaround,
        Finalizacion: p.completion,
      })),
      gantt: this.gantt,
      avgWT: avgWaiting,
      avgTAT: avgTurnaround,
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
