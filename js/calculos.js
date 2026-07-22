(function (global) {
  "use strict";

  const UMBRALES_COBERTURA = Object.freeze({
    rojoHasta: 0.5,
    amarilloHasta: 1,
  });

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
    return new Set([...datosStock.farmacia.keys(), ...datosStock.bodega.keys()]);
  }

  function claseCobertura(indice, consumo) {
    if (consumo <= 0 || indice === null) return "sin-consumo";
    if (indice < UMBRALES_COBERTURA.rojoHasta) return "roja";
    if (indice < UMBRALES_COBERTURA.amarilloHasta) return "amarilla";
    return "verde";
  }

  function crearInforme(maestro, mapaConsumo, datosStock) {
    const maestroSet = new Set(maestro);
    const clavesStock = unirClavesStock(datosStock);

    const filas = maestro.map((producto) => {
      const consumo = mapaConsumo.get(producto) || 0;
      const stockFarmacia = datosStock.farmacia.get(producto) || 0;
      const stockBodega = datosStock.bodega.get(producto) || 0;
      const stockInstitucional = stockFarmacia + stockBodega;
      const indiceCobertura = consumo > 0 ? stockInstitucional / consumo : null;

      // Reposición interna: completar en Farmacia un periodo de consumo,
      // sin proponer más unidades que las disponibles en Bodega.
      const necesidadFarmacia = Math.max(0, consumo - stockFarmacia);
      const cantidadReponer = Math.min(stockBodega, necesidadFarmacia);

      return {
        producto,
        consumo: redondear(consumo, 2),
        stockFarmacia: redondear(stockFarmacia, 2),
        stockBodega: redondear(stockBodega, 2),
        stockInstitucional: redondear(stockInstitucional, 2),
        indiceCobertura: indiceCobertura === null ? null : redondear(indiceCobertura, 2),
        cantidadReponer: redondear(cantidadReponer, 2),
        clase: claseCobertura(indiceCobertura, consumo),
        presenteConsumo: mapaConsumo.has(producto),
        presenteStock: clavesStock.has(producto),
      };
    });

    filas.sort((a, b) => {
      if (a.indiceCobertura === null && b.indiceCobertura === null) {
        return a.producto.localeCompare(b.producto, "es", { sensitivity: "base" });
      }
      if (a.indiceCobertura === null) return 1;
      if (b.indiceCobertura === null) return -1;
      if (a.indiceCobertura !== b.indiceCobertura) return a.indiceCobertura - b.indiceCobertura;
      return a.producto.localeCompare(b.producto, "es", { sensitivity: "base" });
    });

    const noEncontradosConsumo = conjuntoNoEncontrados(mapaConsumo, maestroSet);
    const mapaStockUnificado = new Map([...datosStock.farmacia, ...datosStock.bodega]);
    const noEncontradosStock = conjuntoNoEncontrados(mapaStockUnificado, maestroSet);

    return {
      filas,
      noEncontradosConsumo,
      noEncontradosStock,
      coincidencias: filas.filter((fila) => fila.presenteConsumo || fila.presenteStock).length,
      umbrales: UMBRALES_COBERTURA,
    };
  }

  global.Calculos = Object.freeze({ crearInforme, UMBRALES_COBERTURA });
})(window);
