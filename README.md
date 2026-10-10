# Mockup

Abre un sitio dentro de un dispositivo 3D y recórrelo en vivo. El navegador es Chromium en el servidor: la pantalla del dispositivo recibe un screencast, y los clics que caen sobre el cristal se reenvían a esa página.

## Requisitos

- Node.js 22

## Arranque

```bash
npm install
npx playwright install chromium
npm run dev
```

Abre [http://127.0.0.1:43123](http://127.0.0.1:43123).

## Uso

1. Pega una URL, por ejemplo `https://elpais.es`.
2. Elige el dispositivo y pulsa **Abrir**.
3. Arrastra fuera de la pantalla para orbitar. Sobre la pantalla, el puntero, el clic y la rueda van a la página.
4. En iPhone Duo, **Apertura** 0 es el teléfono cerrado (pantalla exterior, grosor y bisagra) y 1 lo abre del todo (pantalla interior en las dos hojas). La misma página sigue en el cristal. Cerrado, el navegador usa 466×585. Abierto, un solo viewport de 890×533 repartido en los dos paneles. En horizontal, esos tamaños se intercambian.
5. **Orientación** pone el teléfono o el iPad en vertical o en horizontal. El viewport del navegador gira con el aparato; la cámara y los botones se quedan en las aristas reales.
6. **Acabado** lista solo los colores que Apple vende para ese modelo. **Fondo** mantiene Blanco, Niebla y Negro, y añade cada variante de Vibrant vista, Green glory y Deep dusk (001–030) como CSS medido de ese wallpaper.
7. **Guardar imagen** descarga un PNG a 2× del encuadre.

La barra de estado, la Dynamic Island, el notch y el indicador de inicio son cromo del dispositivo. La página vive en el área segura y no queda debajo de ese cromo.

## Sesión en vivo

`WebSocket /api/live`

El cliente envía `open` con la URL y el tamaño del área de contenido, `resize` al cambiar de dispositivo, de apertura o de orientación, e `input` con coordenadas CSS. El servidor responde con mensajes de estado y con fotogramas JPEG de `Page.startScreencast`.

Solo se aceptan direcciones `http` y `https`. Se bloquean hosts privados, de loopback y link-local, también en las peticiones que hace la página. Hay un Chromium para todo el servicio. Al cerrarse el socket se cierra la página; a los tres minutos sin actividad se mata el proceso.

## Render

`render.yaml` instala Chromium en el build y arranca `npm start`, que es el servidor Node con el WebSocket. El plan Starter tiene 512 MB.
