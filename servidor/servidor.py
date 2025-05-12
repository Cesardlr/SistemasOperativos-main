# -- coding: utf-8 --
import os, re, argparse, time, json, glob, sys, traceback, threading
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed

# Configuración de la ruta del script y las variables globales
ROOT = os.path.dirname(os.path.abspath(__file__)) # Corregido _file_ a __file__
APELLIDOS_SE = ["Andersson", "Johansson", "Eriksson", "Nilsson", "Larsson", "Svensson", "Carlsson", "Persson", "Gustafsson", "Pettersson", "Jansson", "Olsson"]
NOMBRES_PERSONA = ["Conrad Reinell", "Annie Erickson", "Mary Livingston", "Erik Andersson", "Olof Jernberg"] + APELLIDOS_SE
PAISES = ["Sweden", "Norway", "Denmark", "Finland", "Germany", "Canada", "USA"]
DESTINOS = ["Chicago", "Minneapolis", "Moline", "Jamestown", "Rockford", "Seattle", "Worcester", "Gothenburg", "Stockholm"]
OCUPACIONES = ["farmer", "factory worker", "domestic servant", "carpenter", "blacksmith", "railroad worker", "lumberjack", "tailor", "mason", "fisherman", "miner", "teacher", "pastor"]
MODO_VIAJE = ["steamship", "ship", "boat", "railroad", "wagon", "horse", "stagecoach", "bicycle"]
PUERTOS = ["Ellis Island", "Halifax", "Quebec", "New York", "Liverpool"]
RAZONES_INM = ["work", "job", "opportunity", "poverty", "hunger", "famine"]
EVENTOS_HIST = ["World War I", "World War II", "Great Depression", "Prohibition", "Industrial Revolution", "Panic of 1873"]
IGLESIAS = ["Lutheran", "Baptist", "Methodist", "Quaker", "Augustana Evangelical Lutheran Church", "Swedish Mission Covenant Church"]
ESC_FIJO = ["Augustana College", "Northwestern College", "Sacred Heart School"]

# Aqui con build_pattern() se construyen los patrones regex para los nombres, ocupaciones, etc.
def build_pattern(words, *, plural=False, boundaries=True):
    esc = [re.escape(w) for w in words]
    pat = r"(?:%s)" % "|".join(esc)
    if plural: pat = f"{pat}s?"
    return rf"\b{pat}\b" if boundaries else pat

#grp0_or_1() es una función auxiliar para manejar grupos de regex
def grp0_or_1(m, grp):
    return m.group(grp) if (m and m.lastindex is not None and grp <= m.lastindex) else (m.group(0) if m else '')

# Definición de patrones regex para fechas, nombres, ocupaciones, etc.
REGEX_AÑO = r"(18[5-9]\d|19[0-2]\d)"
REGEX_YMD = rf"{REGEX_AÑO}[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])"
REGEX_LARGA = (rf"(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s)?"
               rf"(January|February|March|April|May|June|July|August|September|October|November|December)"
               rf"\s(0?[1-9]|[12]\d|3[01]),?\s{REGEX_AÑO}")
REGEX_FECHA = rf"(?:{REGEX_YMD}|{REGEX_LARGA}|{REGEX_AÑO})"
ALT_NOMBRES = build_pattern(NOMBRES_PERSONA, boundaries=False)
ALT_OCUPACIONES = build_pattern(OCUPACIONES, boundaries=False)
ALT_OCUP_PLURAL = build_pattern(OCUPACIONES, plural=True, boundaries=False)
pattern_name = rf"\b({ALT_NOMBRES})\b"
pattern_parent_name = rf"\b(?:father|mother|parents?)\b[^.\n]{{0,40}}?({ALT_NOMBRES})"
pattern_children_name = rf"\b(?:son|daughter|child|children)\b[^.\n]{{0,40}}?({ALT_NOMBRES})"
pattern_grand_name = rf"\b(?:grandson|granddaughter|grandchild|grandchildren)\b[^.\n]{{0,40}}?({ALT_NOMBRES})"
pattern_job_title = rf"\b(?:title|position|role|worked as|hired as)\b[^.\n]{{0,30}}?({ALT_OCUPACIONES}s?)"

try:
    PATRONES_DATA = [
        ("Name", pattern_name, 1), ("Date of Birth", rf"born[^0-9A-Za-z]{{0,40}}({REGEX_FECHA})", 1),
        ("Place of Birth", rf"born in\s+([A-Z][a-zA-Z\s]+(?:\s*,\s*[A-Z][a-zA-Z\s]*)?)", 1),
        ("Date of Interview", REGEX_FECHA, 0), ("Location of Interview", build_pattern(DESTINOS), 0),
        ("Parent's Names", pattern_parent_name, 1), ("Parent's Birthplace", build_pattern(PAISES + DESTINOS), 0),
        ("Parent's Occupation", rf"\b(?:father|mother|parents?)\b[^.\n]{{0,30}}?({ALT_OCUP_PLURAL})", 1),
        ("Siblings", r"\b(brother|sister|sibling)s?\b", 0),
        ("Spouse's Name", rf"\b(?:wife|husband|spouse)\b[^.\n]{{0,40}}?({ALT_NOMBRES})", 1),
        ("Children's Names", pattern_children_name, 1), ("Grandchildren's Names", pattern_grand_name, 1),
        ("Date of Immigration", REGEX_AÑO, 0), ("Country of Origin", build_pattern(PAISES), 0),
        ("Reason for Immigration", build_pattern(RAZONES_INM), 0), ("Mode of Travel", build_pattern(MODO_VIAJE), 0),
        ("Ports of Entry", build_pattern(PUERTOS), 0), ("Destinations", build_pattern(DESTINOS), 0),
        ("Occupation", build_pattern(OCUPACIONES, plural=True), 0),
        ("Employer", r"\b(?:University|College|Hospital|Company|Plant|Factory|Inc\.|Ltd\.)\b.*?(?=[\.,;]|$)", 0),
        ("Job Title", pattern_job_title, 1),
        ("Education Level", r"\b(first grade|high school|college|university|seminary|degree|diploma)\b", 0),
        ("Schools Attended", build_pattern(ESC_FIJO), 0),
        ("Year of Graduation", r"graduat(?:e|ed|ion)\w*\s*(?:in|from|of)?\s*(\d{{4}})", 1),
        ("Health Issues", build_pattern(["ulcer", "typhoid fever", "injury", "tuberculosis", "illness", "disease"]), 0),
        ("Medical Treatments", build_pattern(["operation", "surgery", "blood transfusion", "vaccination", "medication", "treatment"]), 0),
        ("Cause of Death", build_pattern(["heart attack", "cancer", "stroke", "accident", "influenza", "pneumonia", "old age"]), 0),
        ("Church Affiliation", build_pattern(IGLESIAS), 0),
        ("Community Involvement", build_pattern(EVENTOS_HIST + ["volunteer", "committee", "club"]), 0),
        ("Social Activities", build_pattern(["soccer", "ice hockey", "choir singing", "theater", "dance", "picnic", "festival"]), 0),
        ("Language Spoken", build_pattern(["English", "Swedish", "German", "Italian", "Norwegian", "Danish", "Finnish"]), 0),
        ("Cultural Practices", build_pattern(["Midsommar", "Lucia", "Jul", "Christmas", "Easter", "Thanksgiving"]), 0),
    ]
    PATRONES = [(col, re.compile(rx, re.IGNORECASE | re.UNICODE), grp) for col, rx, grp in PATRONES_DATA]
    # MODIFICADO: Eliminada "Error Info" de COLUMNAS_ORDENADAS
    COLUMNAS_ORDENADAS = [col for col, _, _ in PATRONES_DATA] + ["Processed File Name"]
except re.error as e:
    error_msg = f"Error fatal compilando Regex: {e}"
    print(json.dumps({"type": "script_error", "message": error_msg}), flush=True)
    print(f"SERVIDOR.PY CRITICAL: {error_msg}", file=sys.stderr, flush=True)
    sys.exit(1)
    
#do_actual_processing_for_file() aplica las regex al contenido del texto y actualiza fila_resultante_ref
#parametros: txt_content: contenido del archivo, fila_resultante_ref: diccionario de resultados
def do_actual_processing_for_file(txt_content: str, fila_resultante_ref: dict):
    """
    Aplica todas las regex al contenido del texto y actualiza fila_resultante_ref.
    Retorna True si se encontraron datos, False en caso contrario.
    """
    datos_encontrados_global = False
    for col, regex_compilada, grp_captura in PATRONES:
        try:
            matches = regex_compilada.finditer(txt_content)
            valores_encontrados_para_columna = set()
            for m in matches:
                valor_crudo = grp0_or_1(m, grp_captura)
                if valor_crudo: 
                    valor_limpio = valor_crudo.strip()
                    if valor_limpio:
                        valores_encontrados_para_columna.add(valor_limpio)
            
            if valores_encontrados_para_columna:
                fila_resultante_ref[col] = '; '.join(sorted(list(valores_encontrados_para_columna)))
                datos_encontrados_global = True
        except Exception as e_regex: # Simplificado, el error se maneja en el llamador principal
            # No imprimimos warning por cada regex para no saturar, la columna quedará "Not Mention"
            # print(f"DEBUG_SERVIDOR_PY: WARN: Regex para '{col}' falló: {e_regex}", file=sys.stderr, flush=True)
            pass 
        
    # quitar_local() elimina nombres de columnas específicas de otras columnas recibe los parametros
    # parametros: src_col: columna de origen, dst_col: columna de destino, fila_dict: diccionario de fila_resultante_ref
    def quitar_local(src_col, dst_col, fila_dict):
        val_src = fila_dict.get(src_col, 'Not Mention')
        val_dst = fila_dict.get(dst_col, 'Not Mention')
        if val_src != 'Not Mention' and val_dst != 'Not Mention':
            set_src = set(s.strip().lower() for s in val_src.split(';'))
            lista_dst_original = [v.strip() for v in val_dst.split(';')]
            nuevos_val = [v for v in lista_dst_original if v.strip().lower() not in set_src]
            fila_dict[dst_col] = '; '.join(sorted(nuevos_val)) if nuevos_val else 'Not Mention'
    try:
        quitar_local("Name", "Parent's Names", fila_resultante_ref)
        quitar_local("Name", "Children's Names", fila_resultante_ref)
        quitar_local("Name", "Grandchildren's Names", fila_resultante_ref)
        quitar_local("Parent's Names", "Children's Names", fila_resultante_ref)
        quitar_local("Parent's Names", "Grandchildren's Names", fila_resultante_ref)
        if fila_resultante_ref.get("Occupation","").lower() == fila_resultante_ref.get("Job Title","").lower() and \
           fila_resultante_ref.get("Occupation") != 'Not Mention':
            fila_resultante_ref["Job Title"] = "Not Mention"
    except Exception as e_quitar:
            print(f"DEBUG_SERVIDOR_PY: WARN: Lógica 'quitar' falló: {e_quitar}", file=sys.stderr, flush=True) # El nombre del archivo se puede loguear en el llamador
    
    return datos_encontrados_global

# procesar_archivo_y_emitir_fila() procesa un archivo .txt y emite una fila de resultados
# parametros: path: ruta del archivo, client_id_stdout: ID del cliente, worker_visual_id: ID del worker visual, total_visual_workers: total de workers visuales
def procesar_archivo_y_emitir_fila(path: str, client_id_stdout: str, worker_visual_id: int, total_visual_workers: int, simulate_processing_delay_ms: int = 0):
    """
    Procesa UN archivo .txt (aplicando regex reales), e incluye información del "worker visual".
    Puede simular un retardo si simulate_processing_delay_ms > 0.
    """

    nombre_base_archivo = os.path.basename(path)
    # MODIFICADO: fila_resultante se inicializa sin "Error Info"
    fila_resultante = {col: 'Not Mention' for col in COLUMNAS_ORDENADAS}
    fila_resultante["Processed File Name"] = nombre_base_archivo
    
    # MODIFICADO: Variable local para almacenar el mensaje de error del archivo actual
    current_file_error_message = "None"

    try:
        with open(path, encoding='utf-8', errors='ignore') as fh:
            txt = fh.read()

        if not txt.strip():
            # MODIFICADO: Se actualiza la variable local en lugar de fila_resultante["Error Info"]
            current_file_error_message = "File is empty or whitespace only"
            # print(f"DEBUG_SERVIDOR_PY: Archivo '{nombre_base_archivo}' vacío.", file=sys.stderr, flush=True)
        else:
            # Siempre hacemos el procesamiento real de datos
            datos_encontrados = do_actual_processing_for_file(txt, fila_resultante)
            if not datos_encontrados:
                # print(f"DEBUG_SERVIDOR_PY: No se encontraron datos regex en '{nombre_base_archivo}'.", file=sys.stderr, flush=True)
                pass # Los campos ya son "Not Mention"

        if simulate_processing_delay_ms > 0:
            time.sleep(simulate_processing_delay_ms / 1000.0)

    except FileNotFoundError:
        # MODIFICADO: Se actualiza la variable local
        current_file_error_message = f"Archivo no encontrado: {path}"
    except IOError as e_io:
        # MODIFICADO: Se actualiza la variable local
        current_file_error_message = f"Error I/O leyendo {nombre_base_archivo}: {e_io}"
    except Exception as e_general:
        # MODIFICADO: Se actualiza la variable local
        current_file_error_message = f"Error inesperado procesando {nombre_base_archivo}: {type(e_general).__name__} - {e_general}" # Corregido _name_ a __name__
        print(f"DEBUG_SERVIDOR_PY: EXCEPCION en procesar_archivo_y_emitir_fila para '{nombre_base_archivo}': {e_general}\n{traceback.format_exc()}", file=sys.stderr, flush=True)

    # Emitir la fila
    # MODIFICADO: La condición para el mensaje de progreso usa current_file_error_message
    if current_file_error_message != "None" and current_file_error_message != "File is empty or whitespace only":
        print(json.dumps({"type": "progress_message", "client_id": client_id_stdout, "message": f"Error procesando {nombre_base_archivo}: {current_file_error_message}"}), flush=True)
    
    print(json.dumps({
        "type": "csv_data_row",
        "client_id": client_id_stdout,
        "data": fila_resultante # fila_resultante ya no tiene "Error Info"
    }), flush=True)
    # print(f"DEBUG_SERVIDOR_PY: Fila emitida para '{nombre_base_archivo}'.", file=sys.stderr, flush=True)

# main() es la función principal que maneja la lógica del script
def main():
    t0_script = time.perf_counter()
    parser = argparse.ArgumentParser(description="Procesa archivos .txt y emite datos como JSON.")
    parser.add_argument("--input-file", action="append", default=[], help="Ruta a un archivo .txt específico.")
    parser.add_argument("--default-input-dir", help="Directorio a procesar.")
    parser.add_argument("--concurrency-mode", choices=['thread', 'process', 'sequential_visual'], default='thread',
                        help="Modo: 'thread', 'process' (paralelismo real), 'sequential_visual' (secuencial en backend, simula N workers para GUI).")
    parser.add_argument("--workers", type=int, default=1, 
                        help="Número de workers. Para 'thread'/'process', son workers reales. Para 'sequential_visual', es el N° de workers a simular para la GUI.")
    parser.add_argument("--client-id", required=True, help="ID del cliente.")
    parser.add_argument("--simulate-delay-ms", type=int, default=0,
                        help="Si > 0, añade un retardo artificial (en ms) a cada procesamiento de archivo para simular carga.")

    args = parser.parse_args()
    client_id = args.client_id

    num_workers_visual_gui = args.workers
    
    msg_inicial_detalle = (
        f"Script 'servidor.py' para cliente {client_id}. "
        f"Modo Concurrencia Solicitado: {args.concurrency_mode}, "
        f"Workers (Visual GUI): {num_workers_visual_gui}, "
        f"Retardo Simulado/tarea: {args.simulate_delay_ms}ms"
    )
    print(json.dumps({"type": "progress_message", "client_id": client_id, "message": msg_inicial_detalle}), flush=True)
    print(f"DEBUG_SERVIDOR_PY: main() llamado. Args: {args}", file=sys.stderr, flush=True)

    archivos_a_procesar = []
    if args.input_file:
        for ruta_f_arg in args.input_file:
            ruta_normalizada = os.path.normpath(ruta_f_arg)
            if os.path.isfile(ruta_normalizada) and ruta_normalizada.lower().endswith('.txt'):
                archivos_a_procesar.append(ruta_normalizada)
            else:
                print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"Advertencia: Archivo '{ruta_normalizada}' no es un .txt válido o no existe y será omitido."}), flush=True)
                print(f"DEBUG_SERVIDOR_PY: Archivo '{ruta_normalizada}' inválido u omitido.", file=sys.stderr, flush=True)
                pass 
    elif args.default_input_dir:
        dir_path = os.path.normpath(args.default_input_dir)
        if os.path.isdir(dir_path):
            patron_busqueda = os.path.join(dir_path, "*.txt")
            archivos_a_procesar = [f for f in glob.glob(patron_busqueda) if os.path.isfile(f)]
            if not archivos_a_procesar:
                 print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"No se encontraron archivos .txt en el directorio: {dir_path}"}), flush=True)
        else:
            print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"Error: El directorio por defecto '{dir_path}' no es válido o no existe."}), flush=True)
            print(f"DEBUG_SERVIDOR_PY: Directorio por defecto '{dir_path}' inválido.", file=sys.stderr, flush=True)
            print(json.dumps({"type": "processing_complete", "client_id": client_id, "summary": {"status": "error_invalid_directory"}}), flush=True)
            return


    if not archivos_a_procesar:
        print(json.dumps({"type": "progress_message", "client_id": client_id, "message": "No se especificaron archivos .txt válidos para procesar."}), flush=True)
        print(json.dumps({"type": "processing_complete", "client_id": client_id, "summary": {"status": "no_files_found"}}), flush=True)
        return

    num_archivos_a_procesar = len(archivos_a_procesar)
    
    if args.concurrency_mode in ['thread', 'process']:
        workers_reales_pool = max(1, min(num_workers_visual_gui, num_archivos_a_procesar))
        executor_type = ThreadPoolExecutor if args.concurrency_mode == 'thread' else ProcessPoolExecutor
        msg_proc = f"Iniciando procesamiento CONCURRENTE REAL ({args.concurrency_mode}) de {num_archivos_a_procesar} archivo(s) con {workers_reales_pool} workers en pool (GUI simulará {num_workers_visual_gui})."
    
    elif args.concurrency_mode == 'sequential_visual':
        workers_reales_pool = 1 
        executor_type = None 
        msg_proc = f"Iniciando procesamiento SECUENCIAL de {num_archivos_a_procesar} archivo(s) (GUI simulará {num_workers_visual_gui} workers)."
    else:
        workers_reales_pool = 1
        executor_type = None
        msg_proc = f"Modo concurrencia desconocido '{args.concurrency_mode}', usando secuencial simple. {num_archivos_a_procesar} archivo(s)."

    print(f"DEBUG_SERVIDOR_PY: {msg_proc}", file=sys.stderr, flush=True)
    print(json.dumps({"type": "progress_message", "client_id": client_id, "message": msg_proc}), flush=True)

    files_processed_ok = 0
    # files_with_errors ya no es necesario aquí, ya que el error se maneja dentro de procesar_archivo_y_emitir_fila para el mensaje de progreso
    futures_exceptions = 0 

    if executor_type: 
        try:
            with executor_type(max_workers=workers_reales_pool) as executor:
                futures = {
                    executor.submit(procesar_archivo_y_emitir_fila, ruta_f, client_id, idx % num_workers_visual_gui, num_workers_visual_gui, args.simulate_delay_ms): (idx, ruta_f) # Ajustado idx para worker_visual_id
                    for idx, ruta_f in enumerate(archivos_a_procesar)
                }
                
                for future_item in as_completed(futures):
                    idx_original, ruta_f_original = futures[future_item]
                    try:
                        future_item.result() 
                        files_processed_ok += 1 
                    except Exception as exc_future:
                        futures_exceptions += 1
                        print(f"DEBUG_SERVIDOR_PY: EXCEPCION DEL FUTURE para '{ruta_f_original}': {exc_future}\n{traceback.format_exc()}", file=sys.stderr, flush=True)
                        print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"Error grave en worker para {os.path.basename(ruta_f_original)}: {exc_future}"}), flush=True)
                        # MODIFICADO: error_fila ya no tendrá "Error Info"
                        error_fila = {col: 'ERROR' for col in COLUMNAS_ORDENADAS}
                        error_fila["Processed File Name"] = os.path.basename(ruta_f_original)
                        # La línea error_fila["Error Info"] = ... se elimina
                        print(json.dumps({"type": "csv_data_row", "client_id": client_id, "data": error_fila}), flush=True)

        except Exception as e_executor: 
            print(f"DEBUG_SERVIDOR_PY: Error crítico con el Executor: {e_executor}\n{traceback.format_exc()}", file=sys.stderr, flush=True)
            print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"Error crítico con Executor: {e_executor}"}), flush=True)
            futures_exceptions = num_archivos_a_procesar - files_processed_ok

    else: 
        for idx, ruta_f in enumerate(archivos_a_procesar):
            try:
                procesar_archivo_y_emitir_fila(ruta_f, client_id, idx % num_workers_visual_gui, num_workers_visual_gui, args.simulate_delay_ms) # Ajustado idx para worker_visual_id
                files_processed_ok +=1 
            except Exception as exc_seq: 
                futures_exceptions += 1
                print(f"DEBUG_SERVIDOR_PY: ERROR CATASTRÓFICO en bucle secuencial para '{ruta_f}': {exc_seq}\n{traceback.format_exc()}", file=sys.stderr, flush=True)
                print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"Error grave procesando {os.path.basename(ruta_f)}: {exc_seq}"}), flush=True)
                # MODIFICADO: error_fila ya no tendrá "Error Info"
                error_fila = {col: 'ERROR' for col in COLUMNAS_ORDENADAS}
                error_fila["Processed File Name"] = os.path.basename(ruta_f)
                # La línea error_fila["Error Info"] = ... se elimina
                print(json.dumps({"type": "csv_data_row", "client_id": client_id, "data": error_fila}), flush=True)


    dt_script = time.perf_counter() - t0_script
    final_status = "completed"
    if futures_exceptions > 0: 
        final_status = "failed_catastrophically" if files_processed_ok == 0 else "completed_with_worker_exceptions"
    elif files_processed_ok == 0 and num_archivos_a_procesar > 0:
         final_status = "completed_no_tasks_ok" 
    
    summary = {
        "files_attempted": num_archivos_a_procesar,
        "tasks_completed_ok": files_processed_ok, 
        "tasks_failed_exception": futures_exceptions,
        "status": final_status,
        "duration_seconds": round(dt_script, 2),
        "concurrency_mode_used": args.concurrency_mode,
        "workers_visual_gui": num_workers_visual_gui,
        "simulated_delay_per_task_ms": args.simulate_delay_ms
    }
    print(f"DEBUG_SERVIDOR_PY: Finalizando script. Sumario: {summary}", file=sys.stderr, flush=True)
    print(json.dumps({"type": "processing_complete", "client_id": client_id, "summary": summary}), flush=True)

if __name__ == '__main__': # Corregido _name_ y _main_ a __name__ y __main__
    main()