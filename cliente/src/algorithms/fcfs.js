// Implementación del algoritmo First-Come First-Served (FCFS)
// Este algoritmo ejecuta los procesos en el orden en que llegan
export const fcfs = (arrivalTime, burstTime) => {
  // Creamos un array de objetos con la información de cada proceso
  // Cada proceso tiene: job (nombre), at (tiempo de llegada), bt (tiempo de ráfaga)
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
    .sort((obj1, obj2) => {
      if (obj1.at > obj2.at) {
        return 1;
      }
      if (obj1.at < obj2.at) {
        return -1;
      }
      return 0;
    });

  // Arrays para almacenar los tiempos de finalización y el diagrama de Gantt
  let finishTime = [];
  let ganttChartInfo = [];

  // Calculamos la información de cada proceso
  const solvedProcessesInfo = processesInfo.map((process, index) => {
    // Si es el primer proceso o si el proceso actual llega después del anterior
    if (index === 0 || process.at > finishTime[index - 1]) {
      // El tiempo de finalización es el tiempo de llegada + ráfaga
      finishTime[index] = process.at + process.bt;

      // Agregamos al diagrama de Gantt
      ganttChartInfo.push({
        job: process.job,
        start: process.at,
        stop: finishTime[index],
      });
    } else {
      // Si el proceso llega antes de que termine el anterior
      // El tiempo de finalización es el tiempo de finalización del anterior + ráfaga
      finishTime[index] = finishTime[index - 1] + process.bt;

      // Agregamos al diagrama de Gantt
      ganttChartInfo.push({
        job: process.job,
        start: finishTime[index - 1],
        stop: finishTime[index],
      });
    }

    // Retornamos la información completa del proceso
    return {
      ...process,
      ft: finishTime[index], // Tiempo de finalización
      tat: finishTime[index] - process.at, // Tiempo de retorno (turnaround)
      wat: finishTime[index] - process.at - process.bt, // Tiempo de espera
    };
  });

  // Retornamos la información de los procesos y el diagrama de Gantt
  return { solvedProcessesInfo, ganttChartInfo };
}; 