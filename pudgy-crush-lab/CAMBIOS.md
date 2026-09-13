# Primera mejora — 12 septiembre 2026

Una misma versión para escritorio y móvil, sobre la copia sin wallet.

- Tablero calculado según el espacio disponible, sin el antiguo mínimo de casilla que cortaba las columnas.
- Cabecera y misiones reorganizadas para pantallas pequeñas.
- Un solo flujo de Pointer Events para selección y arrastre; cancelación del gesto contemplada.
- La derrota por tiempo detiene inmediatamente el reloj y solo registra una vez los puntos.
- Cada partida tiene una generación interna: resultados asíncronos antiguos no pueden alterar una nueva partida.
- Reinicio explícito de selección y bloqueo de interacción.
- Efectos ligeros al abrir en pantalla pequeña, entrada táctil o con preferencia de movimiento reducido: sin lluvia de rayos, parallax, nieve ni filtros de fondo; partículas limitadas a 60 simultáneas, con menos partículas por evento.
- Animaciones de eliminación y caída más breves; piezas sin cambios no se redibujan desde JavaScript en cada actualización.
- Las partículas no mantienen un ciclo de dibujo a cada frame cuando no hay ninguna; la nieve no se dibuja en segundo plano.

Pruebas automatizadas en `../audit/upgrade-results.json`: tablero dentro del viewport en cinco tamaños, movimiento válido que consume una jugada y suma puntos, toque que selecciona una vez, derrota de 100 que suma 100 incluso al repetir cierre, y reinicio durante cascada sin contaminación de la nueva partida. Sin errores JavaScript observados en esas pruebas.

Pendiente: teléfono físico y FPS; balance y validación de niveles; garantía de jugadas tras mezclar; reglas de campaña y supervivencia; progreso; refactorización completa del motor. El código original permanece en recovered y el RAR.
