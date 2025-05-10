 # Cabecera CSV
    with open(args.output, 'w', newline='', encoding='utf-8') as f:
        csv.DictWriter(f, fieldnames=COLUMNAS, quoting=csv.QUOTE_ALL).writeheader()