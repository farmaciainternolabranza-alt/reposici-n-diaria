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
    configurarArrastre(ui.archivoConsumo, "consumo");
    configurarArrastre(ui.archivoStock, "stock");
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

  function configurarArrastre(input, tipo) {
    const zona = input.closest(".selector-archivo");
    if (!zona) return;

    ["dragenter", "dragover"].forEach((nombreEvento) => {
      zona.addEventListener(nombreEvento, (evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        zona.classList.add("archivo-arrastrado");
        if (evento.dataTransfer) evento.dataTransfer.dropEffect = "copy";
      });
    });

    ["dragleave", "drop"].forEach((nombreEvento) => {
      zona.addEventListener(nombreEvento, (evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        zona.classList.remove("archivo-arrastrado");
      });
    });

    zona.addEventListener("drop", (evento) => {
      const archivos = Array.from(evento.dataTransfer?.files || []);
      const archivo = archivos[0] || null;
      recibirArchivoArrastrado(tipo, input, archivo, archivos.length);
    });
  }

  function recibirArchivoArrastrado(tipo, input, archivo, cantidadArchivos) {
    limpiarMensajes();

    if (!archivo) return;

    if (cantidadArchivos > 1) {
      mostrarMensajes(["Arrastre un solo archivo en cada cuadro de carga."], "error");
      return;
    }

    if (!/\.xlsx?$/i.test(archivo.name)) {
      mostrarMensajes(["El archivo debe estar en formato .xls o .xlsx."], "error");
      return;
    }

    if (tipo === "consumo") {
      estado.archivoConsumo = archivo;
      actualizarSelector(input, ui.nombreConsumo, archivo, "Seleccionar Consumo.xls");
    } else {
      estado.archivoStock = archivo;
      actualizarSelector(input, ui.nombreStock, archivo, "Seleccionar Stock.xls");
    }

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
      const clasesFila = [
        fila.clase === "sin-consumo"
          ? "fila-sin-consumo"
          : `fila-cobertura-${fila.clase}`,
      ];
      if (!fila.imprimir) clasesFila.push("no-imprimir");
      tr.className = clasesFila.join(" ");

      tr.append(
        crearCelda(fila.producto),
        crearCelda(formatearCantidad(fila.consumo)),
        crearCelda(formatearCantidad(fila.stockFarmacia)),
        crearCelda(formatearCantidad(fila.stockBodega)),
        crearCelda(fila.indiceCobertura === null ? "—" : formatearPorcentaje(fila.indiceCobertura), "indice"),
        crearCelda("", "cantidad-reponer"),
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
    const periodoTexto = formatearPeriodoConsumo(datosConsumo.periodo, ahora);
    document.getElementById("metadatosInforme").textContent = [
      `Generado: ${fecha}`,
      `Consumo considerado: ${periodoTexto}`,
    ].join(" · ");

    ui.resultado.classList.remove("oculto");
    ui.resultado.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formatearPeriodoConsumo(periodo, fechaActual) {
    if (!periodo?.inicio || !periodo?.fin) return "Periodo no identificado";

    const hoy = new Date(
      fechaActual.getFullYear(),
      fechaActual.getMonth(),
      fechaActual.getDate(),
      12
    );
    const finOriginal = new Date(
      periodo.fin.getFullYear(),
      periodo.fin.getMonth(),
      periodo.fin.getDate(),
      12
    );
    const finMostrado = finOriginal > hoy ? hoy : finOriginal;
    const formato = new Intl.DateTimeFormat("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    return `${formato.format(periodo.inicio)} - ${formato.format(finMostrado)}`;
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

  function formatearPorcentaje(valor) {
    return `${new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor * 100)}%`;
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
