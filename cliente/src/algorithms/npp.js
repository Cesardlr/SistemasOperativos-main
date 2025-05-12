// Implementación del algoritmo Non-Preemptive Priority (NPP)
// Este algoritmo ejecuta los procesos según su prioridad, sin interrupciones
export const npp = (arrivalTime, burstTime, priorities) => {
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
        priority: priorities[index],
      };
    })
    // Ordenamos los procesos por tiempo de llegada y prioridad
    .sort((process1, process2) => {
      if (process1.at > process2.at) return 1;
      if (process1.at < process2.at) return -1;
      if (process1.priority > process2.priority) return 1;
      if (process1.priority < process2.priority) return -1;
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
          if (a.priority > b.priority) return 1;
          if (a.priority < a.priority) return -1;
          return 0;
        });
      readyQueue.push(unfinishedJobs[0]);
    }

    // Ordenamos la cola por prioridad
    const rqSortedByPriority = [...readyQueue].sort((a, b) => {
      if (a.priority > b.priority) return 1;
      if (a.priority < b.priority) return -1;
      if (a.at > b.at) return 1;
      if (a.at < b.at) return -1;
      return 0;
    });

    const processToExecute = rqSortedByPriority[0];
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