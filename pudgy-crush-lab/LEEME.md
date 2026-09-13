# Pudgy Crush — laboratorio sin wallet

Ejecutar `INICIAR.cmd` y abrir http://127.0.0.1:5174 en el navegador. Mantener la ventana del servidor abierta mientras se juega. Requiere Node.js, que ya está instalado en esta máquina.

También se puede abrir `index.html` directamente para una prueba básica; se recomienda el servidor para mantener un origen estable para el guardado local.

El botón JUGAR GRATIS inicia la partida sin login ni transacción. No se conecta al portal, servidor de partidas ni wallet. Los resultados se guardan únicamente en este navegador, con claves separadas de la versión original.

Primera mejora aplicada: tablero adaptable a PC y móvil, controles unificados de toque y arrastre, cierre único de resultados y protección frente a movimientos de partidas anteriores. En móvil se reducen los efectos costosos y las partículas, se retiran fondos animados y filtros y se evita actualizar piezas que no cambiaron.

Comprobado en Chrome y emulación táctil, con tamaños 360×740, 390×844, 430×932, 844×390 y 1440×1000. Falta medir fluidez en teléfonos físicos: estas comprobaciones no garantizan una cifra de FPS.

Quedan pendientes la garantía de jugadas tras mezclar, validación y balance de mapas, revisión de reglas y progreso guardado. El informe inicial `../ANALISIS-PUDGY-CRUSH.md` describe la versión anterior a estos cambios.

El RAR original y las fuentes recuperadas se conservan. No se modificó ningún despliegue.
