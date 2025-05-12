// Implementación del algoritmo Highest Response Ratio Next (HRRN)
// Este algoritmo selecciona el proceso con el mejor ratio de respuesta (RR)
// Si hay empate, selecciona el primero en llegar

class HRRNScheduler {
  constructor(processes) {
    this.processes = processes.map((p) => ({
      pid: p.pid,
      arrival: p.arrival,
      burst: p.burst,
      remaining: p.burst,
      waiting: 0,
      turnaround: 0,
      completion: 0,
      finished: false,
      responseTime: -1,
      weightedTAT: 0,
    }));

    this.clock = Math.min(...this.processes.map((p) => p.arrival));
    this.gantt = []; // Historial para diagrama de Gantt
  }

  _readyQueue() {
    return this.processes.filter((p) => !p.finished && p.arrival <= this.clock);
  }

  _pickProcess(ready) {
    return ready.sort((a, b) => {
      const rrA = (this.clock - a.arrival + a.burst) / a.burst;
      const rrB = (this.clock - b.arrival + b.burst) / b.burst;

      if (rrB !== rrA) return rrB - rrA; // Descendente por RR
      return a.arrival - b.arrival; // Empate: FIFO
    })[0];
  }

  run() {
    while (this.processes.some((p) => !p.finished)) {
      const ready = this._readyQueue();

      if (ready.length === 0) {
        const nextArrival = Math.min(
          ...this.processes.filter((p) => !p.finished).map((p) => p.arrival)
        );
        this.clock = nextArrival;
        continue;
      }

      const current = this._pickProcess(ready);
      const start = this.clock;

      // tiempo de respuesta
      if (current.responseTime === -1) {
        current.responseTime = start - current.arrival;
      }

      this.clock += current.burst;
      const finish = this.clock;

      current.finished = true;
      current.completion = finish;
      current.turnaround = finish - current.arrival;
      current.waiting = current.turnaround - current.burst;
      current.weightedTAT = current.turnaround / current.burst;

      this.gantt.push({ pid: current.pid, start, finish });
    }
  }

  getResults() {
    const avgWaiting =
      this.processes.reduce((s, p) => s + p.waiting, 0) / this.processes.length;
    const avgTurnaround =
      this.processes.reduce((s, p) => s + p.turnaround, 0) /
      this.processes.length;
    const avgWeightedTat =
      this.processes.reduce((s, p) => s + p.weightedTAT, 0) /
      this.processes.length;
    const avgResponseTime =
      this.processes.reduce((s, p) => s + p.responseTime, 0) /
      this.processes.length;

    return {
      processes: this.processes.map((p) => ({
        PID: p.pid,
        Llegada: p.arrival,
        Rafaga: p.burst,
        Espera: p.waiting,
        Retorno: p.turnaround,
        Finalizacion: p.completion,
        weightedTAT: p.weightedTAT,
        response: p.responseTime,
      })),
      gantt: this.gantt,
      avgWT: avgWaiting,
      avgTAT: avgTurnaround,
      avgWeightedTAT: avgWeightedTat,
      avgResponse: avgResponseTime,
    };
  }
}

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
  module.exports = HRRNScheduler;
} else {
  window.HRRNScheduler = HRRNScheduler;
}

export { HRRNScheduler };
