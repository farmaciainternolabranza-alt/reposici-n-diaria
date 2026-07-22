(function () {
  "use strict";

  const RUTA_MAESTRO = "datos/Maestro_Productos.xlsx";

  const estado = {
    maestro: [],
    archivoConsumo: null,
    archivoStock: null,
  };

  const ui = {};

  document.addEventListener("DOMContentLoaded", iniciar);

  function iniciar() {
    ui.estadoMaestro = document.getElementById("estadoMaestro");
    ui.archivoConsumo = document.getElementById("archivoConsumo");
    ui.archivoStock = document.getElementById("archivoStock");
    ui.nombreConsumo = document.getElementById("nombreConsumo");
    ui.nombreStock = document.getElementById("nombreStock");
    ui.botonGenerar = document.getElementById("botonGenerar");
    ui.botonLimpiar = document.getElementById("botonLimpiar");
    ui.botonImprimir = document.getElementById("botonImprimir");
    ui.mensajes = document.getElementById("mensajes");
    ui.resultado = document.getElementById("resultado");

    ui.archivoConsumo.addEventListener("change", seleccionarConsumo);
    ui.archivoStock.addEventListener("change", seleccionarStock);
    ui.botonGenerar.addEventListener("click", generarInforme);
    ui.botonLimpiar.addEventListener("click", limpiarTodo);
    ui.botonImprimir.addEventListener("click", () => window.print());

    cargarMaestro();
  }

  async function cargarMaestro() {
    cambiarEstadoMaestro("Cargando maestro de productos…", "cargando");
    try {
      const libro = await LecturaExcel.leerExcelDesdeRuta(RUTA_MAESTRO);
      estado.maestro = LecturaExcel.leerMaestro(libro);
      cambiarEstadoMaestro(`Maestro cargado: ${estado.maestro.length} productos`, "correcto");
    } catch (error) {
      estado.maestro = [];
      cambiarEstadoMaestro("Error al cargar el maestro", "error");
      mostrarMensajes([`No se pudo cargar el maestro: ${error.message}`], "error");
    } finally {
      actualizarBotonGenerar();
    }
  }

  function cambiarEstadoMaestro(texto, tipo) {
    ui.estadoMaestro.textContent = texto;
    ui.estadoMaestro.className = `estado estado-${tipo}`;
  }

  function seleccionarConsumo(evento) {
    estado.archivoConsumo = evento.target.files?.[0] || null;
    actualizarSelector(ui.archivoConsumo, ui.nombreConsumo, estado.archivoConsumo, "Seleccionar Consumo.xls");
    actualizarBotonGenerar();
  }

  function seleccionarStock(evento) {
    estado.archivoStock = evento.target.files?.[0] || null;
    actualizarSelector(ui.archivoStock, ui.nombreStock, estado.archivoStock, "Seleccionar Stock.xls");
    actualizarBotonGenerar();
  }

  function actualizarSelector(input, etiqueta, archivo, textoInicial) {
    etiqueta.textContent = archivo ? archivo.name : textoInicial;
    input.closest(".selector-archivo")?.classList.toggle("archivo-seleccionado", Boolean(archivo));
  }

  function actualizarBotonGenerar() {
    ui.botonGenerar.disabled = !(estado.maestro.length && estado.archivoConsumo && estado.archivoStock);
  }

  async function generarInforme() {
    limpiarMensajes();
    ocultarResultado();
    ui.botonGenerar.disabled = true;
    ui.botonGenerar.textContent = "Procesando…";

    try {
      const [libroConsumo, libroStock] = await Promise.all([
        LecturaExcel.leerArchivoExcel(estado.archivoConsumo),
        LecturaExcel.leerArchivoExcel(estado.archivoStock),
      ]);

      const datosConsumo = LecturaExcel.leerConsumo(libroConsumo);
      const datosStock = LecturaExcel.leerStock(libroStock);
      const validacion = Validaciones.validarTodo(datosConsumo, datosStock);

      if (!validacion.valido) {
        mostrarMensajes(validacion.errores, "error");
        return;
      }

      const informe = Calculos.crearInforme(estado.maestro, datosConsumo.mapa, datosStock);
      renderizarInforme(informe, validacion.advertencias, datosConsumo, datosStock);

      if (validacion.advertencias.length) {
        mostrarMensajes(validacion.advertencias, "advertencia");
      } else {
        mostrarMensajes(["Archivos validados e informe generado correctamente."], "correcto");
      }
    } catch (error) {
      console.error(error);
      mostrarMensajes([error.message || "Ocurrió un error inesperado al procesar los archivos."], "error");
    } finally {
      ui.botonGenerar.textContent = "Generar informe";
      actualizarBotonGenerar();
    }
  }

  function renderizarInforme(informe, advertencias, datosConsumo, datosStock) {
    const tbody = document.querySelector("#tablaInforme tbody");
    tbody.replaceChildren();

    const fragmento = document.createDocumentFragment();
    for (const fila of informe.filas) {
      const tr = document.createElement("tr");
      tr.className = fila.clase === "sin-consumo"
        ? "fila-sin-consumo"
        : `fila-cobertura-${fila.clase}`;

      tr.append(
        crearCelda(fila.producto),
        crearCelda(formatearCantidad(fila.consumo)),
        crearCelda(formatearCantidad(fila.stockFarmacia)),
        crearCelda(formatearCantidad(fila.stockBodega)),
        crearCelda(formatearCantidad(fila.stockInstitucional)),
        crearCelda(fila.indiceCobertura === null ? "—" : formatearDecimal(fila.indiceCobertura), "indice"),
        crearCelda(formatearCantidad(fila.cantidadReponer)),
      );
      fragmento.appendChild(tr);
    }
    tbody.appendChild(fragmento);

    document.getElementById("totalMaestro").textContent = informe.filas.length.toLocaleString("es-CL");
    document.getElementById("totalCoincidencias").textContent = informe.coincidencias.toLocaleString("es-CL");
    document.getElementById("totalNoConsumo").textContent = informe.noEncontradosConsumo.length.toLocaleString("es-CL");
    document.getElementById("totalNoStock").textContent = informe.noEncontradosStock.length.toLocaleString("es-CL");

    renderizarLista("listaNoConsumo", informe.noEncontradosConsumo);
    renderizarLista("listaNoStock", informe.noEncontradosStock);
    renderizarAdvertencias(advertencias);

    const ahora = new Date();
    const fecha = new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short" }).format(ahora);
    document.getElementById("metadatosInforme").textContent = [
      `Generado: ${fecha}`,
      `Consumo: ${estado.archivoConsumo.name} (${datosConsumo.hoja})`,
      `Stock: ${estado.archivoStock.name} (${datosStock.hoja})`,
    ].join(" · ");

    ui.resultado.classList.remove("oculto");
    ui.resultado.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function crearCelda(texto, clase = "") {
    const td = document.createElement("td");
    td.textContent = texto;
    if (clase) td.className = clase;
    return td;
  }

  function formatearCantidad(valor) {
    return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(valor);
  }

  function formatearDecimal(valor) {
    return new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
  }

  function renderizarLista(id, productos) {
    const lista = document.getElementById(id);
    lista.replaceChildren();

    if (!productos.length) {
      const li = document.createElement("li");
      li.className = "sin-resultados";
      li.textContent = "Sin productos no encontrados.";
      lista.appendChild(li);
      return;
    }

    const fragmento = document.createDocumentFragment();
    for (const producto of productos) {
      const li = document.createElement("li");
      li.textContent = producto;
      fragmento.appendChild(li);
    }
    lista.appendChild(fragmento);
  }

  function renderizarAdvertencias(advertencias) {
    const contenedor = document.getElementById("advertenciasInforme");
    contenedor.replaceChildren();
    for (const advertencia of advertencias) {
      const p = document.createElement("p");
      p.className = "advertencia-item";
      p.textContent = advertencia;
      contenedor.appendChild(p);
    }
  }

  function mostrarMensajes(mensajes, tipo) {
    for (const texto of mensajes) {
      const p = document.createElement("p");
      p.className = `mensaje mensaje-${tipo}`;
      p.textContent = texto;
      ui.mensajes.appendChild(p);
    }
  }

  function limpiarMensajes() {
    ui.mensajes.replaceChildren();
  }

  function ocultarResultado() {
    ui.resultado.classList.add("oculto");
  }

  function limpiarTodo() {
    estado.archivoConsumo = null;
    estado.archivoStock = null;
    ui.archivoConsumo.value = "";
    ui.archivoStock.value = "";
    actualizarSelector(ui.archivoConsumo, ui.nombreConsumo, null, "Seleccionar Consumo.xls");
    actualizarSelector(ui.archivoStock, ui.nombreStock, null, "Seleccionar Stock.xls");
    limpiarMensajes();
    ocultarResultado();
    actualizarBotonGenerar();
  }
})();
