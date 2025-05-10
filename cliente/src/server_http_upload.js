const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors'); // Para permitir peticiones desde el cliente React

const app = express();
const port = 3001; // Puerto diferente al del servidor WebSocket

app.use(cors()); // Habilitar CORS para todas las rutas

// Directorio donde se guardarán los archivos subidos
// Esta ruta es relativa a la ubicación de este script (server_http_upload.js)
// Si server_http_upload.js está en cliente/src/, entonces:
// __dirname es cliente/src/
// ../.. es el directorio raíz del proyecto (Sistemas-Operativos-Proyecto-main/)
// Por lo tanto, UPLOAD_DIR será Sistemas-Operativos-Proyecto-main/uploaded_files_from_client/
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploaded_files_from_client'); 

// Crear el directorio si no existe
if (!fs.existsSync(UPLOAD_DIR)) {
    console.log(`Creando directorio de subida: ${UPLOAD_DIR}`);
    try {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    } catch (err) {
        console.error(`Error creando directorio ${UPLOAD_DIR}:`, err);
        // Considerar salir si no se puede crear el directorio esencial
    }
} else {
     console.log(`Directorio de subida ya existe: ${UPLOAD_DIR}`);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_DIR); // Usa la ruta construida
    },
    filename: function (req, file, cb) {
        // Nombre único con timestamp para evitar colisiones y limpiar caracteres problemáticos
        cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Aceptar solo archivos .txt
        if (path.extname(file.originalname).toLowerCase() !== '.txt') {
            return cb(new Error('Solo se permiten archivos .txt'), false);
        }
        cb(null, true);
    }
});

// Endpoint para la subida de archivos
// El cliente React envía el archivo al campo 'txtfile'
app.post('/upload-txt', upload.single('txtfile'), (req, res) => { 
    if (!req.file) {
        // Esto puede ocurrir si el filtro rechaza el archivo o no se envía ninguno
        return res.status(400).json({ success: false, message: 'No se subió ningún archivo o el tipo no es .txt' });
    }

    // req.file.path contiene la ruta absoluta donde multer guardó el archivo.
    // Esta es la ruta que se enviará de vuelta al cliente y luego al servidor WebSocket.
    const absoluteFilePath = req.file.path; 
    console.log(`Archivo subido y guardado en: ${absoluteFilePath}`);

    res.json({
        success: true,
        filePath: absoluteFilePath, // Enviar la ruta absoluta del archivo guardado
        message: `Archivo ${req.file.originalname} subido correctamente.`
    });
}, (error, req, res, next) => { // Middleware de manejo de errores para Multer
    console.error("Error en middleware de subida Multer:", error);
    if (error instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Error de Multer: ${error.message}` });
    } else if (error) { // Otros errores (ej. del fileFilter)
         return res.status(400).json({ success: false, message: error.message });
    }
    // Si no hubo error relevante, pero !req.file, el bloque anterior lo maneja.
    next(); 
});

app.get('/', (req, res) => {
    res.send('Servidor HTTP para subida de archivos está activo. Usa POST /upload-txt para subir.');
});


app.listen(port, () => {
    console.log(`Servidor HTTP para subida de archivos escuchando en http://localhost:${port}`);
    console.log(`Los archivos se guardarán en: ${path.resolve(UPLOAD_DIR)} (ruta absoluta)`);
});