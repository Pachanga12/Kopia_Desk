# Kopia Desk

MVP funcional de una app local para copias incrementales de carpetas como Imágenes, Documentos o Descargas.

Proyecto montado para:

```text
D:\Users\Admin\Documents\Kopia_Desk
```

Carpeta de prueba sugerida:

```text
D:\Users\Admin\Documents\Kopia_Desk\FOTOS
```

## Cómo abrir

Opción fácil: ejecuta `iniciar-kopia-desk.bat` y abre la dirección que muestra.

Opción directa: abre `index.html` en Chrome o Edge moderno.

Opción recomendada: sirve esta carpeta por localhost y abre la dirección local. En esta entrega ya fue probado con:

```powershell
python -m http.server 4178
```

Luego abre:

```text
http://127.0.0.1:4178/
```

## Qué hace

- Permite añadir una o más carpetas origen.
- Permite elegir una carpeta destino, como un USB o disco externo.
- Escanea archivos de forma recursiva.
- Compara contra el último manifiesto guardado en el navegador.
- Detecta archivos nuevos, cambiados y eliminados del origen.
- No borra backups cuando un archivo desaparece del origen.
- Permite aceptar u omitir nuevos, cambiados y eliminados por carpeta.
- Copia aceptados en `AlfombraBackup/<carpeta>/latest`.
- Guarda versiones de archivos cambiados en `AlfombraBackup/<carpeta>/_versions/<fecha>`.
- Crea registros JSON en `AlfombraBackup/<carpeta>/_logs`.
- Puede usar hash SHA-256 opcional para comparar contenido real.

## Limitación del MVP web

El navegador no permite consultar con precisión el espacio libre del USB o listar discos conectados como lo haría una app nativa. Esa parte queda marcada para la versión Electron/Tauri.

## Siguiente paso natural

Convertir este MVP en Electron para activar detección real de discos, espacio disponible, empaquetado instalable y ejecución programada.
