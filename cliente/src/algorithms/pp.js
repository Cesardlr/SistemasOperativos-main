// Implementación del algoritmo Preemptive Priority (PP)
// Este algoritmo ejecuta los procesos según su prioridad, permitiendo interrupciones
// cuando llega un proceso con mayor prioridad


export const pp = (arrivalTime, burstTime, priorities) => {
  const processesInfo = arrivalTime
    .map((item, index) => {
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
    .sort((process1, process2) => {
      if (process1.at > process2.at) return 1;
      if (process1.at < process2.at) return -1;
      if (process1.priority > process2.priority) return 1;
      if (process1.priority < process2.priority) return -1;
      return 0;
    });

  const solvedProcessesInfo = [];
  const ganttChartInfo = [];

  const readyQueue = [];
  let currentTime = processesInfo[0].at;
  const unfinishedJobs = [...processesInfo];

  const remainingTime = processesInfo.reduce((acc, process) => {
    acc[process.job] = process.bt;
    return acc;
  }, {});

  readyQueue.push(unfinishedJobs[0]);
  while (
    Object.values(remainingTime).reduce((acc, cur) => {
      return acc + cur;
    }, 0) &&
    unfinishedJobs.length > 0
  ) {
    let prevIdle = false;
    if (readyQueue.length === 0 && unfinishedJobs.length > 0) {
      prevIdle = true;
      readyQueue.push(unfinishedJobs[0]);
    }

    readyQueue.sort((a, b) => {
      if (a.priority > b.priority) return 1;
      if (a.priority < b.priority) return -1;
      return 0;
    });

    const processToExecute = readyQueue[0];

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
    let gotInterruption = false;
    processATLessThanBT.some((p) => {
      if (prevIdle) {
        currentTime = processToExecute.at;
      }

      const amount = p.at - currentTime;

      if (currentTime >= p.at) {
        readyQueue.push(p);
      }

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
    const processToArrive = processesInfo.filter((p) => {
      return (
        p.at <= currentTime &&
        p !== processToExecute &&
        !readyQueue.includes(p) &&
        unfinishedJobs.includes(p)
      );
    });

    readyQueue.push(...processToArrive);

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

    readyQueue.push(readyQueue.shift());

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

  solvedProcessesInfo.sort((process1, process2) => {
    if (process1.at > process2.at) return 1;
    if (process1.at < process2.at) return -1;
    if (process1.job > process2.job) return 1;
    if (process1.job < process2.job) return -1;
    return 0;
  });

  return { solvedProcessesInfo, ganttChartInfo };
}; 