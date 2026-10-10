# Mockup

Captura la portada de un sitio y colócala en un dispositivo 3D para descargar una imagen de promoción.

Pegas una URL, eliges un iPhone o un Fold, y la app hace una captura del viewport móvil. La imagen queda en la pantalla del dispositivo. Puedes orbitar, cambiar el fondo y la luz, y guardar un PNG del encuadre.

## Requisitos

- Node.js 22

## Arranque

```bash
npm install
npx playwright install chromium
npm run dev
```

Abre [http://127.0.0.1:43123](http://127.0.0.1:43123).

Si Chromium no puede arrancar, la captura usa la API pública de Microlink y devuelve los bytes de la imagen. No hace falta una clave.

## Uso

1. Pega una URL, por ejemplo `https://elpais.es`.
2. Elige el dispositivo.
3. Pulsa **Capturar**.
4. Orbita el dispositivo y ajusta fondo y luz.
5. En Fold, **Apertura** abre el libro. El viewport abierto es 768×874.
6. **Guardar imagen** descarga un PNG a 2× del lienzo.

## API

`POST /api/capture`

```json
{ "url": "https://example.com", "width": 390, "height": 844 }
```

Solo se aceptan direcciones `http` y `https`. Se bloquean hosts privados, de loopback y link-local. El tiempo de espera de cada intento es de unos 20 segundos. La captura es el viewport (por encima del pliegue), con `deviceScaleFactor` 2 y user agent móvil.

Tamaños permitidos: 390×844, 393×852, 402×874 y 768×874.

## Render

`render.yaml` define un servicio web de Node. El build instala Chromium de Playwright y luego ejecuta `npm run build`. Si Chromium se queda sin memoria al servir, la captura cae a Microlink.
