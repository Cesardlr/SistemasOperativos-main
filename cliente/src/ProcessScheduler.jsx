import React, { useState, useRef, useEffect, useCallback } from "react";
import { solve } from "./algorithms/index";

import {
    Container, Card, CardHeader, CardContent, TextField, Button, Select, MenuItem,
    FormControl, InputLabel, Radio, RadioGroup, FormControlLabel, FormLabel, Table, TableHead,
    TableBody, TableRow, TableCell, Stack, Box, Typography, List, ListItem, ListItemText,
    TableContainer, Paper, IconButton // IconButton para el botón de quitar
} from "@mui/material";
import DeleteIcon from '@mui/icons-material/Delete'; // Icono para quitar
import { motion } from "framer-motion";

const COLORS = [
    "#4caf50", "#2196f3", "#ff9800", "#9c27b0", "#f44336", "#03a9f4",
];

const algorithmOptions = [
    { value: "FCFS", label: "First-Come First-Served" },
    { value: "SJF", label: "Shortest Job First" },
    { value: "SRTF", label: "Shortest Remaining Time First" },
    { value: "RR", label: "Round Robin" },
    { value: "NPP", label: "Non-Preemptive Priority" },
    { value: "PP", label: "Preemptive Priority" },
    { value: "HRRN", label: "Highest Response Ratio Next" },
];

export default function ProcessScheduler() {
    const [arrivalInput, setArrivalInput] = useState("");
    const [burstInput, setBurstInput] = useState("");
    const [priorityInput, setPriorityInput] = useState("");
    const [algorithm, setAlgorithm] = useState("FCFS");
    const [timeQuantum, setTimeQuantum] = useState("2");
    
    // fileName ya no se usará para mostrar una lista, rutasArchivosSubidos será la fuente de verdad.
    // const [fileName, setFileName] = useState(""); // Comentado o eliminado
    const fileRef = useRef(null);
    const [optionType, setOptionType] = useState("thread");
    const [optionCount, setOptionCount] = useState("1");
    const [rutasArchivosSubidos, setRutasArchivosSubidos] = useState([]); // Almacena las rutas completas de los archivos

    const [results, setResults] = useState({
        solvedProcessesInfo: [],
        ganttChartInfo: [],
    });

    const ws = useRef(null);
    const csvRowBuffer = useRef([]);
    const bufferTimeout = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const [availableEvents, setAvailableEvents] = useState({});
    const [subscribedEvents, setSubscribedEvents] = useState(new Set());
    const [serverResponseMessage, setServerResponseMessage] = useState("Intentando conectar...");
    const [csvFilasEnProgreso, setCsvFilasEnProgreso] = useState([]);
    const [procesamientoCsvTerminado, setProcesamientoCsvTerminado] = useState(false);
    const [showCsvTable, setShowCsvTable] = useState(false);

    const sendMessage = (messageObject) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(messageObject));
        } else {
            console.error("DEBUG: WebSocket no está conectado o listo para enviar.");
            setServerResponseMessage("Error: No se pudo enviar mensaje. WebSocket desconectado.");
        }
    };

    const handleWsMessage = useCallback((event) => {
        try {
            const message = JSON.parse(event.data);
            console.log("DEBUG: Mensaje recibido del servidor WS:", message);

            if (message.tipo !== "csv_actualizacion_fila") {
                setServerResponseMessage(`Servidor: ${message.mensaje || message.tipo || JSON.stringify(message.data) || ''}`);
            }

            switch (message.tipo) {
                case "conexion_establecida":
                    sendMessage({ tipo: "listar_eventos" });
                    if (!subscribedEvents.has('default_event')) {
                        sendMessage({ tipo: "suscribir", evento: 'default_event' });
                    }
                    break;
                case "lista_eventos_actualizada":
                    setAvailableEvents(message.eventos || {});
                    break;
                case "evento_disparado":
                    if (subscribedEvents.has(message.evento)) {
                        // MODIFICADO: Ya no hay alerta si no hay archivos.
                        // Se envía la solicitud; si rutasArchivosSubidos está vacío, el servidor procesará todos.
                        const numArchivos = rutasArchivosSubidos.length;
                        setServerResponseMessage(
                            `Evento '${message.evento}' recibido! Solicitando procesamiento CSV ${numArchivos > 0 ? `para ${numArchivos} archivo(s) seleccionado(s)` : '(se procesarán todos los archivos por defecto en el servidor)'}...`
                        );
                        setCsvFilasEnProgreso([]);
                        setProcesamientoCsvTerminado(false);
                        setShowCsvTable(true);
                        sendMessage({
                            tipo: "solicitar_procesamiento_csv",
                            rutas_archivos_subidos: rutasArchivosSubidos, // Si está vacío, el servidor lo interpretará.
                        });
                    }
                    break;
                // ... (otros cases sin cambios relevantes a esta funcionalidad)
                case "confirmacion_suscripcion":
                    setSubscribedEvents(prev => new Set(prev).add(message.evento));
                    setServerResponseMessage(`Suscrito a: ${message.evento}`);
                    break;
                case "confirmacion_desuscripcion":
                    setSubscribedEvents(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(message.evento);
                        return newSet;
                    });
                    setServerResponseMessage(`Desuscrito de: ${message.evento}`);
                    break;
                case "confirmacion_config_threads":
                    setServerResponseMessage(`Configuración de concurrencia (${message.threads} ${message.concurrency_mode}(s)) confirmada.`);
                    break;
                case "csv_actualizacion_fila":
                    if (message.fila_csv && typeof message.fila_csv === 'object') {
                        setCsvFilasEnProgreso(prevFilas => [...prevFilas, message.fila_csv]);
                        setShowCsvTable(true);
                    }
                    break;
                case "procesamiento_csv_terminado":
                    setServerResponseMessage(`Procesamiento CSV en servidor terminado. Estado: ${message.data?.status || 'finalizado'}.`);
                    setProcesamientoCsvTerminado(true);
                    setShowCsvTable(true);
                    if (message.data?.status === "fallido_script" || message.data?.status === "completado_inesperado") {
                        console.error("DEBUG: Fallo en script de servidor:", message.data)
                    }
                    break;
                case "progreso_procesamiento_info":
                    setServerResponseMessage(`Info del Servidor: ${message.mensaje}`);
                    break;
                case "error_servidor":
                    console.error("DEBUG: Error del servidor WS:", message.mensaje);
                    setServerResponseMessage(`Error del Servidor: ${message.mensaje}`);
                    break;
                default:
                    console.log("DEBUG: Tipo de mensaje WS desconocido:", message.tipo);
            }
        } catch (error) {
            console.error("DEBUG: Error procesando mensaje WS:", error, "Raw data:", event.data);
            setServerResponseMessage("Error al procesar mensaje del servidor.");
        }
    }, [subscribedEvents, rutasArchivosSubidos]); // rutasArchivosSubidos es dependencia

    useEffect(() => {
        // ... (lógica de conexión WebSocket sin cambios)
        setServerResponseMessage("Intentando conectar a ws://localhost:8765...");
        const wsInstance = new WebSocket("ws://localhost:8765");
        ws.current = wsInstance;
        wsInstance.onopen = () => { setIsConnected(true); setServerResponseMessage("Conectado al Servidor WebSocket."); sendMessage({ tipo: "listar_eventos" }); };
        wsInstance.onclose = (event) => { setIsConnected(false); if (event.wasClean) { setServerResponseMessage(`Desconectado del Servidor WebSocket (código: ${event.code}).`); } else { setServerResponseMessage(`Conexión perdida con el Servidor WebSocket (código: ${event.code}). Verifique que el servidor esté corriendo.`); } };
        wsInstance.onerror = (error) => { console.error("DEBUG: Error en WebSocket:", error); setIsConnected(false); setServerResponseMessage("Error en la conexión WebSocket. Asegúrate de que el servidor Python esté ejecutándose."); };
        return () => { if (ws.current) { ws.current.close(); } };
    }, []);

    useEffect(() => {
        if (ws.current) { ws.current.onmessage = handleWsMessage; }
    }, [ws.current, handleWsMessage]);

    const handleSubscribe = (eventName) => sendMessage({ tipo: "suscribir", evento: eventName });
    const handleUnsubscribe = (eventName) => sendMessage({ tipo: "desuscribir", evento: eventName });
    
    const onFileChange = async (e) => {
        console.log("DEBUG: onFileChange iniciado.");
        const files = e.target.files;
    
        if (!files || files.length === 0) {
            console.log("DEBUG: No se seleccionaron archivos en el input.");
            // No cambiamos rutasArchivosSubidos si no se seleccionó nada,
            // para no borrar una selección previa si el usuario cancela el diálogo.
            return;
        }
        console.log(`DEBUG: ${files.length} archivo(s) seleccionados en el input.`);
    
        setCsvFilasEnProgreso([]);
        setProcesamientoCsvTerminado(false);
        setShowCsvTable(false);
        
        const newUploadedFilePaths = [];
        // let currentFileNamesAggregated = ""; // Ya no lo usaremos para el estado principal
    
        setServerResponseMessage(`Iniciando subida de ${files.length} archivo(s)...`);
    
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`DEBUG: Procesando archivo seleccionado #${i + 1}: ${file.name}, Tipo: ${file.type}, Tamaño: ${file.size}`);
    
            if (!file.name.toLowerCase().endsWith(".txt")) {
                console.warn(`DEBUG: Archivo '${file.name}' omitido porque no es .txt.`);
                alert(`El archivo '${file.name}' no es .txt y será omitido.`);
                continue; 
            }
    
            // currentFileNamesAggregated += (currentFileNamesAggregated ? ", " : "") + file.name; // No necesario para el estado
            const formData = new FormData();
            formData.append('txtfile', file); 
            const uploadUrl = 'http://localhost:3001/upload-txt';
            console.log(`DEBUG: Intentando subir '${file.name}' a ${uploadUrl}`);
    
            try {
                const response = await fetch(uploadUrl, { method: 'POST', body: formData });
                console.log(`DEBUG: Respuesta HTTP recibida para '${file.name}'. Status: ${response.status}`);
                const responseText = await response.text();
                console.log(`DEBUG: Texto de respuesta del servidor para '${file.name}':`, responseText);

                if (!response.ok) {
                    console.error(`DEBUG: Error HTTP ${response.status} subiendo ${file.name}. Respuesta: ${responseText}`);
                    throw new Error(`Error HTTP ${response.status} subiendo ${file.name}: ${responseText || response.statusText}`);
                }
                
                const data = JSON.parse(responseText);
                console.log(`DEBUG: Datos JSON parseados de la respuesta para '${file.name}':`, data);

                if (data.success && data.filePath && typeof data.filePath === 'string') {
                    newUploadedFilePaths.push(data.filePath);
                    console.log(`DEBUG: Archivo '${file.name}' subido exitosamente. Ruta: ${data.filePath}`);
                } else {
                    console.error(`DEBUG: Respuesta de subida inválida para '${file.name}'. 'success' no es true o 'filePath' falta. Data:`, data);
                    throw new Error(data.message || `Respuesta de subida inválida del servidor HTTP para ${file.name}.`);
                }
            } catch (error) {
                console.error(`DEBUG: CATCH - Error durante la subida o procesamiento de respuesta para '${file.name}':`, error.message);
                setServerResponseMessage(`Error al subir ${file.name}: ${error.message}. Revisa la consola del navegador y del servidor Node.js.`);
            }
        }
        
        console.log(`DEBUG: Finalizado el bucle de subida. ${newUploadedFilePaths.length} archivos subidos exitosamente en esta tanda.`);
    
        if (newUploadedFilePaths.length > 0) {
            // Reemplaza la lista anterior de archivos con el nuevo lote subido.
            setRutasArchivosSubidos(newUploadedFilePaths);
            setServerResponseMessage(`Subida completada. ${newUploadedFilePaths.length} archivo(s) listos en servidor.`);
            console.log("DEBUG: Rutas de archivos actualizadas en el estado:", newUploadedFilePaths);
        } else {
            // Si NINGÚN archivo de la selección actual se pudo subir, mantenemos las rutas anteriores (si las había).
            // O, si se prefiere, se puede limpiar: setRutasArchivosSubidos([]);
            // Por ahora, si la tanda falla completamente, no alteramos las rutas previas.
            // Si antes había archivos y esta tanda falla, el usuario verá los anteriores.
            // Si no había nada antes y esta tanda falla, rutasArchivosSubidos seguirá vacío.
            console.warn("DEBUG: newUploadedFilePaths está vacío después de intentar subir los archivos seleccionados.");
            if (rutasArchivosSubidos.length === 0) { // Solo muestra el mensaje si no había nada antes.
                 setServerResponseMessage("No se pudo subir ningún archivo .txt válido de la selección actual.");
            }
        }
        
        if (e.target) {
            e.target.value = null;
            console.log("DEBUG: Input de archivo reseteado.");
        }
        console.log("DEBUG: onFileChange finalizado.");
    };

    // NUEVA FUNCIÓN para quitar un archivo de la lista
    const handleRemoveFile = (filePathToRemove) => {
        console.log("DEBUG: Intentando quitar archivo:", filePathToRemove);
        setRutasArchivosSubidos(prevPaths => {
            const newPaths = prevPaths.filter(path => path !== filePathToRemove);
            console.log("DEBUG: Nuevas rutas después de quitar:", newPaths);
            if (newPaths.length === 0) {
                setServerResponseMessage("Todos los archivos seleccionados han sido quitados.");
            }
            return newPaths;
        });
    };

    const handleSendServerConfig = () => {
        // ... (sin cambios)
        if (!optionType) { alert("Selecciona un modo de concurrencia (Threads o Processes)."); return; }
        const count = parseInt(optionCount, 10);
        if (isNaN(count) || count < 1) { alert(`Ingresa un número válido de ${optionType === "thread" ? "Threads" : "Processes"}`); return; }
        sendMessage({ tipo: "configurar_threads_cliente", concurrency_mode: optionType, threads: count, });
        setServerResponseMessage(`Configuración (${count} ${optionType === "thread" ? "Threads" : "Processes"}) enviada.`);
    };

    const simulate = () => {
        // ... (sin cambios)
        const at = arrivalInput.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
        const bt = burstInput.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
        if (at.length !== bt.length || at.length === 0) { alert("Llegada/Ráfaga inválidos."); setResults({ solvedProcessesInfo: [], ganttChartInfo: [] }); return; }
        let pr = Array(at.length).fill(0);
        if (["NPP", "PP"].includes(algorithm)) {
            pr = priorityInput.trim().split(/\s+/).map(Number).filter(n => !isNaN(n));
            if (pr.length !== at.length) { alert("Prioridades no coinciden."); setResults({ solvedProcessesInfo: [], ganttChartInfo: [] }); return; }
        }
        const tq = Number(timeQuantum);
        if (algorithm === "RR" && (isNaN(tq) || tq < 1)) { alert("Quantum inválido."); setResults({ solvedProcessesInfo: [], ganttChartInfo: [] }); return; }
        setResults(solve(algorithm, at, bt, tq || 0, pr));
        setServerResponseMessage("Simulación local de scheduling completada.");
    };

    const descargarCsvStream = () => {
        // ... (sin cambios)
        if (csvFilasEnProgreso.length === 0) { setServerResponseMessage("No hay datos CSV para descargar."); return; }
        try {
            const encabezados = Object.keys(csvFilasEnProgreso[0] || {});
            if (encabezados.length === 0) { setServerResponseMessage("No se pudieron determinar los encabezados."); return; }
            const escapeCsvCell = (cellData) => { const stringVal = String(cellData ?? ''); if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) { return `"${stringVal.replace(/"/g, '""')}"`; } return stringVal; };
            let csvContenido = encabezados.map(escapeCsvCell).join(",") + "\n";
            csvFilasEnProgreso.forEach(fila => { csvContenido += encabezados.map(enc => escapeCsvCell(fila[enc])).join(",") + "\n"; });
            const blob = new Blob([csvContenido], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `datos_procesados_servidor.csv`);
            document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
            setServerResponseMessage("Archivo CSV descargado.");
        } catch (error) { console.error("DEBUG: Error al descargar CSV:", error); setServerResponseMessage("Error al generar/descargar CSV."); }
    };

    const { solvedProcessesInfo, ganttChartInfo } = results;
    const avgTAT = solvedProcessesInfo.length ? solvedProcessesInfo.reduce((s, r) => s + r.tat, 0) / solvedProcessesInfo.length : 0;
    const avgWT = solvedProcessesInfo.length ? solvedProcessesInfo.reduce((s, r) => s + r.wat, 0) / solvedProcessesInfo.length : 0;

    const GanttChart = () => {
        // ... (sin cambios)
        if (!ganttChartInfo || ganttChartInfo.length === 0 || typeof ganttChartInfo[0].start === 'undefined') {
             return null; 
        }
        const offset = ganttChartInfo[0].start;
        const stops = ganttChartInfo.map((g) => g.stop);
        const maxStop = Math.max(...stops, offset); 
        const totalDuration = maxStop - offset;
        const width = 800; 
        const scale = totalDuration > 0 ? width / totalDuration : 0; 
        const times = [...new Set([offset, ...stops])].sort((a, b) => a - b);

        return (
            <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>Diagrama de Gantt (Simulación Local)</Typography>
                <CardContent sx={{ overflowX: "auto", p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <Box sx={{ position: "relative", width: "100%", minWidth: width, height: 72, backgroundColor: 'grey.100' }}>
                        {ganttChartInfo.map((seg, i) => {
                            const colorIndex = typeof seg.jobId === 'number' ? seg.jobId % COLORS.length : i % COLORS.length;
                            return (
                                <React.Fragment key={`seg-${i}`}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.max(0, seg.stop - seg.start) * scale}px` }}
                                        transition={{ duration: 0.4, delay: i * 0.1 }}
                                        style={{
                                            position: "absolute", left: `${Math.max(0, seg.start - offset) * scale}px`,
                                            height: 36, background: COLORS[colorIndex], color: "#fff", display: "flex",
                                            alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600,
                                            overflow: 'hidden', whiteSpace: 'nowrap', boxSizing: 'border-box',
                                            borderRight: '1px solid rgba(0,0,0,0.1)'
                                        }}
                                        title={`Proceso ${seg.job}: ${seg.start} - ${seg.stop}`}
                                    >
                                        {(seg.stop - seg.start) * scale > 20 && seg.job}
                                    </motion.div>
                                    {i < ganttChartInfo.length - 1 && ganttChartInfo[i + 1].start > seg.stop && (
                                        <Box sx={{ position: "absolute", left: `${(seg.stop - offset) * scale}px`, width: `${(ganttChartInfo[i + 1].start - seg.stop) * scale}px`, height: 36, bgcolor: "grey.300", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontStyle: "italic", color: "grey.700", borderRight: '1px solid rgba(0,0,0,0.1)' }}>
                                            idle
                                        </Box>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {times.map((t) => (
                             <Box key={`time-${t}`} sx={{ position: 'absolute', top: 38, left: `${(t - offset) * scale}px`, transform: 'translateX(-50%)' }}>
                                <Box sx={{height: '5px', width: '1px', bgcolor: 'text.secondary', mx: 'auto'}} />
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>{t}</Typography>
                            </Box>
                        ))}
                    </Box>
                </CardContent>
            </Box>
        );
    };

    return (
        <Container maxWidth="lg" sx={{ py: 3, fontFamily: 'Roboto, sans-serif' }}>
            <Typography variant="h4" component="h1" gutterBottom align="center" sx={{ mb: 3, fontWeight: 'bold', color: 'primary.main' }}>
                Planificador de Procesos y Cliente CSV Stream
            </Typography>

            <Card sx={{ mb: 3, boxShadow: 3 }}>
                <CardHeader title="Estado de Conexión WebSocket" sx={{ bgcolor: 'grey.200' }} />
                <CardContent>
                    <Typography variant="h6" color={isConnected ? "success.main" : "error.main"} gutterBottom sx={{ fontWeight: 'medium' }}>
                        {isConnected ? "CONECTADO" : "DESCONECTADO"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">{serverResponseMessage}</Typography>
                </CardContent>
            </Card>

            <Card sx={{ mb: 3, boxShadow: 3 }}>
                <CardHeader title="Simulación de Planificador (Local)" sx={{ bgcolor: 'grey.200' }} />
                <CardContent>
                    <Stack spacing={2.5}>
                        <FormControl size="small" fullWidth>
                            <InputLabel id="algo-label-local">Algoritmo de Planificación</InputLabel>
                            <Select labelId="algo-label-local" label="Algoritmo de Planificación" value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} >
                                {algorithmOptions.map((opt) => ( <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem> ))}
                            </Select>
                        </FormControl>
                        {algorithm === "RR" && ( <TextField label="Quantum (Round Robin)" type="number" size="small" fullWidth inputProps={{ min: 1 }} value={timeQuantum} onChange={(e) => setTimeQuantum(e.target.value)} /> )}
                        <TextField label="Tiempos de Llegada (separados por espacio)" placeholder="Ej: 0 2 4" fullWidth value={arrivalInput} onChange={(e) => setArrivalInput(e.target.value)} size="small" />
                        <TextField label="Tiempos de Ráfaga (separados por espacio)" placeholder="Ej: 5 3 1" fullWidth value={burstInput} onChange={(e) => setBurstInput(e.target.value)} size="small" />
                        {["NPP", "PP"].includes(algorithm) && ( <TextField label="Prioridades (algoritmos de Prioridad)" placeholder="Ej: 2 1 3 (menor es más prioritario)" fullWidth value={priorityInput} onChange={(e) => setPriorityInput(e.target.value)} size="small" /> )}
                        <Button variant="contained" color="primary" onClick={simulate} size="large">Simular Localmente</Button>
                    </Stack>
                </CardContent>
            </Card>

            {solvedProcessesInfo.length > 0 && (
                 <Card sx={{ mb: 3, mx: "auto", maxWidth: 960 }}>
                    <CardHeader title="Resultados Simulación Local" />
                    <CardContent>
                        <Table size="small" aria-label="tabla de resultados locales">
                            <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 'bold' } }}>
                                    {["Proceso", "Arrival", "Burst", "Priority", "Finish", "Turnaround", "Waiting"].map((h) => (
                                        <TableCell key={h} align={h === "Proceso" ? "left" : "center"}>{h}</TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {solvedProcessesInfo.map((row) => (
                                    <TableRow key={row.job} hover>
                                        <TableCell component="th" scope="row">{row.job}</TableCell>
                                        <TableCell align="center">{row.at}</TableCell>
                                        <TableCell align="center">{row.bt}</TableCell>
                                        <TableCell align="center">{["NPP", "PP"].includes(algorithm) ? row.pr : '-'}</TableCell>
                                        <TableCell align="center">{row.ft}</TableCell>
                                        <TableCell align="center">{row.tat}</TableCell>
                                        <TableCell align="center">{row.wat}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        <Box sx={{ mt: 2, mb: 2 }}>
                            <Typography variant="subtitle1">Promedio Turnaround Time: {avgTAT.toFixed(2)}</Typography>
                            <Typography variant="subtitle1">Promedio Waiting Time: {avgWT.toFixed(2)}</Typography>
                        </Box>
                        <GanttChart />
                    </CardContent>
                </Card>
            )}

            <Card sx={{ mb: 3, boxShadow: 3 }}>
                <CardHeader title="Suscripción a Eventos del Servidor" sx={{ bgcolor: 'grey.200' }} />
                <CardContent>
                     <Typography variant="h6" gutterBottom>Eventos Disponibles:</Typography>
                    {isConnected && Object.keys(availableEvents).length > 0 ? (
                        <List dense sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid #ddd', borderRadius: 1, p:1 }}>
                            {Object.entries(availableEvents).map(([evName, evDesc]) => ( <ListItem key={evName} divider secondaryAction={ subscribedEvents.has(evName) ? (<Button size="small" variant="outlined" color="error" onClick={() => handleUnsubscribe(evName)} disabled={!isConnected}>Desuscribir</Button>) : (<Button size="small" variant="contained" color="primary" onClick={() => handleSubscribe(evName)} disabled={!isConnected}>Suscribir</Button>) } sx={{ '&:hover': { bgcolor: 'action.hover' } }} > <ListItemText primary={evName} secondary={evDesc || 'Evento del servidor'} /> </ListItem> ))}
                        </List>
                    ) : ( <Typography variant="body2" color="text.secondary"> {isConnected ? "No hay eventos definidos o actualizando..." : "Conéctate para ver eventos."} </Typography> )}
                    <Typography variant="h6" sx={{ mt: 2.5 }} gutterBottom>Suscritos Actualmente:</Typography>
                    {subscribedEvents.size > 0 ? ( <List dense> {Array.from(subscribedEvents).map(ev => <ListItemText primary={`- ${ev}`} key={ev} />)} </List> ) : ( <Typography variant="body2" color="text.secondary">Ninguno.</Typography> )}
                </CardContent>
            </Card>

            <Card sx={{ mb: 3, boxShadow: 3 }}>
                <CardHeader title="Archivo(s) TXT para Procesamiento en Servidor" sx={{ bgcolor: 'grey.200' }} />
                <CardContent>
                    <Stack direction="column" spacing={1.5} alignItems="flex-start">
                        <input type="file" accept=".txt" hidden ref={fileRef} onChange={onFileChange} id="file-upload-input" multiple />
                        <Button component="label" htmlFor="file-upload-input" variant="outlined" color="primary" disabled={!isConnected} size="large"> Seleccionar Archivo(s) .TXT </Button>
                    </Stack>

                    {/* NUEVA SECCIÓN para mostrar archivos seleccionados y permitir quitarlos */}
                    {rutasArchivosSubidos.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle1" gutterBottom>
                                Archivos en el lote actual ({rutasArchivosSubidos.length}):
                            </Typography>
                            <List dense component={Paper} sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid #ddd', borderRadius: 1, p:0.5 }}>
                                {rutasArchivosSubidos.map((filePath, index) => (
                                    <ListItem
                                        key={index}
                                        divider
                                        secondaryAction={
                                            <IconButton 
                                                edge="end" 
                                                aria-label="delete" 
                                                size="small" 
                                                onClick={() => handleRemoveFile(filePath)}
                                                title="Quitar archivo"
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        }
                                        sx={{ '&:hover': { bgcolor: 'action.hover' }, pr: 8 /* Espacio para el botón */ }}
                                    >
                                        <ListItemText 
                                            primary={filePath.split(/[\\/]/).pop()} // Muestra solo el nombre del archivo
                                            secondary={index + 1} // Número de archivo
                                            primaryTypographyProps={{ sx: { wordBreak: 'break-all'}}}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}
                    {rutasArchivosSubidos.length === 0 && (
                         <Typography variant="body1" sx={{ mt:1 }}>
                            Ningún archivo seleccionado. Si se dispara un evento, se procesarán todos los archivos por defecto en el servidor.
                         </Typography>
                    )}
                     <Typography variant="caption" display="block" sx={{ mt: 1.5, color: 'text.secondary' }}>
                        * La subida se realiza a un servidor HTTP auxiliar. La selección de archivos define el lote a procesar.
                        Si no hay archivos seleccionados, el servidor procesará un conjunto por defecto.
                    </Typography>
                </CardContent>
            </Card>

            <Card sx={{ mb: 3, boxShadow: 3 }}>
                <CardHeader title="Configuración de Concurrencia (para Servidor WebSocket)" sx={{ bgcolor: 'grey.200' }} />
                <CardContent>
                     <FormControl component="fieldset" size="small" fullWidth sx={{ mb: 2 }}>
                        <FormLabel component="legend" sx={{ mb: 1, fontWeight: 'medium' }}>Modo de Concurrencia en Servidor</FormLabel>
                        <RadioGroup row value={optionType} onChange={(e) => setOptionType(e.target.value)} > <FormControlLabel value="thread" control={<Radio />} label="Threads" /> <FormControlLabel value="process" control={<Radio />} label="Processes (Forks)" /> </RadioGroup>
                    </FormControl>
                    <TextField sx={{ mb: 2 }} label={`Número de ${optionType === "thread" ? "Threads" : "Processes"}`} type="number" size="small" fullWidth inputProps={{ min: 1 }} value={optionCount} onChange={(e) => setOptionCount(e.target.value)} />
                    <Button variant="contained" color="primary" onClick={handleSendServerConfig} fullWidth disabled={!isConnected} size="large"> Aplicar Configuración al Servidor </Button>
                </CardContent>
            </Card>
            
             {showCsvTable && ( 
                 <Card sx={{ mb: 3, boxShadow: 3 }}>
                    <CardHeader title="Datos CSV Generados por el Servidor (Stream)" sx={{ bgcolor: 'info.light', color: 'info.contrastText' }} />
                    <CardContent>
                        {csvFilasEnProgreso.length > 0 ? (
                            <>
                                <Typography variant="caption" display="block" gutterBottom> {procesamientoCsvTerminado ? `Procesamiento completado. Total filas: ${csvFilasEnProgreso.length}` : `Recibiendo datos... Filas: ${csvFilasEnProgreso.length}`} </Typography>
                                <TableContainer component={Paper} sx={{ maxHeight: 450, border: '1px solid #e0e0e0' }}>
                                    <Table size="small" stickyHeader aria-label="tabla csv generado">
                                        <TableHead>
                                            <TableRow sx={{ '& th': { fontWeight: 'bold', bgcolor: 'grey.100' } }}>
                                                {Object.keys(csvFilasEnProgreso[0]).map(key => ( <TableCell key={key} sx={{ textTransform: 'capitalize' }}> {key.replace(/_/g, ' ')} </TableCell> ))}
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {csvFilasEnProgreso.map((fila, index) => ( <TableRow key={index} hover sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}> {Object.values(fila).map((valor, idx) => ( <TableCell key={idx}>{String(valor ?? '')}</TableCell> ))} </TableRow> ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                {procesamientoCsvTerminado && ( <Button onClick={descargarCsvStream} sx={{ mt: 2 }} variant="contained" color="success" disabled={csvFilasEnProgreso.length === 0 || !isConnected} size="large"> Descargar CSV Completo </Button> )}
                            </>
                        ) : ( <Typography variant="body1" color="text.secondary"> {isConnected ? (procesamientoCsvTerminado ? "Procesamiento completado. No se generaron datos." : "Esperando datos del servidor...") : "Conéctate para ver datos."} </Typography> )}
                         {!procesamientoCsvTerminado && csvFilasEnProgreso.length > 0 && ( <Typography variant="caption" sx={{display: 'block', mt: 1, fontStyle: 'italic'}}> Actualizando tabla en tiempo real... </Typography> )}
                    </CardContent>
                </Card>
            )}
             {!showCsvTable && (
                 <Card sx={{ mb: 3, boxShadow: 3 }}>
                    <CardHeader title="Datos CSV Generados por el Servidor" sx={{ bgcolor: 'grey.200' }} />
                     <CardContent> <Typography variant="body1" color="text.secondary"> {isConnected ? "Los datos procesados aparecerán aquí al activar un evento suscrito." : "Conéctate, sube archivos y suscríbete a un evento."} </Typography> </CardContent>
                 </Card>
             )}
        </Container>
    );
}