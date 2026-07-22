# Informe de Cobertura — Farmacia CESFAM Labranza

Aplicación web interna para generar un informe de cobertura y reposición de medicamentos a partir de archivos Excel exportados desde Rayen.

## Características

- Funciona como sitio estático en GitHub Pages.
- No utiliza servidor, backend ni base de datos.
- Los archivos `Consumo.xls` y `Stock.xls` se procesan localmente en el navegador.
- El maestro se carga automáticamente desde `datos/Maestro_Productos.xlsx`.
- Usa coincidencia exacta de nombres después de aplicar únicamente:
  - eliminación de espacios iniciales y finales;
  - reemplazo de espacios consecutivos por uno.
- No altera tildes, dosis, unidades, concentraciones ni nombres.
- Ordena el informe por índice de cobertura de menor a mayor.
- Incluye validaciones bloqueantes, advertencia de periodo y diagnóstico de nombres no encontrados.
- Incluye formato de impresión A4 vertical.

## Estructura

```text
Informe_Cobertura_Farmacia/
├── index.html
├── css/
│   └── estilo.css
├── js/
│   ├── app.js
│   ├── lecturaExcel.js
│   ├── validaciones.js
│   └── calculos.js
├── datos/
│   └── Maestro_Productos.xlsx
└── README.md
```

## Definiciones resueltas en esta versión

El documento original no incluía muestras reales de los archivos Rayen, los umbrales numéricos para los colores ni la fórmula exacta de reposición. Para entregar una aplicación funcional sin agregar configuraciones al usuario, se aplicaron estas reglas conservadoras:

### 1. Detección de columnas Rayen

La aplicación busca automáticamente, dentro de las primeras 35 filas, encabezados conocidos para:

- Producto: `articulo`, `artículo`, `producto`, `descripcion`, `descripción`, `nombre articulo`.
- Consumo: `consumo`, `cantidad`, `cantidad consumo`, `consumo periodo`, `egreso`, `salida`, `unidades`.
- Stock: `stock`, `saldo`, `existencia`, `existencias`, `cantidad`, `stock actual`.

Para Stock, la primera columna de la tabla debe llamarse exactamente `Bodega`, ignorando mayúsculas/minúsculas y espacios extremos. No existe una pantalla de configuración.

> Antes de uso productivo, se recomienda probar una exportación real de `Consumo.xls` y `Stock.xls`. Si Rayen usa encabezados distintos, deben incorporarse una sola vez en las constantes `ALIAS` de `js/lecturaExcel.js`.

### 2. Colores de cobertura

El índice expresa cuántos periodos de consumo cubre el stock institucional:

- Rojo: menor a `0,50` periodos.
- Amarillo: desde `0,50` y menor a `1,00` periodo.
- Verde: `1,00` periodo o más.
- Sin consumo: se muestra `—` y se ordena al final.

### 3. Cantidad a reponer

Se interpreta como reposición interna desde **Bodega** hacia **Farmacia** para completar un periodo de consumo:

```text
Necesidad de Farmacia = máximo(0, Consumo del periodo − Stock farmacia)
Cantidad a reponer = mínimo(Stock bodega, Necesidad de Farmacia)
```

Así, nunca se propone trasladar más unidades que las disponibles en Bodega.

### 4. Stock institucional

```text
Stock institucional = Stock farmacia + Stock bodega
```

La aplicación agrega registros repetidos del mismo producto y bodega.

## Maestro de productos

El archivo debe estar exactamente en:

```text
datos/Maestro_Productos.xlsx
```

Debe contener una sola columna:

| A |
|---|
| articulo |
| Paracetamol 500 mg comprimidos |
| Losartán 50 mg comprimidos |
| Metformina 850 mg comprimidos |

Puede agregar o eliminar productos sin modificar el código. Evite filas duplicadas y conserve los nombres exactamente como aparecen en Rayen.

## Cómo usar la aplicación

1. Abra el sitio publicado en GitHub Pages.
2. Confirme que el encabezado indique que el maestro fue cargado.
3. Seleccione `Consumo.xls`.
4. Seleccione `Stock.xls`.
5. Presione **Generar informe**.
6. Revise las advertencias y las listas de productos no encontrados.
7. Presione **Imprimir informe** para imprimir o guardar como PDF.

## Validaciones implementadas

### Consumo

- Busca si el periodo contiene la fecha del día anterior.
- Si no la contiene, muestra:

  `La fecha del consumo no corresponde al periodo esperado.`

  La generación puede continuar.

- Busca la palabra `farmacia` en la columna Bodega o en el contenido del libro.
- Si no aparece, bloquea la generación y muestra:

  `El archivo Consumo cargado no corresponde a Farmacia. Verifique el archivo seleccionado.`

### Stock

- Exige que la primera columna de la tabla detectada sea `Bodega`.
- Exige al menos un registro de bodega que contenga `farmacia`.
- Si no se cumple, bloquea la generación y muestra:

  `El archivo Stock cargado no corresponde a Farmacia. Verifique el archivo seleccionado.`

## Subir el proyecto a GitHub

1. Descomprima `Informe_Cobertura_Farmacia.zip`.
2. Ingrese a GitHub y cree un repositorio nuevo.
3. Seleccione **Add file → Upload files**.
4. Suba el contenido interno de la carpeta `Informe_Cobertura_Farmacia` de modo que `index.html` quede en la raíz del repositorio.
5. Confirme los archivos con **Commit changes**.

También puede copiar la carpeta dentro de un repositorio local y usar Git desde VS Code.

## Activar GitHub Pages

1. En el repositorio, abra **Settings**.
2. En el menú lateral, abra **Pages**.
3. En **Build and deployment**, seleccione **Deploy from a branch**.
4. Elija la rama principal, normalmente `main`.
5. Seleccione la carpeta `/ (root)`.
6. Presione **Save**.
7. GitHub mostrará la dirección pública cuando el despliegue finalice.

## Actualizar el maestro

1. Edite `Maestro_Productos.xlsx` respetando la columna `articulo`.
2. Reemplace el archivo ubicado en `datos/`.
3. Confirme el cambio en GitHub.
4. Recargue el sitio. La aplicación solicita el archivo sin caché para leer la versión actual.

## Privacidad y dependencia externa

Los archivos de Consumo y Stock se leen mediante JavaScript y no se transmiten a un servidor. La librería SheetJS se carga desde jsDelivr al abrir la página; por ello el equipo requiere conexión para iniciar la aplicación. El contenido de los Excel permanece en el navegador.

Para funcionamiento completamente desconectado, puede descargarse una copia autorizada de `xlsx.full.min.js`, guardarla dentro del repositorio y cambiar la etiqueta `<script>` de `index.html` para apuntar al archivo local.

## Solución de problemas

- **El maestro no carga:** confirme que el sitio se abrió desde GitHub Pages y que existe `datos/Maestro_Productos.xlsx` respetando mayúsculas y nombre.
- **No detecta columnas:** compare los encabezados del archivo Rayen con las listas de la sección “Detección de columnas Rayen”.
- **Aparecen productos no encontrados:** copie el nombre exacto desde Rayen al maestro. No se realizan coincidencias aproximadas.
- **El informe se ve ancho:** use orientación vertical y escala “Ajustar a página” en el cuadro de impresión del navegador.
