(function (global) {
  "use strict";

  const ALIAS = Object.freeze({
    producto: ["articulo", "artículo", "producto", "descripcion", "descripción", "nombre articulo", "nombre artículo"],
    consumo: ["consumo", "cantidad", "cantidad consumo", "consumo periodo", "consumo período", "egreso", "salida", "unidades"],
    totalEnBodega: ["total en bodega"],
    stockInstitucional: ["stock institucional"],
    bodega: ["bodega"],
  });

  function asegurarSheetJS() {
    if (!global.XLSX) {
      throw new Error("No fue posible cargar la librería de lectura Excel. Revise la conexión a internet y vuelva a cargar la página.");
    }
  }

  function normalizarEspacios(valor) {
    return String(valor ?? "").trim().replace(/\s{2,}/g, " ");
  }

  function normalizarEncabezado(valor) {
    return normalizarEspacios(valor).toLocaleLowerCase("es-CL");
  }

  function normalizarBodega(valor) {
    return normalizarEncabezado(valor);
  }

  function esVacio(valor) {
    return valor === null || valor === undefined || normalizarEspacios(valor) === "";
  }

  function numeroSeguro(valor) {
    if (typeof valor === "number" && Number.isFinite(valor)) return valor;
    if (esVacio(valor)) return 0;

    let texto = normalizarEspacios(valor).replace(/\s/g, "");
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(texto)) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    } else if (/^-?\d+(,\d+)$/.test(texto)) {
      texto = texto.replace(",", ".");
    }

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
  }

  function textoPlanoDesdeContenido(contenido) {
    return String(contenido || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extraerPeriodoDesdeContenido(contenido) {
    const texto = textoPlanoDesdeContenido(contenido);
    const coincidencia = texto.match(
      /(?:^|\s)FECHA\s*:?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\s*[-–—]\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i
    );
    if (!coincidencia) return null;

    const inicio = extraerFechasDeTexto(coincidencia[1])[0] || null;
    const fin = extraerFechasDeTexto(coincidencia[2])[0] || null;
    return inicio && fin ? { inicio, fin } : null;
  }

  async function leerArchivoExcel(archivo) {
    asegurarSheetJS();
    if (!archivo) throw new Error("No se seleccionó un archivo.");
    const buffer = await archivo.arrayBuffer();

    // Rayen entrega algunos archivos .xls que en realidad son documentos HTML.
    // SheetJS lee correctamente la tabla, pero omite los textos anteriores a ella,
    // donde viene el periodo: FECHA : dd/mm/aaaa - dd/mm/aaaa.
    let contenidoFuente = "";
    try {
      contenidoFuente = new TextDecoder("utf-8").decode(buffer);
    } catch (_error) {
      contenidoFuente = "";
    }

    const libro = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
    const periodoFuente = extraerPeriodoDesdeContenido(contenidoFuente);
    if (periodoFuente) libro.__periodoConsumoRayen = periodoFuente;
    return libro;
  }

  async function leerExcelDesdeRuta(ruta) {
    asegurarSheetJS();
    const respuesta = await fetch(ruta, { cache: "no-store" });
    if (!respuesta.ok) {
      throw new Error(`No se pudo cargar ${ruta}. Código HTTP ${respuesta.status}.`);
    }
    const buffer = await respuesta.arrayBuffer();
    return XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  }

  function hojasComoMatrices(libro) {
    return libro.SheetNames.map((nombre) => ({
      nombre,
      hoja: libro.Sheets[nombre],
      filas: XLSX.utils.sheet_to_json(libro.Sheets[nombre], {
        header: 1,
        defval: "",
        raw: true,
        blankrows: false,
      }),
    }));
  }

  function coincideAlias(valor, aliases) {
    const encabezado = normalizarEncabezado(valor);
    return aliases.some((alias) => encabezado === alias);
  }

  function buscarIndiceAlias(fila, aliases) {
    return fila.findIndex((valor) => coincideAlias(valor, aliases));
  }

  function detectarEncabezadoConsumo(filas) {
    const limite = Math.min(filas.length, 35);
    for (let i = 0; i < limite; i += 1) {
      const fila = filas[i] || [];
      const producto = buscarIndiceAlias(fila, ALIAS.producto);
      const consumo = buscarIndiceAlias(fila, ALIAS.consumo);
      if (producto >= 0 && consumo >= 0 && producto !== consumo) {
        return { fila: i, producto, consumo, bodega: buscarIndiceAlias(fila, ALIAS.bodega) };
      }
    }
    return null;
  }

  function detectarEncabezadoStock(filas) {
    const limite = Math.min(filas.length, 35);
    for (let i = 0; i < limite; i += 1) {
      const fila = filas[i] || [];
      const primera = normalizarEncabezado(fila[0]);
      if (primera !== "bodega") continue;

      const producto = buscarIndiceAlias(fila, ALIAS.producto);
      const totalEnBodega = buscarIndiceAlias(fila, ALIAS.totalEnBodega);
      const stockInstitucional = buscarIndiceAlias(fila, ALIAS.stockInstitucional);

      if (producto >= 0 && totalEnBodega >= 0 && stockInstitucional >= 0) {
        return {
          fila: i,
          bodega: 0,
          producto,
          totalEnBodega,
          stockInstitucional,
        };
      }
    }
    return null;
  }

  function sumarMapa(mapa, clave, cantidad) {
    mapa.set(clave, (mapa.get(clave) || 0) + cantidad);
  }

  function leerMaestro(libro) {
    const hojas = hojasComoMatrices(libro);
    if (!hojas.length) throw new Error("El Maestro_Productos.xlsx no contiene hojas.");

    const filas = hojas[0].filas;
    let filaEncabezado = -1;
    for (let i = 0; i < Math.min(filas.length, 20); i += 1) {
      if (normalizarEncabezado(filas[i]?.[0]) === "articulo") {
        filaEncabezado = i;
        break;
      }
    }

    if (filaEncabezado < 0) {
      throw new Error('El maestro debe tener "articulo" en la celda A1 o en la primera sección de la hoja.');
    }

    const productos = [];
    const vistos = new Set();
    for (let i = filaEncabezado + 1; i < filas.length; i += 1) {
      const producto = normalizarEspacios(filas[i]?.[0]);
      if (!producto || vistos.has(producto)) continue;
      vistos.add(producto);
      productos.push(producto);
    }

    if (!productos.length) throw new Error("El maestro no contiene productos desde la columna A.");
    return productos;
  }

  function obtenerFechasDeValor(valor) {
    const fechas = [];
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
      fechas.push(new Date(valor.getFullYear(), valor.getMonth(), valor.getDate(), 12));
    }
    if (typeof valor === "string") {
      extraerFechasDeTexto(valor).forEach((fecha) => fechas.push(fecha));
    }
    return fechas;
  }

  function detectarPeriodoConsumo(filas, filaLimite) {
    const limite = Math.min(filas.length, Math.max(0, filaLimite));

    for (let i = 0; i < limite; i += 1) {
      const fila = filas[i] || [];
      const indiceFecha = fila.findIndex((valor) =>
        normalizarEncabezado(valor).replace(/:$/, "") === "fecha"
      );
      if (indiceFecha < 0) continue;

      const fechas = [];
      for (let j = indiceFecha; j < fila.length; j += 1) {
        obtenerFechasDeValor(fila[j]).forEach((fecha) => fechas.push(fecha));
      }

      fechas.sort((a, b) => a - b);
      if (fechas.length >= 2) {
        return { inicio: fechas[0], fin: fechas[fechas.length - 1] };
      }
    }

    return null;
  }

  function leerConsumo(libro) {
    const hojas = hojasComoMatrices(libro);
    let estructura = null;

    for (const candidata of hojas) {
      const encabezado = detectarEncabezadoConsumo(candidata.filas);
      if (encabezado) {
        estructura = { ...candidata, encabezado };
        break;
      }
    }

    if (!estructura) {
      throw new Error("No se identificaron automáticamente las columnas de artículo y consumo en el archivo Consumo.");
    }

    const mapa = new Map();
    const bodegasColumna = new Set();
    const { filas, encabezado } = estructura;
    const periodoDetectado = detectarPeriodoConsumo(filas, encabezado.fila);
    const fechasGenerales = extraerFechas(libro);
    const periodo = libro.__periodoConsumoRayen || periodoDetectado || (
      fechasGenerales.length >= 2
        ? { inicio: fechasGenerales[0], fin: fechasGenerales[fechasGenerales.length - 1] }
        : null
    );

    for (let i = encabezado.fila + 1; i < filas.length; i += 1) {
      const fila = filas[i] || [];
      const producto = normalizarEspacios(fila[encabezado.producto]);
      if (!producto) continue;
      sumarMapa(mapa, producto, numeroSeguro(fila[encabezado.consumo]));
      if (encabezado.bodega >= 0 && !esVacio(fila[encabezado.bodega])) {
        bodegasColumna.add(normalizarBodega(fila[encabezado.bodega]));
      }
    }

    return {
      mapa,
      libro,
      hoja: estructura.nombre,
      encabezado,
      bodegasColumna,
      textos: extraerTextos(libro),
      fechas: fechasGenerales,
      periodo,
    };
  }

  function leerStock(libro) {
    const hojas = hojasComoMatrices(libro);
    let estructura = null;

    for (const candidata of hojas) {
      const encabezado = detectarEncabezadoStock(candidata.filas);
      if (encabezado) {
        estructura = { ...candidata, encabezado };
        break;
      }
    }

    if (!estructura) {
      throw new Error('No se encontró una tabla de Stock con las columnas "Bodega", "Artículo", "Total en Bodega" y "Stock Institucional".');
    }

    const mapa = new Map();
    const bodegasEncontradas = new Set();
    const { filas, encabezado } = estructura;

    for (let i = encabezado.fila + 1; i < filas.length; i += 1) {
      const fila = filas[i] || [];
      const nombreBodega = normalizarBodega(fila[encabezado.bodega]);
      const producto = normalizarEspacios(fila[encabezado.producto]);
      if (!nombreBodega || !producto) continue;

      bodegasEncontradas.add(nombreBodega);
      if (!(nombreBodega === "farmacia" || nombreBodega.includes("farmacia"))) continue;

      const stockFarmacia = numeroSeguro(fila[encabezado.totalEnBodega]);
      const stockInstitucional = numeroSeguro(fila[encabezado.stockInstitucional]);
      const stockBodega = Math.max(0, stockInstitucional - stockFarmacia);

      mapa.set(producto, {
        stockFarmacia,
        stockBodega,
        stockInstitucional,
      });
    }

    return {
      mapa,
      bodegasEncontradas,
      hoja: estructura.nombre,
      encabezado,
    };
  }

  function extraerTextos(libro) {
    const textos = [];
    for (const nombre of libro.SheetNames) {
      const hoja = libro.Sheets[nombre];
      for (const celdaRef of Object.keys(hoja)) {
        if (celdaRef.startsWith("!")) continue;
        const valor = hoja[celdaRef]?.v;
        if (typeof valor === "string" && valor.trim()) textos.push(normalizarEspacios(valor));
      }
    }
    return textos;
  }

  function crearFechaValida(anio, mes, dia) {
    const fecha = new Date(anio, mes - 1, dia);
    if (fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia) {
      fecha.setHours(12, 0, 0, 0);
      return fecha;
    }
    return null;
  }

  function extraerFechasDeTexto(texto) {
    const fechas = [];
    const expresion = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
    let coincidencia;
    while ((coincidencia = expresion.exec(texto)) !== null) {
      let anio = Number(coincidencia[3]);
      if (anio < 100) anio += 2000;
      const fecha = crearFechaValida(anio, Number(coincidencia[2]), Number(coincidencia[1]));
      if (fecha) fechas.push(fecha);
    }
    return fechas;
  }

  function extraerFechas(libro) {
    const fechas = [];
    const claves = new Set();

    function agregar(fecha) {
      if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return;
      const limpia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12);
      const clave = `${limpia.getFullYear()}-${limpia.getMonth()}-${limpia.getDate()}`;
      if (!claves.has(clave)) {
        claves.add(clave);
        fechas.push(limpia);
      }
    }

    for (const nombre of libro.SheetNames) {
      const hoja = libro.Sheets[nombre];
      for (const celdaRef of Object.keys(hoja)) {
        if (celdaRef.startsWith("!")) continue;
        const celda = hoja[celdaRef];
        if (!celda) continue;
        if (celda.v instanceof Date) agregar(celda.v);
        if (typeof celda.v === "string") extraerFechasDeTexto(celda.v).forEach(agregar);
        if (typeof celda.w === "string") extraerFechasDeTexto(celda.w).forEach(agregar);
      }
    }

    return fechas.sort((a, b) => a - b);
  }

  global.LecturaExcel = Object.freeze({
    leerArchivoExcel,
    leerExcelDesdeRuta,
    leerMaestro,
    leerConsumo,
    leerStock,
    normalizarEspacios,
    normalizarEncabezado,
    numeroSeguro,
  });
})(window);
