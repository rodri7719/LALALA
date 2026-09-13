# Pudgy Crush — diagnóstico y plan de recuperación

Revisión del backup local, 12 de septiembre de 2026.

## Mi opinión

Sí, vale la pena revivirlo. Hay un juego reconocible y bastante contenido: piezas propias, poderes, cascadas, misiones, supervivencia, música y una identidad visual. No hace falta empezar de cero. Sin embargo, hoy lo considero un prototipo avanzado con problemas de consistencia, no una versión lista para relanzar con pagos y competición.

El salto de calidad vendrá primero de que cada toque funcione, los niveles sean comprensibles y las partidas terminen correctamente. Agregar más partículas, obstáculos o blockchain antes de eso aumentaría la complejidad.

## Qué había realmente en la carpeta

La carpeta original contenía únicamente `BACKUP_NEW_GAME.rar`, de 283.229.482 bytes. Recuperé el código en `recovered/`, conservando el RAR. Excluí dependencias instaladas, cachés y el perfil del navegador. No extraje ni leí `server/.env`.

| Archivo o grupo, dentro de recovered | Función | Qué hacer |
|---|---|---|
| `pudgy-crush.html` | Juego principal: HTML, CSS, imágenes embebidas y motor JavaScript | Base de referencia para recuperar el juego |
| `agw-game/public/pudgy-crush.html` | Copia que sirve el portal | Es idéntica al archivo raíz, comprobado por SHA-256 |
| `agw-game/public/pudgy-crush-v6.html` | Experimento de renderizado Canvas para móvil | Conservar para comparar, no asumir que reemplaza al principal |
| `agw-game/src/App.jsx` | Portal React, selección de juegos, login AGW, pagos y puente con los juegos | Separarlo conceptualmente del motor |
| `agw-game/src/main.jsx` | Envuelve la aplicación con AbstractWalletProvider en la red Abstract | No es necesario para probar el juego solo |
| `agw-game/src/useVS.js` | Conexión WebSocket, lobby, desafíos y ranking compartido | Integración del portal; no indispensable para Crush local |
| `agw-game/sync-public.mjs` | Copia los juegos raíz a public antes de desarrollo y compilación | Punto crítico: puede sobrescribir cambios hechos directamente en public |
| `agw-game/copy-static.mjs` | Copiado adicional a dist | No aparece en los scripts de package.json; revisar antes de conservarlo como flujo activo |
| `server/server.js` | Servidor compartido de partidas, pagos y ranking | No es un servidor autoritativo del tablero de Crush |
| `server/data/weekly-leaderboard.json` | Datos guardados del ranking | Datos históricos; no constituyen lógica del juego |
| `contracts/` | Carpeta sin archivos en este backup | Falta el código fuente de los contratos para auditarlos |
| `vercel.json` | Cabeceras de despliegue | Revisar su aplicación real antes de publicar |
| Otros HTML: ajedrez, game8, horse-racing, alien-plinko | Otros juegos del portal | Conservar aparte; no necesarios para el primer rescate de Crush |
| Imágenes y audios de public | Recursos compartidos y de otros juegos | No todos pertenecen a Crush; inventariar referencias antes de borrar |
| Bots de caballo y aprobación Privy | Automatizaciones auxiliares | No forman parte del juego principal ni hace falta ejecutarlos |

El archivo principal pesa aproximadamente 720 KB; la v6, 47 KB. Esa diferencia no prueba que la v6 cargue quince veces más rápido: descarga el HTML principal para extraer imágenes mediante expresiones regulares. No es independiente de él.

El RAR incluye un perfil `.privy-profile` y un archivo `.env`. No conviene distribuir ese backup como paquete público del juego: preparar una entrega que contenga únicamente fuentes y recursos necesarios.

## Cómo funciona el juego principal

1. El portal pide login antes de entrar al juego y lo carga en un iframe.
2. El botón PLAY del juego manda `AGW_PLAY` al portal.
3. El portal solicita una transacción `buyPlay(gameId)` y comunica `AGW_START_GAME` al recibir el callback de éxito del envío.
4. El juego genera un tablero de 8×8 y las misiones del nivel.
5. Se intercambian piezas vecinas. Una combinación de tres o más se elimina; un movimiento sin combinación se revierte.
6. Se aplican misiones, daño a obstáculos y puntos; caen las piezas, se rellenan huecos y se resuelven cascadas.
7. Los niveles normales terminan por misiones; los de supervivencia dependen de vida y duración.
8. Al terminar la partida se acumulan puntos y se guardan datos locales.

Hay 16 configuraciones manuales. A partir del nivel 17 se generan configuraciones a partir de plantillas. La partida termina al completar el nivel 25. Los comentarios que hablan de 12 niveles manuales y progresión infinita están desactualizados.

La supervivencia aparece cada tres niveles. Hay seis tipos normales disponibles al principio y siete desde el nivel 7. El comodín tipo 7 está deshabilitado en la generación, aunque quedan anuncios que prometen su desbloqueo.

La puntuación principal usa 12 puntos por casilla incluida en la eliminación, multiplicados por el combo con tope de 15. Existen bombas, rayos, blizzard y mega. La implementación actual solo activa poderes incluidos en una copia inicial del conjunto de eliminación: los poderes alcanzados después por otro poder no se encadenan necesariamente.

El ranking de Crush se guarda en `localStorage`: acumula puntos semanales por identidad, con reinicio los viernes a las 00:00 UTC, y conserva hasta diez entradas. No es un ranking global validado. Los puntos de por vida tampoco están separados por wallet. No encontré en Crush el envío de puntuaciones al ranking compartido que sí aparece para otros juegos en el portal.

## Problemas prioritarios y evidencia

### 1. Una sola derrota puede contabilizarse varias veces — confirmado

`startTimer()` sigue llamando a `timeUp()` cada 100 ms cuando el tiempo llega a cero. `timeUp()` programa `gameOver()` 900 ms después sin cerrar inmediatamente la partida. Se acumulan cierres pendientes y `gameOver()` no impide registrar otra vez el resultado.

Reproducción en Chrome: puntuación 100, tiempo restante 0,05 segundos. Resultado: diez llamadas a cierre y 1.000 puntos acumulados. No es solo una posibilidad teórica.

Corrección: transición única a un estado de finalización, cancelar reloj y tareas pendientes antes de mostrar efectos, e identificar cada partida para guardarla una sola vez.

Referencias: `pudgy-crush.html`, funciones `startTimer`, `timeUp`, `gameOver` y `addLifePts`.

### 2. El tablero móvil queda cortado — confirmado

Con viewport de 390×844, el tablero midió 453 px y comenzó en x = −31,5 px; su extremo derecho llegó a 421,5 px. La captura confirma recorte en ambos lados y superposición de elementos superiores. El documento tuvo 452 px de ancho de contenido.

Corrección: calcular casilla y separación según el espacio disponible, reorganizar cabecera y misiones, contemplar altura y áreas seguras. Validar también 360, 390, 430 px y orientación horizontal. Una emulación no sustituye probar dispositivos reales.

### 3. Un toque táctil se procesa dos veces — confirmado en emulación

Las celdas escuchan `pointerdown`, y el tablero vuelve a ejecutar `onClick()` al terminar un toque sin arrastre. En Chrome con entrada táctil emulada, un solo toque dejó `sel = null` y cero celdas seleccionadas.

Corrección: unificar selección y arrastre en Pointer Events, incluir cancelación y captura del puntero, y evitar dos rutas de activación para el mismo gesto. [Referencia de Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events).

### 4. La garantía de jugada tras mezclar es incorrecta — confirmado

El patrón de emergencia coloca dos piezas de un tipo y una de otro. Intercambiarlas no produce por sí solo tres iguales. El caso aislado construido con ese patrón devuelve que no hay jugadas.

Además, `findVM()` comprueba si existe cualquier match después de intercambiar, sin exigir que participe el intercambio. Si una mezcla deja una combinación previa, puede considerar válido un movimiento ajeno a ella.

Corrección: generar y validar un tablero estable, sin combinaciones previas y con al menos un intercambio que cree una combinación nueva. Conservar la misma regla para pistas, mezclas y movimientos del jugador.

### 5. Niveles y obstáculos no se validan contra la forma del tablero

Confirmado: el nivel 16 coloca dos de sus tres coleccionables, en (0,2) y (0,5), sobre casillas bloqueadas de su tablero romboidal. En el nivel 25 aparece hielo en una casilla bloqueada. Esto demuestra inconsistencia de configuración; no demuestra por sí solo que todas esas partidas sean imposibles.

También hay misiones de telarañas por el doble de las telarañas iniciales. Si se eliminan antes de que se propaguen, puede faltar material para completarlas. Debe reproducirse con una semilla concreta antes de declarar su frecuencia.

Corrección: validar posiciones, cantidades, tipos de pieza disponibles y condiciones de victoria antes de aceptar cada nivel. Usar semillas reproducibles para los niveles aleatorios.

### 6. Estados y tareas asíncronas se mezclan

Las cascadas y efectos continúan mediante esperas sin un identificador de partida. Las funciones pueden seguir ejecutándose después de volver al menú. En la prueba, una operación de movimiento terminó después de salir; no se observó reapertura del nivel en ese caso. Falta validar sistemáticamente salir, reiniciar y terminar mientras hay cascadas.

`startGame()` tampoco reinicia explícitamente todos los estados de interacción, como `sel` y `anim`.

Corrección: estados claros — menú, jugando, resolviendo, pausa, victoria, derrota — y cancelación de trabajos pertenecientes a una partida anterior.

### 7. Lo que anuncia la interfaz no coincide siempre con las reglas

- Se anuncia el bloque Abstract en nivel 7, pero la generación excluye su tipo.
- La barra de puntuación existe, pero la victoria normal depende de misiones; `targetScore` no es un requisito en `checkState()`.
- Los comentarios anuncian piedra y gelatina en niveles donde sus listas están vacías; piedras están desactivadas globalmente y la gelatina generada se vacía explícitamente.
- Hay funciones de portales, pero no encontré una llamada que aplique `getPortalExit()` al movimiento o la gravedad.
- La supervivencia reproduce una frase de treinta segundos mientras la duración calculada varía.

Hay que decidir qué mecánicas se conservarán y hacer que texto, objetivos y comportamiento expresen las mismas reglas.

### 8. Relojes y sensación de control

El reloj resta cantidades fijas por callback, no tiempo realmente transcurrido. Los navegadores pueden retrasar temporizadores, especialmente con páginas ocultas. Definir pausa para práctica y un reloj verificable si hay competición. [Referencia sobre visibilidad y temporizadores](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

Las cascadas consumen tiempo mientras el jugador no puede mover. Cada ronda incluye esperas de eliminación y caída, que se acumulan en combos largos. Conviene probar el balance con el reloj pausado durante resolución en campaña; supervivencia necesita una regla propia y explícita.

### 9. Presentación y rendimiento

La identidad visual es aprovechable, pero los bordes luminosos, animaciones de piezas, rayos, fondo y partículas compiten por la atención. En escritorio el personaje y tablero quedan desplazados respecto del espacio disponible; en móvil falta jerarquía.

Se reconstruyen elementos del tablero, se usan lecturas de geometría durante efectos y existen animaciones ambientales permanentes. Son candidatos para optimización, no evidencia de una cifra concreta de FPS: no medí rendimiento en teléfonos físicos.

Priorizar lectura de piezas, indicación clara del objetivo, selección visible y animación de intercambio. Añadir controles separados de música, efectos y voz, opción de reducir movimiento y mejor acceso por teclado. `showBPop()` está desactivado y el indicador de combo se oculta en ambas ramas: hay feedback útil perdido pese a la abundancia de efectos.

## Wallet, servidor y publicación

El motor local no necesita blockchain. La versión de invitado puede existir sin React, AGW, Redis ni servidor de partidas.

Antes de recuperar pagos hay asuntos concretos:

- La pantalla de pago muestra 0,00001 ETH; el portal usa 0,000006 ETH por defecto, salvo variable de entorno. Precio e importe deben provenir de una única configuración.
- El juego original permite iniciar con Enter sin pasar por `payToPlay()`. El acceso de pago no se puede confiar a un botón del navegador.
- Los receptores de mensajes no rechazan de manera general orígenes y emisores inesperados; se usa `*` como destino. Validar `origin`, `source`, esquema y estado de partida. [Referencia de seguridad de postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
- El portal inicia Crush desde el callback de envío de la transacción. No encontré una espera de recibo confirmatorio en esa ruta. Hay una verificación de recibos en el servidor para otros flujos, que no equivale a validar esta partida de Crush.
- El servidor acepta registro de dirección sin demostrar propiedad mediante firma, y `weekly_points` acepta puntos positivos del cliente sin verificar una partida de Crush. No sirve como base de premios verificables.
- El registro de transacciones usadas vive en memoria. Revisar persistencia y concurrencia antes de utilizarlo como control de entradas pagadas.
- `useVS.js` cae por defecto en `ws://host:8787`; un despliegue HTTPS necesita configuración adecuada.
- Si se aplican las cabeceras del `vercel.json` raíz, `X-Frame-Options: DENY` y `frame-ancestors 'none'` contradicen la carga de juegos en iframe. Debe verificarse el alcance real en el despliegue.

No ejecuté bots, envié transacciones ni consulté el servicio de producción. No audité el contrato desplegado porque su fuente no está en este backup. Tampoco hice una actualización de dependencias ni un análisis de vulnerabilidades de todos los paquetes.

## Qué aprovechar de la v6

La v6 declara que es una fase inicial para móvil, con Canvas y sin música. Tiene una presentación más simple, pero no conserva todas las reglas: usa puntuación distinta, resolución limitada a seis pasos, condiciones de avance diferentes y no contiene toda la experiencia de la versión principal.

La conservaría como experimento. Primero separaría el motor y sus pruebas del dibujo; después se puede comparar DOM y Canvas usando exactamente las mismas reglas. Canvas por sí solo no corrige controles, generación, progreso ni accesibilidad.

## Plan recomendado por etapas

### Etapa 0 — Laboratorio sin wallet

Ya preparado en `pudgy-crush-lab/`. Es una copia del principal con inicio gratuito, sin puente de pagos ni wallet, y claves de almacenamiento distintas para sus resultados locales. Conserva los defectos del motor identificados para que la comparación inicial sea fiel. No es todavía la versión corregida ni el relanzamiento.

### Etapa 1 — Base confiable

Resolver cierre duplicado, entrada táctil, tamaño del tablero, cancelación de cascadas y garantía de jugadas. Validar todos los niveles 1–25. Criterios: una derrota registra exactamente una partida; ningún tablero queda cortado; cada toque tiene una sola acción; todo nivel tiene objetivos coherentes y un tablero válido.

Separar motor, niveles, renderizado, audio, guardado e integración con wallet. Eliminar las redefiniciones de funciones mediante `original...` una vez que las pruebas cubran el comportamiento acordado. Mantener una única fuente del juego y retirar el copiado ambiguo.

### Etapa 2 — Mejorar el juego que se siente al jugar

Crear una introducción guiada breve y cinco primeros niveles cuidadosamente ajustados. Presentar una mecánica por vez. Afinar intercambio, caída, poderes y explicación de objetivos. Reducir ruido visual y hacer que los combos importantes realmente se distingan.

Mi propuesta de diseño: campaña por movimientos para aprender y resolver; supervivencia como modalidad claramente diferenciada. Evitar exigir tiempo y movimientos simultáneamente en toda la campaña sin una razón de diseño probada.

### Etapa 3 — Dar motivos para volver

Mapa de niveles, estrellas guardadas, continuar progreso y desafíos diarios con semilla. Cosméticos y logros vinculados al juego. Un modo práctica que permita seleccionar niveles facilitará tanto el desarrollo como las pruebas de jugadores.

Medir inicio de partida, abandono por nivel, derrota por causa, tiempo de resolución, errores y finalización. Las métricas deben orientar el balance; no se pueden inferir tasas de retención del código actual.

### Etapa 4 — Recuperar Abstract como opción

Entrada inmediata como invitado; conectar después para funciones que lo justifiquen. Distinguir récord local de clasificación validada. Migrar progreso de invitado solo con una regla explícita. Para desafíos con premios hacen falta sesiones y resultados verificables; guardar un número en blockchain no demuestra que la partida sea legítima.

La prioridad de utilidad sería: juego individual pulido, desafío diario y progreso. Dejaría multijugador, torneos y monetización para después de validar que la gente quiere volver a jugar.

## Alcance de la comprobación

Probé en Chrome de escritorio sin interfaz visible: inicio por botón sin wallet, tablero de 64 celdas, un intercambio mediante clics que pasó de 0 a 36 puntos y de 30 a 29 movimientos, inspección de configuraciones 1–25, geometría móvil, cierre repetido, fin de tiempo y entrada táctil emulada.

La prueba básica no produjo errores JavaScript. Las solicitudes observadas correspondieron a la página local, su fondo y Google Fonts, sin conexiones de wallet. La fuente externa es decorativa: para un paquete totalmente autónomo convendría incluirla localmente.

No completé manualmente los 25 niveles, no ejecuté múltiples semillas de cada nivel y no validé Safari/iOS ni dispositivos físicos. Los hallazgos de código y las hipótesis pendientes están distinguidos arriba.

Evidencias: `audit/results.json`, `audit/edge-results.json`, capturas `audit/game-desktop.png`, `audit/game-mobile.png` y `audit/menu-desktop.png`. Los scripts de auditoría dependen del entorno local de esta máquina; el laboratorio solo necesita Node para su servidor, o puede abrirse mediante su HTML.

Mi decisión: rescatar la versión principal como referencia del juego, usar la v6 para investigar presentación móvil y reconstruir gradualmente la organización interna. La primera entrega valiosa es un Pudgy Crush gratuito, cómodo en celular y consistente, con cinco niveles muy pulidos y el resto validado antes de expandirlo.
