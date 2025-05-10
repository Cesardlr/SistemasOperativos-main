import asyncio
import websockets
import json
import logging
import os
# import time # No se usa directamente, pero podría ser útil para futuras extensiones
import subprocess # Ya lo estás usando
import sys # Útil para obtener la ruta del ejecutable de Python

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

CLIENTS = {} # Almacena websocket: {"id": client_id_str}
EVENTS = {} 
SUBSCRIPTIONS = {} # Almacena evento: {websocket1, websocket2}
# Modificado para incluir concurrency_mode por defecto
CLIENT_CONFIGS = {} # client_id_str: {"threads": int, "concurrency_mode": str}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPT_SERVIDOR_PY = os.path.join(BASE_DIR, "servidor.py")
TEXT_FILES_DIR = os.path.join(os.path.dirname(BASE_DIR), "english_text_files")


def get_client_id_from_websocket(websocket):
    """Intenta obtener el ID del cliente desde el diccionario CLIENTS."""
    client_data = CLIENTS.get(websocket)
    if client_data:
        return client_data.get("id", str(id(websocket))) # Fallback al id del objeto si no está el 'id'
    return str(id(websocket)) # Fallback si el websocket no está en CLIENTS (raro aquí)

async def enviar_mensaje(websocket, tipo_mensaje, data=None, mensaje_texto=None):
    payload = {"tipo": tipo_mensaje}
    if data:
        payload.update(data)
    if mensaje_texto:
        payload["mensaje"] = mensaje_texto
    
    # Obtener client_id para logging de forma más directa si es posible
    client_id_for_log = get_client_id_from_websocket(websocket)

    try:
        # No es necesario chequear websocket.open; send() lanzará excepción si está cerrado.
        await websocket.send(json.dumps(payload))
    except websockets.exceptions.ConnectionClosed:
        # El cliente ya se desconectó, CLIENTS[websocket] podría no existir si la limpieza ya ocurrió.
        logging.warning(
            f"Intento de envío a conexión WS ya cerrada para cliente {client_id_for_log} ({websocket.remote_address}). Tipo: {tipo_mensaje}"
        )
    except Exception as e:
        logging.error(
            f"Error enviando mensaje por WS a {client_id_for_log} ({websocket.remote_address}): {e}. Tipo: {tipo_mensaje}"
        )

async def broadcast_mensaje(tipo_mensaje, data=None, mensaje_texto=None):
    if CLIENTS:
        # Copiamos las keys porque CLIENTS podría modificarse durante la iteración si un cliente se desconecta
        clients_actuales = list(CLIENTS.keys())
        logging.info(f"Broadcasting '{tipo_mensaje}' a {len(clients_actuales)} clientes.")
        # Creamos tareas para enviar mensajes a todos los clientes concurrentemente
        # return_exceptions=True para que un error en un envío no detenga los demás
        tasks = [
            enviar_mensaje(client, tipo_mensaje, data, mensaje_texto)
            for client in clients_actuales
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

def get_client_id_str(websocket):
    """Genera un ID de cliente basado en el id del objeto websocket."""
    return str(id(websocket))

async def procesar_archivos_via_script(
    websocket_cliente,
    id_cliente_ws_str,
    lista_rutas_archivos_a_procesar,
    directorio_default_si_lista_vacia,
    num_workers,
    concurrency_mode,
):
    python_executable = sys.executable  # Obtiene la ruta del intérprete de Python actual
    comando_python = [python_executable, "-u", SCRIPT_SERVIDOR_PY]
    comando_python.extend(["--client-id", id_cliente_ws_str])
    comando_python.extend(["--concurrency-mode", concurrency_mode])

    if num_workers is not None and num_workers > 0:
        comando_python.extend(["--workers", str(num_workers)])

    if lista_rutas_archivos_a_procesar:
        for ruta_abs_archivo in lista_rutas_archivos_a_procesar:
            comando_python.extend(["--input-file", ruta_abs_archivo])
        logging.info(
            f"Cliente {id_cliente_ws_str} procesará {len(lista_rutas_archivos_a_procesar)} archivo(s) "
            f"especificado(s) con modo {concurrency_mode} y {num_workers} worker(s)."
        )
    elif directorio_default_si_lista_vacia:
        comando_python.extend(["--default-input-dir", directorio_default_si_lista_vacia])
        logging.info(
            f"Cliente {id_cliente_ws_str} procesará archivos del dir por defecto: {directorio_default_si_lista_vacia} "
            f"con modo {concurrency_mode} y {num_workers} worker(s)."
        )
    else:
        await enviar_mensaje(
            websocket_cliente,
            "error_servidor",
            mensaje_texto="No se especificaron archivos para procesar ni un directorio por defecto.",
        )
        return

    logging.info(f"Ejecutando para cliente {id_cliente_ws_str}: {' '.join(comando_python)}")
    script_completed_gracefully = False
    
    try:
        proceso = await asyncio.create_subprocess_exec(
            *comando_python,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        if proceso.stdout:
            async for linea_bytes in proceso.stdout:
                linea = linea_bytes.decode("utf-8", errors="ignore").strip()
                if not linea:
                    continue
                logging.debug(f"STDOUT (servidor.py para {id_cliente_ws_str}): {linea}")
                try:
                    mensaje_stdout = json.loads(linea)
                    msg_type_from_script = mensaje_stdout.get("type")
                    
                    if mensaje_stdout.get("client_id") != id_cliente_ws_str:
                        logging.warning(
                            f"Mensaje STDOUT de script para client_id incorrecto: "
                            f"{mensaje_stdout.get('client_id')}, esperado {id_cliente_ws_str}. Ignorando."
                        )
                        continue

                    if msg_type_from_script == "csv_data_row" and "data" in mensaje_stdout:
                        await enviar_mensaje(
                            websocket_cliente,
                            "csv_actualizacion_fila",
                            {"fila_csv": mensaje_stdout["data"]},
                        )
                    elif msg_type_from_script == "progress_message" and "message" in mensaje_stdout:
                        await enviar_mensaje(
                            websocket_cliente,
                            "progreso_procesamiento_info",
                            mensaje_texto=mensaje_stdout["message"],
                        )
                    elif msg_type_from_script == "processing_complete":
                        await enviar_mensaje(
                            websocket_cliente,
                            "procesamiento_csv_terminado",
                            data=mensaje_stdout.get("summary", {"status": "completado desde script"}),
                        )
                        logging.info(
                            f"Procesamiento de CSV (reportado por script) completado para cliente {id_cliente_ws_str}."
                        )
                        script_completed_gracefully = True
                except json.JSONDecodeError:
                    logging.info(f"STDOUT no JSON (servidor.py para {id_cliente_ws_str}): {linea}")
                except Exception as e_json:
                    logging.error(f"Error procesando stdout JSON de servidor.py: {e_json} - Linea: {linea}")
        
        await proceso.wait()
        
        stderr_final_bytes = b""
        if proceso.stderr:
            stderr_final_bytes = await proceso.stderr.read()

        stderr_decoded = stderr_final_bytes.decode("utf-8", errors="ignore").strip()
        if stderr_decoded:
            logging.warning(f"STDERR (servidor.py para {id_cliente_ws_str}):\n{stderr_decoded}")
            await enviar_mensaje(
                websocket_cliente,
                "progreso_procesamiento_info",
                mensaje_texto=f"Mensajes del script (stderr): {stderr_decoded[:300]}...",
            )

        if proceso.returncode != 0:
            logging.error(f"Script servidor.py falló para {id_cliente_ws_str}. Código: {proceso.returncode}")
            if not script_completed_gracefully:
                await enviar_mensaje(
                    websocket_cliente,
                    "error_servidor",
                    mensaje_texto=f"El script de procesamiento falló (código: {proceso.returncode}). Detalles en log del servidor.",
                )
                await enviar_mensaje(
                    websocket_cliente,
                    "procesamiento_csv_terminado",
                    data={"status": "fallido_script", "error_code": proceso.returncode},
                )
        elif not script_completed_gracefully:
            logging.warning(
                f"Script servidor.py terminó con código 0 para {id_cliente_ws_str} "
                f"pero no envió mensaje 'processing_complete'."
            )
            await enviar_mensaje(
                websocket_cliente,
                "procesamiento_csv_terminado",
                data={"status": "completado_inesperado"},
            )

    except FileNotFoundError:
        msg = f"Error: El script '{SCRIPT_SERVIDOR_PY}' no fue encontrado en la ruta esperada."
        logging.error(msg)
        await enviar_mensaje(websocket_cliente, "error_servidor", mensaje_texto=msg)
    except Exception as e:
        logging.exception(f"Excepción al ejecutar/monitorear servidor.py para {id_cliente_ws_str}: {e}")
        await enviar_mensaje(
            websocket_cliente,
            "error_servidor",
            mensaje_texto=f"Error crítico al manejar el script de procesamiento: {str(e)}",
        )

# Ya no es necesaria esta línea de depuración o es incorrecta si fue para el 'path'
# print("!!! INFO: Definiendo manejar_cliente con (websocket, path) !!!") 
async def manejar_cliente(websocket): 
    client_id_str = get_client_id_str(websocket)
    CLIENTS[websocket] = {"id": client_id_str, "ws": websocket} # Guardar también el objeto ws para referencia si es útil
    CLIENT_CONFIGS[client_id_str] = {"threads": 1, "concurrency_mode": "thread"} 
    logging.info(f"Cliente conectado: {client_id_str} ({websocket.remote_address})")

    try:
        await enviar_mensaje(websocket, "conexion_establecida", mensaje_texto="Conexión WebSocket establecida con el servidor.")
        await enviar_mensaje(websocket, "lista_eventos_actualizada", {"eventos": EVENTS})

        async for message_str in websocket:
            try:
                data = json.loads(message_str)
                logging.info(f"Recibido de {client_id_str}: {data}")
                tipo_mensaje = data.get("tipo")

                if tipo_mensaje == "listar_eventos":
                    await enviar_mensaje(websocket, "lista_eventos_actualizada", {"eventos": EVENTS})
                elif tipo_mensaje == "suscribir":
                    evento = data.get("evento")
                    if evento and evento in EVENTS:
                        if evento not in SUBSCRIPTIONS:
                            SUBSCRIPTIONS[evento] = set()
                        SUBSCRIPTIONS[evento].add(websocket)
                        await enviar_mensaje(
                            websocket,
                            "confirmacion_suscripcion",
                            {"evento": evento, "mensaje": f"Suscrito a {evento}"},
                        )
                    else:
                        await enviar_mensaje(
                            websocket,
                            "error_servidor",
                            mensaje_texto=f"No se puede suscribir. Evento '{evento}' no válido o no existe.",
                        )
                elif tipo_mensaje == "desuscribir":
                    evento = data.get("evento")
                    if evento and evento in SUBSCRIPTIONS and websocket in SUBSCRIPTIONS[evento]:
                        SUBSCRIPTIONS[evento].remove(websocket)
                        if not SUBSCRIPTIONS[evento]:
                            del SUBSCRIPTIONS[evento]
                        await enviar_mensaje(
                            websocket,
                            "confirmacion_desuscripcion",
                            {"evento": evento, "mensaje": f"Desuscrito de {evento}"},
                        )
                    else:
                        await enviar_mensaje(
                            websocket,
                            "error_servidor",
                            mensaje_texto=f"No se puede desuscribir del evento '{evento}'.",
                        )
                
                elif tipo_mensaje == "configurar_threads_cliente":
                    num_threads = data.get("threads")
                    # Usar el modo actual como default si no se provee uno nuevo
                    concurrency_mode = data.get("concurrency_mode", CLIENT_CONFIGS[client_id_str].get("concurrency_mode", "thread"))

                    if isinstance(num_threads, int) and num_threads > 0 and concurrency_mode in ["thread", "process"]:
                        CLIENT_CONFIGS[client_id_str]["threads"] = num_threads
                        CLIENT_CONFIGS[client_id_str]["concurrency_mode"] = concurrency_mode
                        logging.info(
                            f"Cliente {client_id_str} configuró concurrencia a: {num_threads} {concurrency_mode}(s)"
                        )
                        await enviar_mensaje(
                            websocket,
                            "confirmacion_config_threads",
                            {
                                "threads": num_threads,
                                "concurrency_mode": concurrency_mode,
                                "mensaje": f"Configuración ({num_threads} {concurrency_mode}s) confirmada.",
                            },
                        )
                    else:
                        await enviar_mensaje(
                            websocket,
                            "error_servidor",
                            mensaje_texto=f"Configuración inválida: Threads debe ser número >0, Modo debe ser 'thread' o 'process'.",
                        )
                
                elif tipo_mensaje == "solicitar_procesamiento_csv":
                    lista_rutas_cliente = data.get("rutas_archivos_subidos", [])
                    
                    client_specific_config = CLIENT_CONFIGS.get(client_id_str, {"threads": 1, "concurrency_mode": "thread"})
                    num_workers_cliente = client_specific_config.get("threads", 1)
                    concurrency_mode_cliente = client_specific_config.get("concurrency_mode", "thread")

                    logging.info(
                        f"Cliente {client_id_str} solicita procesamiento CSV. "
                        f"Archivos específicos: {len(lista_rutas_cliente) if lista_rutas_cliente else 'NO (usar default)'}. "
                        f"Workers: {num_workers_cliente}, Modo: {concurrency_mode_cliente}"
                    )
                    
                    await enviar_mensaje(
                        websocket,
                        "progreso_procesamiento_info",
                        mensaje_texto="Solicitud de procesamiento CSV recibida. Iniciando script...",
                    )

                    # Crear tarea para que el procesamiento del script no bloquee el manejador de mensajes
                    asyncio.create_task(
                        procesar_archivos_via_script(
                            websocket,
                            client_id_str,
                            lista_rutas_cliente,
                            TEXT_FILES_DIR if not lista_rutas_cliente else None,
                            num_workers_cliente,
                            concurrency_mode_cliente,
                        )
                    )
                
                else:
                    logging.warning(f"Tipo de mensaje desconocido de {client_id_str}: {tipo_mensaje}")
                    await enviar_mensaje(
                        websocket,
                        "error_servidor",
                        mensaje_texto=f"Tipo de mensaje '{tipo_mensaje}' no reconocido por el servidor.",
                    )

            except json.JSONDecodeError:
                logging.error(f"Error decodificando JSON de {client_id_str}: {message_str}")
                await enviar_mensaje(
                    websocket,
                    "error_servidor",
                    mensaje_texto="Error en el formato del mensaje (JSON inválido).",
                )
            except Exception as e:
                logging.exception(f"Error manejando mensaje de {client_id_str}: {e}")
                await enviar_mensaje(
                    websocket,
                    "error_servidor",
                    mensaje_texto=f"Error interno del servidor al procesar su solicitud: {str(e)}",
                )
    
    except websockets.exceptions.ConnectionClosed as e_conn_closed:
        logging.info(
            f"Cliente {client_id_str} desconectado ({e_conn_closed.code} "
            f"{e_conn_closed.reason if e_conn_closed.reason else ''})."
        )
    except Exception as e_outer:
        logging.exception(f"Excepción crítica en el handler del cliente {client_id_str}: {e_outer}")
        # Aquí ya no es necesario websocket.open, enviar_mensaje lo maneja
        await enviar_mensaje(
            websocket,
            "error_servidor",
            mensaje_texto=f"Error crítico del servidor al manejar su conexión: {str(e_outer)}",
        )
    finally:
        logging.info(f"Limpiando recursos para cliente {client_id_str}.")
        if websocket in CLIENTS:
            del CLIENTS[websocket]
        if client_id_str in CLIENT_CONFIGS:
            del CLIENT_CONFIGS[client_id_str]
        
        # Eliminar al cliente de todas las suscripciones a eventos
        for evento in list(SUBSCRIPTIONS.keys()): # Iterar sobre una copia de las keys
            if websocket in SUBSCRIPTIONS.get(evento, set()):
                SUBSCRIPTIONS[evento].remove(websocket)
                if not SUBSCRIPTIONS[evento]: # Si el set de suscriptores queda vacío
                    del SUBSCRIPTIONS[evento]
        logging.info(f"Cliente {client_id_str} completamente eliminado de listas y suscripciones.")

async def servidor_cli():
    loop = asyncio.get_running_loop()
    logging.info("CLI del servidor WS (CSV Stream) iniciada. Escribe 'help' para ver los comandos.")
    while True:
        try:
            cmd_full_str = await loop.run_in_executor(None, input, "Servidor Stream CSV> ")
            parts = cmd_full_str.strip().split()
            if not parts:
                continue
            cmd = parts[0].lower()
            args = parts[1:]

            if cmd == "help":
                print("  list_clients                      - Muestra clientes conectados y su config.")
                print("  list_events                       - Muestra eventos definidos y suscriptores.")
                print("  add_event <nombre> [desc]       - Añade un nuevo evento.")
                print("  remove_event <nombre>           - Elimina un evento.")
                print("  trigger <nombre_evento>         - Dispara un evento a suscriptores.")
                print("  exit                              - Cierra el servidor WebSocket.")
            elif cmd == "list_clients":
                if not CLIENTS:
                    print("No hay clientes conectados.")
                else:
                    print(f"Clientes conectados ({len(CLIENTS)}):")
                    for ws_obj, client_data in CLIENTS.items(): # Cambiado ws a ws_obj para claridad
                        cfg = CLIENT_CONFIGS.get(client_data["id"], {})
                        print(
                            f"  - ID: {client_data['id']} ({ws_obj.remote_address}), " # Mostrar remote_address
                            f"Config: {cfg.get('threads', 'N/A')} {cfg.get('concurrency_mode', 'N/A')}(s)"
                        )
            elif cmd == "list_events":
                if not EVENTS:
                    print("No hay eventos definidos.")
                else:
                    print("Eventos definidos:")
                    for name, desc in EVENTS.items():
                        subs_count = len(SUBSCRIPTIONS.get(name, set()))
                        print(f"  - '{name}': {desc} ({subs_count} suscriptores)")
            elif cmd == "add_event" and args:
                event_name = args[0]
                description = " ".join(args[1:]) if len(args) > 1 else f"Evento '{event_name}'"
                if event_name in EVENTS:
                    print(f"Error: El evento '{event_name}' ya existe.")
                else:
                    EVENTS[event_name] = description
                    print(f"Evento '{event_name}' ('{description}') añadido.")
                    await broadcast_mensaje("lista_eventos_actualizada", {"eventos": EVENTS})
            elif cmd == "remove_event" and args:
                event_name = args[0]
                if event_name in EVENTS:
                    del EVENTS[event_name]
                    if event_name in SUBSCRIPTIONS:
                        del SUBSCRIPTIONS[event_name] # Elimina todas las suscripciones para este evento
                    print(f"Evento '{event_name}' eliminado.")
                    await broadcast_mensaje("lista_eventos_actualizada", {"eventos": EVENTS})
                else:
                    print(f"Error: Evento '{event_name}' no encontrado.")
            elif cmd == "trigger" and args:
                event_name = args[0]
                if event_name in EVENTS:
                    subscribers_to_event = list(SUBSCRIPTIONS.get(event_name, set())) # Convertir a lista para evitar problemas de modificación concurrente
                    if subscribers_to_event:
                        logging.info(f"Disparando evento '{event_name}' a {len(subscribers_to_event)} suscriptores.")
                        # No es necesario 'if ws.open', enviar_mensaje lo maneja
                        trigger_tasks = [
                            enviar_mensaje(
                                ws,
                                "evento_disparado",
                                {"evento": event_name, "mensaje": f"Evento '{event_name}' disparado por el servidor"},
                            )
                            for ws in subscribers_to_event
                        ]
                        await asyncio.gather(*trigger_tasks, return_exceptions=True)
                    else:
                        print(f"Nadie suscrito al evento '{event_name}'.")
                else:
                    print(f"Error: Evento '{event_name}' no encontrado para disparar.")
            elif cmd == "exit":
                logging.info("Comando 'exit' recibido. Cerrando servidor...")
                # Para que el servidor principal se cierre, necesitamos cancelar esta tarea
                # o hacer que devuelva algo que main() pueda interpretar para salir.
                # Devolver True es una forma simple de señalar que el CLI quiere cerrar.
                return True 
            else:
                print("Comando desconocido. Escribe 'help'.")
        except (EOFError, KeyboardInterrupt):
            logging.info("Señal de interrupción (EOF o Ctrl+C) recibida en CLI. Cerrando servidor...")
            return True # También señalamos cierre aquí
        except Exception as e:
            logging.exception(f"Error en CLI del servidor: {e}")
            # Podríamos querer continuar el CLI a pesar de un error en un comando.
            # Si el error es grave, el logging.exception lo registrará.

async def main():
    if not os.path.isdir(TEXT_FILES_DIR):
        logging.warning(f"El directorio por defecto de archivos de texto '{TEXT_FILES_DIR}' no existe. Creándolo...")
        try:
            os.makedirs(TEXT_FILES_DIR, exist_ok=True)
        except OSError as e:
            logging.error(
                f"No se pudo crear el directorio por defecto '{TEXT_FILES_DIR}': {e}. "
                f"El procesamiento por defecto podría fallar."
            )

    # La función de manejo de cliente `manejar_cliente` es la correcta.
    server = await websockets.serve(manejar_cliente, "localhost", 8765)
    logging.info(
        f"Servidor WebSocket (CSV Stream) iniciado en ws://localhost:8765. "
        f"Directorio TXT por defecto: {TEXT_FILES_DIR}"
    )
    
    cli_task = asyncio.create_task(servidor_cli())

    try:
        # Esperar a que la tarea del CLI termine (por ejemplo, si devuelve True tras 'exit')
        await cli_task
    except asyncio.CancelledError:
        logging.info("Tarea CLI cancelada.") # Si se cancelara desde fuera
    finally:
        logging.info("Cerrando servidor WebSocket principal...")
        
        # Notificar a los clientes restantes
        clients_a_notificar = list(CLIENTS.keys()) # Copia para iteración segura
        if clients_a_notificar:
            payload_cierre = {"tipo": "servidor_desconectado", "mensaje": "El servidor se está cerrando."}
            msg_cierre_str = json.dumps(payload_cierre)
            
            cierre_tasks = []
            for client_ws in clients_a_notificar:
                # Usamos client.send() directamente aquí, no enviar_mensaje,
                # para tener control sobre el timeout y porque el formato es simple.
                # No es necesario 'if client.open', send() lanzará excepción si está cerrado.
                try:
                    # Usamos un timeout para no esperar indefinidamente a un cliente que no responde
                    task = asyncio.wait_for(client_ws.send(msg_cierre_str), timeout=2.0)
                    cierre_tasks.append(task)
                except websockets.exceptions.ConnectionClosed:
                     logging.warning(f"Al intentar notificar cierre, cliente {get_client_id_from_websocket(client_ws)} ({client_ws.remote_address}) ya estaba cerrado.")
                except Exception as e_send_close: # Otras excepciones al intentar enviar el wait_for
                    logging.warning(f"Error preparando mensaje de cierre para {get_client_id_from_websocket(client_ws)} ({client_ws.remote_address}): {e_send_close}")


            if cierre_tasks:
                results = await asyncio.gather(*cierre_tasks, return_exceptions=True)
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        # El cliente correspondiente es el de la lista original en la misma posición
                        # Pero es más robusto obtenerlo si la lista de tasks y clientes no se desalinea.
                        # Aquí, como falló un 'send', el cliente ya no nos importa tanto.
                        logging.warning(f"Error enviando mensaje de cierre a un cliente: {result}")
        
        server.close()
        await server.wait_closed()
        logging.info("Servidor WebSocket completamente detenido.")

if __name__ == "__main__":
    print(f"--- Iniciando script servidor_websockets.py (PID: {os.getpid()}) ---")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Programa principal interrumpido (Ctrl+C). Saliendo.")
    except Exception as e_global:
        logging.exception(f"Error global al iniciar o ejecutar el servidor: {e_global}")
        print(f"Error fatal al ejecutar el script: {e_global}")
    finally:
        logging.info("--- Script servidor_websockets.py finalizado ---")