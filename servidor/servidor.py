# -*- coding: utf-8 -*-
import os
import re
import argparse
import time
# import psutil # Descomenta si quieres usarlo para limitar workers reales
import json
import glob
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
import sys
import traceback
import threading # Para obtener IDs de hilos reales si es útil

# --- Tus constantes y definiciones (APELLIDOS_SE, NOMBRES_PERSONA, etc.) ---
# ... (Mantenlas como están en tu archivo original) ...
ROOT = os.path.dirname(os.path.abspath(__file__))
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

def build_pattern(words, *, plural=False, boundaries=True):
    esc = [re.escape(w) for w in words]
    pat = r"(?:%s)" % "|".join(esc)
    if plural: pat = f"{pat}s?"
    return rf"\b{pat}\b" if boundaries else pat

def grp0_or_1(m, grp):
    return m.group(grp) if (m and m.lastindex is not None and grp <= m.lastindex) else (m.group(0) if m else '')

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
    COLUMNAS_ORDENADAS = [col for col, _, _ in PATRONES_DATA] + ["Processed File Name", "Error Info", "Assigned Worker (Visual)"]
except re.error as e:
    error_msg = f"Error fatal compilando Regex: {e}"
    print(json.dumps({"type": "script_error", "message": error_msg}), flush=True)
    print(f"SERVIDOR.PY CRITICAL: {error_msg}", file=sys.stderr, flush=True)
    sys.exit(1)

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
            
    # Lógica de limpieza
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

def procesar_archivo_y_emitir_fila(path: str, client_id_stdout: str, worker_visual_id: int, total_visual_workers: int, simulate_processing_delay_ms: int = 0):
    """
    Procesa UN archivo .txt (aplicando regex reales), e incluye información del "worker visual".
    Puede simular un retardo si simulate_processing_delay_ms > 0.
    """
    # Para depuración, puedes obtener el PID y TID real si es útil
    # real_pid = os.getpid()
    # real_tid = threading.get_ident() if threading else None
    # print(f"DEBUG_SERVIDOR_PY: Procesando '{os.path.basename(path)}', Worker Visual: {worker_visual_id+1}/{total_visual_workers}, Real PID: {real_pid}, Real TID: {real_tid}", file=sys.stderr, flush=True)

    nombre_base_archivo = os.path.basename(path)
    fila_resultante = {col: 'Not Mention' for col in COLUMNAS_ORDENADAS}
    fila_resultante["Processed File Name"] = nombre_base_archivo
    fila_resultante["Error Info"] = "None"
    fila_resultante["Assigned Worker (Visual)"] = f"{(worker_visual_id % total_visual_workers) + 1}/{total_visual_workers}"


    try:
        with open(path, encoding='utf-8', errors='ignore') as fh:
            txt = fh.read()

        if not txt.strip():
            fila_resultante["Error Info"] = "File is empty or whitespace only"
            # print(f"DEBUG_SERVIDOR_PY: Archivo '{nombre_base_archivo}' vacío.", file=sys.stderr, flush=True)
        else:
            # Siempre hacemos el procesamiento real de datos
            datos_encontrados = do_actual_processing_for_file(txt, fila_resultante)
            if not datos_encontrados:
                # print(f"DEBUG_SERVIDOR_PY: No se encontraron datos regex en '{nombre_base_archivo}'.", file=sys.stderr, flush=True)
                pass # Los campos ya son "Not Mention"

        if simulate_processing_delay_ms > 0:
            time.sleep(simulate_processing_delay_ms / 1000.0)
            # Podrías añadir una columna "SimulatedDelay" a fila_resultante si quieres
            # fila_resultante["SimulatedDelay"] = f"{simulate_processing_delay_ms}ms"


    except FileNotFoundError:
        fila_resultante["Error Info"] = f"Archivo no encontrado: {path}"
    except IOError as e_io:
        fila_resultante["Error Info"] = f"Error I/O leyendo {nombre_base_archivo}: {e_io}"
    except Exception as e_general:
        fila_resultante["Error Info"] = f"Error inesperado procesando {nombre_base_archivo}: {type(e_general).__name__} - {e_general}"
        print(f"DEBUG_SERVIDOR_PY: EXCEPCION en procesar_archivo_y_emitir_fila para '{nombre_base_archivo}': {e_general}\n{traceback.format_exc()}", file=sys.stderr, flush=True)

    # Emitir la fila
    if fila_resultante["Error Info"] != "None" and fila_resultante["Error Info"] != "File is empty or whitespace only":
         print(json.dumps({"type": "progress_message", "client_id": client_id_stdout, "message": f"Error procesando {nombre_base_archivo}: {fila_resultante['Error Info']}"}), flush=True)
    
    print(json.dumps({
        "type": "csv_data_row",
        "client_id": client_id_stdout,
        "data": fila_resultante
    }), flush=True)
    # print(f"DEBUG_SERVIDOR_PY: Fila emitida para '{nombre_base_archivo}'.", file=sys.stderr, flush=True)


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

    # Determinar workers reales para el pool y workers para la simulación visual
    num_workers_visual_gui = args.workers # Lo que la GUI "quiere ver"
    
    # Mensaje inicial
    msg_inicial_detalle = (
        f"Script 'servidor.py' para cliente {client_id}. "
        f"Modo Concurrencia Solicitado: {args.concurrency_mode}, "
        f"Workers (Visual GUI): {num_workers_visual_gui}, "
        f"Retardo Simulado/tarea: {args.simulate_delay_ms}ms"
    )
    print(json.dumps({"type": "progress_message", "client_id": client_id, "message": msg_inicial_detalle}), flush=True)
    print(f"DEBUG_SERVIDOR_PY: main() llamado. Args: {args}", file=sys.stderr, flush=True)

    # --- Determinar lista de archivos a procesar (sin cambios en esta parte) ---
    archivos_a_procesar = []
    if args.input_file:
        for ruta_f_arg in args.input_file:
            ruta_normalizada = os.path.normpath(ruta_f_arg)
            if os.path.isfile(ruta_normalizada) and ruta_normalizada.lower().endswith('.txt'):
                archivos_a_procesar.append(ruta_normalizada)
            else:
                # ... (manejo de advertencia)
                pass 
    elif args.default_input_dir:
        # ... (lógica para default_input_dir)
        dir_path = os.path.normpath(args.default_input_dir)
        if os.path.isdir(dir_path):
            patron_busqueda = os.path.join(dir_path, "*.txt")
            archivos_a_procesar = [f for f in glob.glob(patron_busqueda) if os.path.isfile(f)]
        # ... (manejo de error si dir_path no es válido)


    if not archivos_a_procesar:
        # ... (manejo de no_files_found)
        print(json.dumps({"type": "processing_complete", "client_id": client_id, "summary": {"status": "no_files_found"}}), flush=True)
        return

    num_archivos_a_procesar = len(archivos_a_procesar)
    
    # Configurar workers reales para el pool
    if args.concurrency_mode in ['thread', 'process']:
        # Para paralelismo real, usamos num_workers_visual_gui como el deseado, pero podemos limitarlo
        workers_reales_pool = max(1, min(num_workers_visual_gui, num_archivos_a_procesar))
        # Opcionalmente, limitar por psutil si es relevante
        # if psutil and os.cpu_count(): workers_reales_pool = min(workers_reales_pool, os.cpu_count())
        executor_type = ThreadPoolExecutor if args.concurrency_mode == 'thread' else ProcessPoolExecutor
        msg_proc = f"Iniciando procesamiento CONCURRENTE REAL ({args.concurrency_mode}) de {num_archivos_a_procesar} archivo(s) con {workers_reales_pool} workers en pool (GUI simulará {num_workers_visual_gui})."
    
    elif args.concurrency_mode == 'sequential_visual':
        workers_reales_pool = 1 # Backend es secuencial
        executor_type = None # No usaremos Executor directamente en este modo
        msg_proc = f"Iniciando procesamiento SECUENCIAL de {num_archivos_a_procesar} archivo(s) (GUI simulará {num_workers_visual_gui} workers)."
    else:
        # Modo desconocido, default a secuencial simple
        workers_reales_pool = 1
        executor_type = None
        msg_proc = f"Modo concurrencia desconocido '{args.concurrency_mode}', usando secuencial simple. {num_archivos_a_procesar} archivo(s)."

    print(f"DEBUG_SERVIDOR_PY: {msg_proc}", file=sys.stderr, flush=True)
    print(json.dumps({"type": "progress_message", "client_id": client_id, "message": msg_proc}), flush=True)

    files_processed_ok = 0
    files_with_errors = 0 # Contará errores DENTRO de procesar_archivo_y_emitir_fila
    futures_exceptions = 0 # Contará excepciones DEL POOL o del future.result()

    if executor_type: # Modos 'thread' o 'process'
        try:
            with executor_type(max_workers=workers_reales_pool) as executor:
                # Cada tarea recibe su índice para calcular el worker_visual_id
                futures = {
                    executor.submit(procesar_archivo_y_emitir_fila, ruta_f, client_id, idx, num_workers_visual_gui, args.simulate_delay_ms): (idx, ruta_f)
                    for idx, ruta_f in enumerate(archivos_a_procesar)
                }
                
                for future_item in as_completed(futures):
                    idx_original, ruta_f_original = futures[future_item]
                    try:
                        future_item.result() # Solo para capturar excepciones del worker
                        # La función procesar_archivo_y_emitir_fila ya maneja la emisión y errores internos.
                        # Contamos como "OK" si el worker no explotó. El error real del archivo está en la fila.
                        files_processed_ok += 1 
                    except Exception as exc_future:
                        futures_exceptions += 1
                        print(f"DEBUG_SERVIDOR_PY: EXCEPCION DEL FUTURE para '{ruta_f_original}': {exc_future}\n{traceback.format_exc()}", file=sys.stderr, flush=True)
                        print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"Error grave en worker para {os.path.basename(ruta_f_original)}: {exc_future}"}), flush=True)
                        # Emitir una fila de error si el worker falló catastróficamente
                        error_fila = {col: 'ERROR' for col in COLUMNAS_ORDENADAS}
                        error_fila["Processed File Name"] = os.path.basename(ruta_f_original)
                        error_fila["Error Info"] = f"Worker FAILED: {exc_future}"
                        error_fila["Assigned Worker (Visual)"] = f"{(idx_original % num_workers_visual_gui) + 1}/{num_workers_visual_gui}"
                        print(json.dumps({"type": "csv_data_row", "client_id": client_id, "data": error_fila}), flush=True)

        except Exception as e_executor: # Error con el Executor mismo
            print(f"DEBUG_SERVIDOR_PY: Error crítico con el Executor: {e_executor}\n{traceback.format_exc()}", file=sys.stderr, flush=True)
            print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"Error crítico con Executor: {e_executor}"}), flush=True)
            futures_exceptions = num_archivos_a_procesar - files_processed_ok # Asumir que el resto falló

    else: # Modo 'sequential_visual' (o fallback desconocido)
        for idx, ruta_f in enumerate(archivos_a_procesar):
            try:
                # procesar_archivo_y_emitir_fila ya maneja la emisión y errores internos.
                procesar_archivo_y_emitir_fila(ruta_f, client_id, idx, num_workers_visual_gui, args.simulate_delay_ms)
                files_processed_ok +=1 # Si no hay excepción aquí, contamos como OK
            except Exception as exc_seq: # Error catastróficos en la llamada secuencial
                futures_exceptions += 1
                print(f"DEBUG_SERVIDOR_PY: ERROR CATASTRÓFICO en bucle secuencial para '{ruta_f}': {exc_seq}\n{traceback.format_exc()}", file=sys.stderr, flush=True)
                print(json.dumps({"type": "progress_message", "client_id": client_id, "message": f"Error grave procesando {os.path.basename(ruta_f)}: {exc_seq}"}), flush=True)
                error_fila = {col: 'ERROR' for col in COLUMNAS_ORDENADAS}
                error_fila["Processed File Name"] = os.path.basename(ruta_f)
                error_fila["Error Info"] = f"Sequential Call FAILED: {exc_seq}"
                error_fila["Assigned Worker (Visual)"] = f"{(idx % num_workers_visual_gui) + 1}/{num_workers_visual_gui}"
                print(json.dumps({"type": "csv_data_row", "client_id": client_id, "data": error_fila}), flush=True)

    # Contar filas con "Error Info" != "None" sería un conteo más preciso de `files_with_errors`
    # Pero para este sumario, `files_processed_ok` son los que no crashearon el worker/llamada.
    # `futures_exceptions` son los que sí crashearon.

    dt_script = time.perf_counter() - t0_script
    final_status = "completed"
    if futures_exceptions > 0: # Si algún worker/llamada explotó
        final_status = "failed_catastrophically" if files_processed_ok == 0 else "completed_with_worker_exceptions"
    elif files_processed_ok == 0 and num_archivos_a_procesar > 0:
         final_status = "completed_no_tasks_ok" # Podría ser que todos los archivos tuvieran errores internos (ej. vacíos) pero los workers no fallaron.
    
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

if __name__ == '__main__':
    main()