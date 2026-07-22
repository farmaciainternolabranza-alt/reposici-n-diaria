(function (global) {
  "use strict";

  const UMBRALES_COBERTURA = Object.freeze({
    rojoHasta: 0.5,
    amarilloHasta: 1,
  });

  // El informe impreso muestra coberturas de hasta 199%.
  const MAXIMO_COBERTURA_INFORME = 1.99;

  function redondear(valor, decimales = 2) {
    const factor = 10 ** decimales;
    return Math.round((valor + Number.EPSILON) * factor) / factor;
  }

  function conjuntoNoEncontrados(mapa, maestroSet) {
    return [...mapa.keys()]
      .filter((producto) => !maestroSet.has(producto))
      .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  }

  function unirClavesStock(datosStock) {
    return new Set(datosStock.mapa.keys());
  }

  function claseCobertura(indice, consumo) {
    if (consumo <= 0 || indice === null) return "sin-consumo";
    if (indice < UMBRALES_COBERTURA.rojoHasta) return "roja";
    if (indice < UMBRALES_COBERTURA.amarilloHasta) return "amarilla";
    return "verde";
  }

  function esPrioridadBodega(fila) {
    return fila.stockFarmacia === 0 && fila.stockBodega > 0;
  }

  function incluirEnImpresion(fila) {
    // Este caso siempre debe aparecer, incluso cuando no se pueda calcular %
    // por no existir consumo durante el periodo.
    if (esPrioridadBodega(fila)) return true;

    // Los demás productos solo se imprimen hasta 199% de cobertura.
    return fila.indiceCobertura !== null &&
      fila.indiceCobertura <= MAXIMO_COBERTURA_INFORME;
  }

  function ordenarFilas(a, b) {
    const prioridadA = esPrioridadBodega(a);
    const prioridadB = esPrioridadBodega(b);

    // Primero: stock Farmacia = 0 y stock Bodega > 0.
    if (prioridadA !== prioridadB) return prioridadA ? -1 : 1;

    // Dentro del grupo prioritario, mostrar primero los que sí tienen consumo,
    // ordenados por menor cobertura; los que no tienen % quedan después.
    if (a.indiceCobertura === null && b.indiceCobertura !== null) return 1;
    if (a.indiceCobertura !== null && b.indiceCobertura === null) return -1;

    if (
      a.indiceCobertura !== null &&
      b.indiceCobertura !== null &&
      a.indiceCobertura !== b.indiceCobertura
    ) {
      return a.indiceCobertura - b.indiceCobertura;
    }

    return a.producto.localeCompare(b.producto, "es", {
      sensitivity: "base",
    });
  }

  function crearInforme(maestro, mapaConsumo, datosStock) {
    const maestroSet = new Set(maestro);
    const clavesStock = unirClavesStock(datosStock);

    const todasLasFilas = maestro.map((producto) => {
      const consumo = mapaConsumo.get(producto) || 0;
      const stock = datosStock.mapa.get(producto);
      const stockFarmacia = stock?.stockFarmacia || 0;
      const stockBodega = stock?.stockBodega || 0;
      const stockInstitucional = stock?.stockInstitucional || 0;
      const indiceCobertura = consumo > 0 ? stockFarmacia / consumo : null;

      return {
        producto,
        consumo: redondear(consumo, 2),
        stockFarmacia: redondear(stockFarmacia, 2),
        stockBodega: redondear(stockBodega, 2),
        stockInstitucional: redondear(stockInstitucional, 2),
        indiceCobertura:
          indiceCobertura === null ? null : redondear(indiceCobertura, 4),
        // Se conserva vacío para completarlo manualmente en la impresión.
        cantidadReponer: "",
        clase: claseCobertura(indiceCobertura, consumo),
        presenteConsumo: mapaConsumo.has(producto),
        presenteStock: clavesStock.has(producto),
      };
    });

    // En pantalla se muestran todos los productos. La propiedad imprimir
    // determina cuáles permanecen visibles al usar "Imprimir informe".
    const filas = todasLasFilas
      .map((fila) => ({ ...fila, imprimir: incluirEnImpresion(fila) }))
      .sort(ordenarFilas);

    const noEncontradosConsumo = conjuntoNoEncontrados(mapaConsumo, maestroSet);
    const noEncontradosStock = conjuntoNoEncontrados(datosStock.mapa, maestroSet);

    return {
      filas,
      noEncontradosConsumo,
      noEncontradosStock,
      coincidencias: todasLasFilas.filter(
        (fila) => fila.presenteConsumo || fila.presenteStock
      ).length,
      umbrales: UMBRALES_COBERTURA,
      maximoCoberturaInforme: MAXIMO_COBERTURA_INFORME,
    };
  }

  global.Calculos = Object.freeze({
    crearInforme,
    UMBRALES_COBERTURA,
    MAXIMO_COBERTURA_INFORME,
  });
})(window);
