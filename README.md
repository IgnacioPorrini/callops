# Queue Tab Launcher + Call Notes
### v1.5.4 · Extensión Chrome para Contact Center

> Detecta colas de llamadas entrantes, abre automáticamente las pestañas de trabajo y registra cada llamada con sus datos, comentarios y gestión.

---

## ¿Qué es?

**Queue Tab Launcher (QTL)** es una extensión de Chrome que observa en tiempo real la página del sistema de Contact Center. Cuando detecta que entró una llamada, identifica la cola, muestra un banner con la info del llamante y abre las pestañas de trabajo configuradas para esa campaña — sin que el agente tenga que hacer nada.

**Call Notes** es una aplicación local (archivo HTML) que recibe automáticamente los datos de cada llamada y permite registrar la gestión: etiqueta, comentario y notas internas. Al final de la sesión se puede exportar todo.

---

## Instalación

1. Abrir Chrome → `chrome://extensions/`
2. Activar **Modo desarrollador** (switch arriba a la derecha)
3. Click en **"Cargar extensión sin empaquetar"**
4. Seleccionar la carpeta `queue-tab-launcher`
5. La extensión aparece en la barra de herramientas

---

## Configuración rápida

### 1 — Cargar el JSON de configuración

Desde el popup de la extensión → **Arrastrá o hacé click** para cargar tu archivo `.json`.

```json
{
  "selector": ".nombre-de-clase-del-crm",
  "phone_selector": ".clase-telefono",
  "name_selector": ".clase-nombre",
  "call_notes_url": "file:///C:/ruta/a/call-notes.html",
  "queues": [
    {
      "name": "Cola Ventas",
      "tabs": [
        { "url": "https://sistema.empresa.com/gestion",  "title": "Sistema de gestión", "active": true  },
        { "url": "https://crm.empresa.com/cliente",      "title": "CRM Cliente",         "active": false }
      ]
    }
  ]
}
```

| Campo | Descripción |
|-------|-------------|
| `selector` | Selector CSS del elemento que muestra el nombre de la cola en el CRM |
| `phone_selector` | *(opcional)* Selector del teléfono del llamante |
| `name_selector` | *(opcional)* Selector del nombre del llamante |
| `call_notes_url` | Ruta al archivo `call-notes.html` |
| `queues[].name` | Nombre exacto de la cola tal como aparece en el CRM |
| `tabs[].url` | URL a abrir cuando entre esa cola |
| `tabs[].title` | *(opcional)* Nombre legible que se muestra en el banner y Call Notes |
| `tabs[].active` | `true` = la pestaña queda en foco al abrirse |

### 2 — Configurar selectores con el picker visual

Si no sabés el selector CSS del CRM, usá el picker integrado:

1. Abrí el popup → sección **Selectores** → click en **⌖ Capturar**
2. El cursor se convierte en crosshair
3. Pasá el mouse por el elemento del CRM que muestra la cola → se resalta
4. Click → el selector se guarda automáticamente

Disponible para: cola, teléfono y nombre del llamante.

---

## Extensión Chrome — Funcionalidades

### Detección automática de llamadas

- Observa el DOM del CRM con `MutationObserver`
- Se dispara **una sola vez por llamada** — no importa cuántas mutaciones ocurran mientras dura la llamada
- Resetea automáticamente cuando la llamada termina (el elemento queda vacío)

### Banner de llamada entrante

Al detectar una cola, aparece un banner flotante en la página del CRM:

```
┌─────────────────────────────────┐
│ ● Llamada entrante          [✕] │
│                                 │
│  Teléfono  │  091 234 567       │
│  Cola      │  Cola Ventas       │
│  Nombre    │  Juan Pérez        │
│                                 │
│  Sistema de gestión         [▶] │
│  CRM Cliente                [▶] │
│                                 │
│  [▶ Abrir pestañas] [Ignorar]   │
└─────────────────────────────────┘
```

- Muestra el **título** de cada pestaña (si está configurado en el JSON)
- Cada pestaña tiene su propio botón para abrirla individualmente
- El banner es **arrastrable** dentro de la pantalla
- No se cierra solo — el agente lo cierra manualmente

### Popup de la extensión

**Abrir cola** *(sección superior, expandida)*
- Buscador en tiempo real: escribís `"ven"` → solo aparece `Cola Ventas`
- Lista scrolleable para 50+ campañas
- Click en cualquier cola → abre las pestañas manualmente (sin esperar llamada)

**Selectores** *(sección colapsada)*
- Configurar/capturar selectores CSS para cola, teléfono y nombre
- Configurar la URL del archivo Call Notes
- Cada selector con indicador visual (dot de color) y botón limpiar

**Toolbar**

| Botón | Acción |
|-------|--------|
| 📋 Call Notes | Abrir Call Notes en nueva pestaña |
| Verificar | Comprobar que el content script está activo en la pestaña del CRM |
| ↓ | Exportar la config actual como JSON |
| ✏ | Abrir el editor de colas (pestaña completa) |
| ⚙ | Recargar/cambiar configuración |
| ✕ | Eliminar configuración |

### Editor de colas *(pestaña completa)*

Acceso: botón **✏** en el popup.

- Agregar, editar y eliminar colas
- Por cada cola: nombre + pestañas (título, URL, checkbox Foco)
- Agregar y eliminar pestañas individualmente
- Numeración automática `#01`, `#02`...
- Botón **✓ Guardar cambios** siempre visible (header fijo)
- Preserva el campo `campaign` si existía en el JSON original

### Atajo de teclado

| Atajo | Acción |
|-------|--------|
| `Alt+Q` | Abre el popup con el cursor directo en el buscador de colas |

> Para activarlo: `chrome://extensions/shortcuts` → Queue Tab Launcher → confirmar `Alt+Q`

---

## Call Notes — Funcionalidades

Aplicación local que se abre automáticamente al recibir cada llamada.

### Recepción automática de datos

Cuando QTL detecta una llamada, Call Notes recibe:
- **Teléfono** del llamante
- **Cola/campaña**
- **Nombre** (si está configurado el selector)
- **Horario exacto** de llegada de la llamada
- **Links** de la cola (las URLs configuradas para esa campaña)

Todo esto se inyecta automáticamente sin intervención del agente.

### Gestión de la llamada

Por cada llamada recibida:

| Campo | Descripción |
|-------|-------------|
| Datos de la llamada | Teléfono, cola y nombre — editables |
| Horario | Registrado automáticamente al recibir |
| Etiqueta | 50+ opciones predefinidas (ventas, soporte, cobranzas, reclamos, etc.) |
| Comentario | Texto libre para el comentario de gestión |
| Notas internas | Texto adicional que **no** se incluye al copiar |

### Links de la cola

Sección colapsable con los tabs configurados para esa campaña:

- Muestra el **título** (si está en el JSON) o el hostname truncado
- Click en cualquier link → abre la URL en nueva pestaña
- **↗ Abrir todos** → abre todas las URLs a la vez (pasa por el background de la extensión, sin bloqueo de popups)
- Botón **▲/▼** para colapsar/expandir la sección

### Copiar y exportar

- **Copiar campo individual**: botón junto a cada input/select
- **Copiar datos de llamada**: genera texto formateado

```
Contacto efectivo

Cliente: Juan Pérez · Tel: 091 234 567 · Cola: Ventas
El cliente consultó por el plan empresarial...
```

- **Exportar sesión**: modal con opciones CSV (Excel/Sheets), JSON (backup) o ambos
  - Incluye todos los campos: teléfono, cola, nombre, etiqueta, comentario, notas, timestamp

### Multi-llamada

- Sidebar con todas las llamadas de la sesión
- Cada item muestra: número `#01`, horario, teléfono/nombre, etiqueta activa
- Navegar entre llamadas sin perder datos

---

## Flujo completo

```
CRM (Contact Center)
  └─ content.js detecta cambio de cola
        │
        ▼
  background.js
  ├─ Abre/actualiza Call Notes con datos de la llamada
  └─ Muestra banner en la página del CRM
        │
        ▼
  Agente elige cómo continuar:
  ├─ [▶ Abrir pestañas] en el banner → abre todas
  ├─ [▶] individual en el banner → abre una sola
  ├─ [↗ Abrir todos] en Call Notes → abre todas sin bloqueador
  ├─ Click en cola desde el popup → apertura manual
  └─ Alt+Q → buscar cola → Enter → apertura rápida sin mouse
```

---

## Estructura de archivos

```
queue-tab-launcher/          ← carpeta que se carga en chrome://extensions
├── manifest.json            v1.5.4
├── popup.html               Popup de la extensión
├── editor.html              Editor de colas (pestaña completa)
├── src/
│   ├── background.js        Service Worker — detección, banner, pestañas
│   ├── popup.js             Lógica del popup
│   ├── content.js           DOM observer + picker visual + relay
│   └── editor.js            Lógica del editor de colas
├── icons/
│   └── icon16/48/128.png
└── qtl-config-default.json  Plantilla de configuración

callOps/
├── call-notes.html          Aplicación de notas de llamadas
└── qtl-mock.html            Simulador del CRM (para pruebas)
```

---

## Descargar plantillas de configuración

Desde el popup → vista Setup → **📄 JSON** o **📊 CSV**

El JSON incluye ejemplos con `title` en cada pestaña y los campos opcionales documentados.

---

*Queue Tab Launcher v1.5.4 · @author Ignacio Porrini · built with Claude Sonnet (Anthropic)*
