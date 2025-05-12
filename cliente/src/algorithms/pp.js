// Implementación del algoritmo Preemptive Priority (PP)
// Este algoritmo ejecuta los procesos según su prioridad, permitiendo interrupciones
// cuando llega un proceso con mayor prioridad
export const pp = (arrivalTime, burstTime, priorities) => {
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
    let prevIdle = false;
    if (readyQueue.length === 0 && unfinishedJobs.length > 0) {
      prevIdle = true;
      readyQueue.push(unfinishedJobs[0]);
    }

    // Ordenamos la cola por prioridad
    readyQueue.sort((a, b) => {
      // Los procesos con igual prioridad se ejecutan en orden FCFS
      if (a.priority > b.priority) return 1;
      if (a.priority < b.priority) return -1;
      return 0;
    });

    const processToExecute = readyQueue[0];

    // Buscamos procesos que puedan interrumpir al actual
    const processATLessThanBT = processesInfo.filter((p) => {
      let curr = currentTime;
      if (prevIdle) {
        curr = processToExecute.at;
      }

      return (
        p.at <= remainingTime[processToExecute.job] + curr &&
        p !== processToExecute &&
        !readyQueue.includes(p) &&
        unfinishedJobs.includes(p)
      );
    });

    // Verificamos si hay interrupciones
    let gotInterruption = false;
    processATLessThanBT.some((p) => {
      if (prevIdle) {
        currentTime = processToExecute.at;
      }

      const amount = p.at - currentTime;

      if (currentTime >= p.at) {
        readyQueue.push(p);
      }

      // Si el proceso que llega tiene mayor prioridad, interrumpe
      if (p.priority < processToExecute.priority) {
        remainingTime[processToExecute.job] -= amount;
        readyQueue.push(p);
        const prevCurrentTime = currentTime;
        currentTime += amount;
        ganttChartInfo.push({
          job: processToExecute.job,
          start: prevCurrentTime,
          stop: currentTime,
        });
        gotInterruption = true;
        return true;
      }
    });

    // Agregamos procesos que llegaron durante la ejecución
    const processToArrive = processesInfo.filter((p) => {
      return (
        p.at <= currentTime &&
        p !== processToExecute &&
        !readyQueue.includes(p) &&
        unfinishedJobs.includes(p)
      );
    });

    // Agregamos los nuevos procesos a la cola
    readyQueue.push(...processToArrive);

    // Si no hubo interrupción, ejecutamos el proceso hasta terminar
    if (!gotInterruption) {
      if (prevIdle) {
        const remainingT = remainingTime[processToExecute.job];
        remainingTime[processToExecute.job] -= remainingT;
        currentTime = processToExecute.at + remainingT;

        processATLessThanBT.forEach((p) => {
          if (currentTime >= p.at) {
            readyQueue.push(p);
          }
        });

        ganttChartInfo.push({
          job: processToExecute.job,
          start: processToExecute.at,
          stop: currentTime,
        });
      } else {
        const remainingT = remainingTime[processToExecute.job];
        remainingTime[processToExecute.job] -= remainingT;
        const prevCurrentTime = currentTime;
        currentTime += remainingT;

        processATLessThanBT.forEach((p) => {
          if (currentTime >= p.at && !readyQueue.includes(p)) {
            readyQueue.push(p);
          }
        });

        ganttChartInfo.push({
          job: processToExecute.job,
          start: prevCurrentTime,
          stop: currentTime,
        });
      }
    }

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
  solvedProcessesInfo.sort((process1, process2) => {
    if (process1.at > process2.at) return 1;
    if (process1.at < process2.at) return -1;
    if (process1.job > process2.job) return 1;
    if (process1.job < process2.job) return -1;
    return 0;
  });

  return { solvedProcessesInfo, ganttChartInfo };
}; 