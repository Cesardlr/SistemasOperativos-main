// Implementación del algoritmo Round Robin (RR)
// Este algoritmo asigna un quantum de tiempo a cada proceso en forma circular
export const rr = (arrivalTime, burstTime, timeQuantum) => {
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
    .sort((obj1, obj2) => {
      if (obj1.at > obj2.at) return 1;
      if (obj1.at < obj2.at) return -1;
      return 0;
    });

  // Arrays para almacenar resultados
  const solvedProcessesInfo = [];
  const ganttChartInfo = [];

  // Cola de procesos listos y tiempo actual
  const readyQueue = [];
  let currentTime = processesInfo[0].at;
  const unfinishedJobs = [...processesInfo];

  // Mapa para llevar el registro del tiempo restante de cada proceso
  const remainingTime = processesInfo.reduce((acc, process) => {
    acc[process.job] = process.bt;
    return acc;
  }, {});

  // Agregamos el primer proceso a la cola
  readyQueue.push(unfinishedJobs[0]);

  // Mientras haya procesos sin terminar
  while (
    Object.values(remainingTime).reduce((acc, cur) => {
      return acc + cur;
    }, 0) &&
    unfinishedJobs.length > 0
  ) {
    // Si la cola está vacía pero hay procesos sin terminar
    if (readyQueue.length === 0 && unfinishedJobs.length > 0) {
      readyQueue.push(unfinishedJobs[0]);
      currentTime = readyQueue[0].at;
    }

    const processToExecute = readyQueue[0];

    // Si el tiempo restante es menor o igual al quantum
    if (remainingTime[processToExecute.job] <= timeQuantum) {
      // Ejecutamos hasta terminar
      const remainingT = remainingTime[processToExecute.job];
      remainingTime[processToExecute.job] -= remainingT;
      const prevCurrentTime = currentTime;
      currentTime += remainingT;

      ganttChartInfo.push({
        job: processToExecute.job,
        start: prevCurrentTime,
        stop: currentTime,
      });
    } else {
      // Ejecutamos por el quantum
      remainingTime[processToExecute.job] -= timeQuantum;
      const prevCurrentTime = currentTime;
      currentTime += timeQuantum;

      ganttChartInfo.push({
        job: processToExecute.job,
        start: prevCurrentTime,
        stop: currentTime,
      });
    }

    // Agregamos procesos que llegaron durante este ciclo
    const processToArriveInThisCycle = processesInfo.filter((p) => {
      return (
        p.at <= currentTime &&
        p !== processToExecute &&
        !readyQueue.includes(p) &&
        unfinishedJobs.includes(p)
      );
    });

    // Agregamos los nuevos procesos a la cola
    readyQueue.push(...processToArriveInThisCycle);

    // Movemos el proceso al final de la cola
    readyQueue.push(readyQueue.shift());

    // Si el proceso terminó, lo removemos y guardamos sus resultados
    if (remainingTime[processToExecute.job] === 0) {
      const indexToRemoveUJ = unfinishedJobs.indexOf(processToExecute);
      if (indexToRemoveUJ > -1) {
        unfinishedJobs.splice(indexToRemoveUJ, 1);
      }
      const indexToRemoveRQ = readyQueue.indexOf(processToExecute);
      if (indexToRemoveRQ > -1) {
        readyQueue.splice(indexToRemoveRQ, 1);
      }

      solvedProcessesInfo.push({
        ...processToExecute,
        ft: currentTime,
        tat: currentTime - processToExecute.at,
        wat: currentTime - processToExecute.at - processToExecute.bt,
      });
    }
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