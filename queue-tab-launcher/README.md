<!-- Queue Tab Launcher | @author Ignacio | @built-with Claude Sonnet 4.6 (Anthropic) -->

# Queue Tab Launcher — Extensión Chrome

Detecta automáticamente la cola/campaña entrante en Contact Center y abre las pestañas de Queue Tab Launcher configuradas.

---

## Instalación

1. Abrí Chrome y andá a `chrome://extensions/`
2. Activá el **Modo desarrollador** (switch arriba a la derecha)
3. Hacé click en **"Cargar extensión sin empaquetar"**
4. Seleccioná la carpeta `queue-tab-launcher`
5. La extensión aparece en la barra de herramientas 🔥

---

## Configuración (archivo JSON)

Antes de usarla, cargá tu archivo de configuración desde el popup de la extensión.

### Estructura del JSON

```json
{
  "selector": ".queue-name-selector",
  "queues": [
    {
      "name": "Cola Ventas",
      "campaign": "VENTAS_Q1",
      "tabs": [
        { "url": "https://sistema.empresa.com/nueva-tarea", "active": true },
        { "url": "https://sistema.empresa.com/campana/ventas", "active": false },
        { "url": "https://crm.empresa.com/cliente", "active": false }
      ]
    },
    {
      "name": "Cola Soporte",
      "campaign": "SOPORTE_GENERAL",
      "tabs": [
        { "url": "https://sistema.empresa.com/nueva-tarea", "active": true },
        { "url": "https://sistema.empresa.com/campana/soporte", "active": false },
        { "url": "https://crm.empresa.com/tickets", "active": false }
      ]
    }
  ]
}
```

### Campos

| Campo | Descripción |
|-------|-------------|
| `selector` | Selector CSS del elemento HTML en Contact Center que muestra el nombre de la cola |
| `queues[].name` | Nombre exacto de la cola tal como aparece en Contact Center |
| `queues[].campaign` | Identificador de la campaña (referencia interna) |
| `queues[].tabs` | Array de hasta 5 pestañas a abrir cuando entra esa cola |
| `tabs[].url` | URL completa de la pestaña |
| `tabs[].active` | `true` si queda en foco, `false` si abre en background |

---

## Configuración (archivo CSV)

También podés usar un CSV (útil para editar en Excel):

```csv
queue_name,campaign,tab1_url,tab1_active,tab2_url,tab2_active,tab3_url,tab3_active,selector
Cola Ventas,VENTAS_Q1,https://sistema.empresa.com/nueva-tarea,true,https://sistema.empresa.com/campana/ventas,false,https://crm.empresa.com/cliente,false,.queue-name-selector
Cola Soporte,SOPORTE_GENERAL,https://sistema.empresa.com/nueva-tarea,true,https://sistema.empresa.com/campana/soporte,false,https://crm.empresa.com/tickets,false,.queue-name-selector
```

---

## Cómo encontrar el selector de Contact Center

1. Abrí Contact Center con una llamada activa (o en espera)
2. Hacé click derecho sobre el texto que muestra el nombre de la cola
3. Seleccioná **"Inspeccionar"**
4. Copiá el selector CSS del elemento (ej: `.queue-name`, `[data-queue]`, etc.)
5. Pegalo en el campo `selector` de tu JSON

---

## Cómo cargar la configuración

1. Hacé click en el ícono 🔥 de la extensión en Chrome
2. Arrastrá tu archivo JSON/CSV o hacé click en la zona de carga
3. El indicador verde confirma que está activa
4. Usá **"▶ Probar config"** para simular la primera cola

---

## Estructura de archivos

```
queue-tab-launcher/
├── manifest.json          # Config de la extensión
├── popup.html             # Interfaz del popup
├── icons/                 # Íconos de la extensión
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js      # Lógica de apertura de pestañas
    ├── content.js         # Observer del DOM de Contact Center
    └── popup.js           # Lógica del popup
```
