(function (global) {
  "use strict";

  function soloFecha(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0, 0);
  }

  function ayer() {
    const fecha = soloFecha(new Date());
    fecha.setDate(fecha.getDate() - 1);
    return fecha;
  }

  function mismaFecha(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function validarPeriodoConsumo(datosConsumo) {
    const fechaEsperada = ayer();
    const contieneAyer = datosConsumo.fechas.some((fecha) => mismaFecha(fecha, fechaEsperada));
    const primeraFecha = datosConsumo.fechas[0] || null;
    const ultimaFecha = datosConsumo.fechas.length ? datosConsumo.fechas[datosConsumo.fechas.length - 1] : null;
    const ayerDentroDelRango = primeraFecha && ultimaFecha
      ? fechaEsperada >= primeraFecha && fechaEsperada <= ultimaFecha
      : false;

    if (contieneAyer || ayerDentroDelRango) return { valido: true, advertencia: null };

    return {
      valido: true,
      advertencia: "La fecha del consumo no corresponde al periodo esperado.",
    };
  }

  function validarBodegaConsumo(datosConsumo) {
    const farmaciaEnColumna = [...datosConsumo.bodegasColumna]
      .some((valor) => valor.includes("farmacia"));
    const farmaciaEnTexto = datosConsumo.textos
      .some((valor) => valor.toLocaleLowerCase("es-CL").includes("farmacia"));

    if (farmaciaEnColumna || farmaciaEnTexto) return { valido: true };

    return {
      valido: false,
      error: "El archivo Consumo cargado no corresponde a Farmacia. Verifique el archivo seleccionado.",
    };
  }

  function validarStock(datosStock) {
    const primeraColumnaCorrecta = datosStock.encabezado?.bodega === 0;
    const contieneFarmacia = [...datosStock.bodegasEncontradas]
      .some((valor) => valor === "farmacia" || valor.includes("farmacia"));

    if (primeraColumnaCorrecta && contieneFarmacia) return { valido: true };

    return {
      valido: false,
      error: "El archivo Stock cargado no corresponde a Farmacia. Verifique el archivo seleccionado.",
    };
  }

  function validarTodo(datosConsumo, datosStock) {
    const errores = [];
    const advertencias = [];

    const periodo = validarPeriodoConsumo(datosConsumo);
    if (periodo.advertencia) advertencias.push(periodo.advertencia);

    const consumo = validarBodegaConsumo(datosConsumo);
    if (!consumo.valido) errores.push(consumo.error);

    const stock = validarStock(datosStock);
    if (!stock.valido) errores.push(stock.error);

    return { valido: errores.length === 0, errores, advertencias };
  }

  global.Validaciones = Object.freeze({ validarTodo });
})(window);
