// js/lib/drawio-generator.js — draw.io XML generation from Gemini vision extraction

// ────────────────────────────────────────────────────────────────
// A) DRAWIO_EXTRACTION_SCHEMA  — Gemini Structured Output schema
// ────────────────────────────────────────────────────────────────

export const DIAGRAM_EXTRACTION_SCHEMA = {
  type: "OBJECT",
  description:
    "A rich, structured extraction of a diagram image. Serves as the canonical source for " +
    "multiple output formats (draw.io XML, Mermaid, SVG, PNG, text reports, chat context). " +
    "All positions use a grid-relative coordinate system (column/row indices starting at 0). " +
    "Colors should be hex codes (e.g. '#E1F5FE'). If a value is unknown, use a sensible default.",
  properties: {
    // ── Semantic / report fields ──────────────────────────────────
    diagram_type: {
      type: "STRING",
      description:
        "The category of diagram: 'architecture', 'flowchart', 'network', 'sequence', 'org_chart', 'er_diagram', 'mindmap', 'other'.",
    },
    title: {
      type: "STRING",
      description: "The title of the diagram as displayed in the image, or a short inferred title if none is visible.",
    },
    description: {
      type: "STRING",
      description:
        "2-3 sentence plain English summary of what this diagram shows, who/what the main actors are, " +
        "and what process or architecture it represents. Used in reports and chat context.",
    },
    purpose: {
      type: "STRING",
      description:
        "One sentence describing the decision, process, or system this diagram documents. " +
        "E.g. 'Shows the OAuth 2.0 authorization flow between the mobile app and identity provider.'",
    },
    keywords: {
      type: "ARRAY",
      description:
        "Domain terms, product names, and technology keywords visible or strongly implied in the diagram. " +
        "Used for search and tag suggestions. E.g. ['SAP BTP', 'OAuth', 'microservice', 'API Gateway'].",
      items: { type: "STRING" },
    },
    complexity: {
      type: "STRING",
      description: "Visual complexity of the diagram: 'simple' (< 8 components), 'moderate' (8-20), 'complex' (> 20).",
    },

    // ── Layout / draw.io geometry fields ─────────────────────────
    layout_direction: {
      type: "STRING",
      description:
        "Primary flow direction: 'TB' (top-to-bottom), 'LR' (left-to-right), 'RL' (right-to-left), 'BT' (bottom-to-top).",
    },
    grid_dimensions: {
      type: "OBJECT",
      description: "The total number of columns and rows in the logical grid that contains all elements.",
      properties: {
        columns: { type: "INTEGER", description: "Total columns in the grid." },
        rows: { type: "INTEGER", description: "Total rows in the grid." },
      },
      required: ["columns", "rows"],
    },
    legend: {
      type: "ARRAY",
      description: "Color legend entries decoded from the image. Empty array if no legend is visible.",
      items: {
        type: "OBJECT",
        properties: {
          color_hex: { type: "STRING", description: "Hex color code, e.g. '#C8E6C9'." },
          meaning: { type: "STRING", description: "What this color represents." },
        },
        required: ["color_hex", "meaning"],
      },
    },
    containers: {
      type: "ARRAY",
      description:
        "Grouping boxes, swimlanes, or regions that contain other elements. " +
        "List parent containers before their children.",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", description: "Unique identifier, e.g. 'container_1'." },
          label: { type: "STRING", description: "Visible label/title of the container." },
          parent_id: {
            type: "STRING",
            description: "ID of the parent container, or empty string if top-level.",
          },
          grid_position: {
            type: "OBJECT",
            properties: {
              col: { type: "INTEGER", description: "Starting column index (0-based)." },
              row: { type: "INTEGER", description: "Starting row index (0-based)." },
              col_span: { type: "INTEGER", description: "Number of columns this container spans." },
              row_span: { type: "INTEGER", description: "Number of rows this container spans." },
            },
            required: ["col", "row", "col_span", "row_span"],
          },
          style: {
            type: "OBJECT",
            properties: {
              fill_color: { type: "STRING", description: "Background hex color." },
              stroke_color: { type: "STRING", description: "Border hex color." },
              stroke_width: { type: "INTEGER", description: "Border width in pixels (1-3)." },
              font_size: { type: "INTEGER", description: "Label font size (8-16)." },
            },
            required: ["fill_color", "stroke_color"],
          },
        },
        required: ["id", "label", "grid_position", "style"],
      },
    },
    components: {
      type: "ARRAY",
      description: "Individual boxes, shapes, or text elements in the diagram.",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING", description: "Unique identifier, e.g. 'comp_1'." },
          label: { type: "STRING", description: "Primary/bold text inside the shape." },
          subtitle: {
            type: "STRING",
            description: "Secondary text line below the label, or empty string if none.",
          },
          role: {
            type: "STRING",
            description:
              "Semantic role of this component: 'system', 'service', 'database', 'user', " +
              "'process', 'decision', 'data', 'external', 'other'. Used in text summaries and chat.",
          },
          shape: {
            type: "STRING",
            description:
              "Shape type: 'rectangle', 'rounded_rectangle', 'ellipse', 'diamond', 'hexagon', 'cylinder', 'text'.",
          },
          parent_id: {
            type: "STRING",
            description: "ID of the container this component belongs to, or empty string if none.",
          },
          grid_position: {
            type: "OBJECT",
            properties: {
              col: { type: "INTEGER", description: "Starting column index (0-based)." },
              row: { type: "INTEGER", description: "Starting row index (0-based)." },
              col_span: { type: "INTEGER", description: "Number of columns this component spans. 1 for most components; >1 for wide/full-width elements like header bars." },
              row_span: { type: "INTEGER", description: "Number of rows this component spans. 1 for most components; >1 for tall elements." },
            },
            required: ["col", "row", "col_span", "row_span"],
          },
          style: {
            type: "OBJECT",
            properties: {
              fill_color: { type: "STRING", description: "Background hex color." },
              stroke_color: { type: "STRING", description: "Border hex color." },
              font_size: { type: "INTEGER", description: "Font size (8-14)." },
              bold: { type: "BOOLEAN", description: "Whether the label is bold." },
            },
            required: ["fill_color", "stroke_color"],
          },
        },
        required: ["id", "label", "shape", "grid_position", "style"],
      },
    },
    connections: {
      type: "ARRAY",
      description: "Arrows or lines connecting components/containers.",
      items: {
        type: "OBJECT",
        properties: {
          source_id: { type: "STRING", description: "ID of the source element." },
          target_id: { type: "STRING", description: "ID of the target element." },
          label: {
            type: "STRING",
            description: "Text label on the connection, or empty string if none.",
          },
          relationship_type: {
            type: "STRING",
            description:
              "Semantic meaning of this connection: 'depends_on', 'calls', 'data_flow', " +
              "'contains', 'extends', 'triggers', 'other'. Used by Mermaid/PlantUML renderers.",
          },
          line_style: {
            type: "STRING",
            description: "Line style: 'solid', 'dashed', 'dotted'.",
          },
          color_hex: { type: "STRING", description: "Line color hex code." },
          bidirectional: {
            type: "BOOLEAN",
            description: "True if the arrow points in both directions.",
          },
        },
        required: ["source_id", "target_id"],
      },
    },
  },
  required: [
    "diagram_type",
    "title",
    "description",
    "purpose",
    "keywords",
    "complexity",
    "layout_direction",
    "grid_dimensions",
    "containers",
    "components",
    "connections",
  ],
};

// Back-compat alias — existing callers that reference DRAWIO_EXTRACTION_SCHEMA still work
export const DRAWIO_EXTRACTION_SCHEMA = DIAGRAM_EXTRACTION_SCHEMA;

// ────────────────────────────────────────────────────────────────
// B) DRAWIO_EXTRACTION_PROMPT
// ────────────────────────────────────────────────────────────────

export const DRAWIO_EXTRACTION_PROMPT = `You are a precision diagram-extraction engine. Your job is to convert the visual diagram in this image into a rich structured JSON that serves as the canonical source for multiple outputs: draw.io XML, Mermaid diagrams, SVG/PNG exports, text reports, and chat context.

Follow these phases carefully:

## PHASE 1 — Semantic Understanding
- Identify the diagram type (architecture, flowchart, network, sequence, org_chart, er_diagram, mindmap, other)
- Read the title or infer a short descriptive one if not visible
- Write a 2-3 sentence plain English description of what this diagram shows — who/what the main actors are and what process or system it represents
- Write one sentence stating the purpose: what decision, process, or system this diagram documents
- Extract keywords: domain terms, product names, technology names visible or strongly implied
- Assess complexity: 'simple' (< 8 components), 'moderate' (8-20), 'complex' (> 20)
- Determine the primary flow direction (TB, LR, RL, BT)
- If a color legend exists, decode every entry with its exact hex color

## PHASE 2 — Container Hierarchy
- Identify ALL grouping regions, swimlanes, or bounding boxes that contain other elements
- Determine the nesting hierarchy (which containers are inside other containers)
- List parent containers BEFORE their children
- For each container record: label, colors, border style, and grid position with col_span and row_span

## PHASE 3 — Component Inventory
- Catalog EVERY individual box, shape, circle, diamond, or text element
- For each component record:
  - ALL text (primary label AND any subtitle/secondary text — read every word carefully)
  - Semantic role: 'system', 'service', 'database', 'user', 'process', 'decision', 'data', 'external', 'other'
  - Exact shape type (rectangle, rounded_rectangle, ellipse, diamond, hexagon, cylinder, text)
  - Fill color and border color (use hex codes — sample the color precisely)
  - Which container it belongs to (parent_id)
  - Grid position: col, row, col_span, row_span (most components are 1×1; wide header bars or full-width elements use col_span > 1)

## PHASE 4 — Connection Mapping
- Trace EVERY arrow and line connecting elements
- For each connection record: source, target, any label text, line style (solid/dashed/dotted), color, direction
- Also record the semantic relationship_type: 'depends_on', 'calls', 'data_flow', 'contains', 'extends', 'triggers', 'other'

## POSITIONING RULES
- Divide the diagram into a logical grid of columns and rows
- Report grid_dimensions (total columns × total rows)
- Assign each element a (col, row) position in this grid (0-based indices)
- All elements use col_span and row_span — default 1 for both unless the element visually spans multiple cells
- Be consistent: elements that are visually aligned should share the same row or column index

## CRITICAL REQUIREMENTS
- Do NOT skip any element — count every box in the image and ensure your output has the same count
- Read ALL text precisely — do not paraphrase or abbreviate labels
- Use accurate hex color codes — sample colors carefully
- Every component and container must have a unique id
- description, purpose, and keywords are required — they power reports and chat across the knowledge base`;

// ────────────────────────────────────────────────────────────────
// C) buildDrawioXml(data)  — Deterministic JSON → draw.io XML
// ────────────────────────────────────────────────────────────────

// Layout constants
const CELL_W = 160; // base cell width
const CELL_H = 80; // base cell height
const GAP_X = 30; // horizontal gap between cells
const GAP_Y = 30; // vertical gap between cells
const PADDING = 40; // canvas padding
const CONTAINER_PAD = 20; // padding inside containers
const CONTAINER_HEADER = 30; // height of container title bar

/**
 * Escapes text for XML attribute values.
 */
function xmlEsc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds the value attribute with optional bold title + subtitle.
 */
function buildLabel(label, subtitle) {
  let val = "";
  if (label) {
    val += `&lt;b&gt;${xmlEsc(label)}&lt;/b&gt;`;
  }
  if (subtitle) {
    val += `&lt;br&gt;${xmlEsc(subtitle)}`;
  }
  return val || "";
}

/**
 * Converts grid position to pixel coordinates.
 */
function gridToPixel(col, row) {
  return {
    x: PADDING + col * (CELL_W + GAP_X),
    y: PADDING + row * (CELL_H + GAP_Y),
  };
}

/**
 * Builds a style string for a component mxCell.
 */
function buildComponentStyle(comp) {
  const parts = [];
  const shape = comp.shape || "rounded_rectangle";

  switch (shape) {
    case "ellipse":
      parts.push("ellipse");
      break;
    case "diamond":
      parts.push("rhombus");
      break;
    case "hexagon":
      parts.push("shape=hexagon;perimeter=hexagonPerimeter2");
      break;
    case "cylinder":
      parts.push("shape=cylinder3;whiteSpace=wrap;boundedLbl=1;backgroundOutline=1;size=15");
      break;
    case "rectangle":
      parts.push("rounded=0");
      break;
    case "text":
      parts.push("text;strokeColor=none;fillColor=none");
      break;
    case "rounded_rectangle":
    default:
      parts.push("rounded=1");
      break;
  }

  parts.push("whiteSpace=wrap", "html=1");

  const s = comp.style || {};
  if (s.fill_color && shape !== "text") parts.push(`fillColor=${s.fill_color}`);
  if (s.stroke_color && shape !== "text") parts.push(`strokeColor=${s.stroke_color}`);
  parts.push(`fontSize=${s.font_size || 10}`);
  if (s.bold) parts.push("fontStyle=1");

  return parts.join(";") + ";";
}

/**
 * Builds a style string for a container mxCell.
 */
function buildContainerStyle(container) {
  const s = container.style || {};
  const parts = [
    "swimlane",
    "whiteSpace=wrap",
    "html=1",
    `startSize=${CONTAINER_HEADER}`,
    `fillColor=${s.fill_color || "#FAFAFA"}`,
    `strokeColor=${s.stroke_color || "#333333"}`,
    `strokeWidth=${s.stroke_width || 2}`,
    `fontSize=${s.font_size || 12}`,
    "fontStyle=1",
    "collapsible=0",
  ];
  return parts.join(";") + ";";
}

/**
 * Builds a style string for an edge mxCell.
 */
function buildEdgeStyle(conn) {
  const parts = [
    "edgeStyle=orthogonalEdgeStyle",
    "rounded=1",
    "orthogonalLoop=1",
    "jettySize=auto",
    "html=1",
    `strokeColor=${conn.color_hex || "#666666"}`,
    "strokeWidth=1",
  ];

  if (conn.line_style === "dashed") parts.push("dashed=1");
  else if (conn.line_style === "dotted") parts.push("dashed=1", "dashPattern=1 2");

  if (conn.bidirectional) {
    parts.push("startArrow=classic", "startFill=1");
  }

  return parts.join(";") + ";";
}

/**
 * Main entry point: converts Gemini extraction JSON to draw.io XML string.
 * @param {object} data - The structured extraction from Gemini.
 * @returns {string} Valid draw.io XML.
 */
export function buildDrawioXml(data) {
  if (!data) throw new Error("No extraction data provided.");

  const containers = data.containers || [];
  const components = data.components || [];
  const connections = data.connections || [];
  const title = data.title || "Diagram";

  // Build a lookup of all element IDs for parent resolution
  const allIds = new Set();
  containers.forEach((c) => allIds.add(c.id));
  components.forEach((c) => allIds.add(c.id));

  // Collect mxCells
  const cells = [];
  let cellIdCounter = 2; // 0 and 1 are reserved

  // Map from extraction id → mxCell numeric id
  const idMap = {};
  // Map from extraction id → absolute pixel origin {x, y} (for relative child positioning)
  const containerOriginMap = {};

  /**
   * Computes child-relative coordinates.
   * draw.io swimlane children use coordinates relative to the parent's top-left.
   * We subtract the parent's absolute origin and add internal offsets (padding + header).
   */
  function toRelativePos(absPos, parentExtId) {
    if (!parentExtId || !containerOriginMap[parentExtId]) return absPos;
    const parentOrigin = containerOriginMap[parentExtId];
    return {
      x: absPos.x - parentOrigin.x + CONTAINER_PAD,
      y: absPos.y - parentOrigin.y + CONTAINER_PAD + CONTAINER_HEADER,
    };
  }

  // ── Containers ──
  for (const ct of containers) {
    const numId = cellIdCounter++;
    idMap[ct.id] = numId;

    const gp = ct.grid_position || { col: 0, row: 0, col_span: 1, row_span: 1 };
    const absPos = gridToPixel(gp.col, gp.row);
    const w = gp.col_span * (CELL_W + GAP_X) - GAP_X + CONTAINER_PAD * 2;
    const h = gp.row_span * (CELL_H + GAP_Y) - GAP_Y + CONTAINER_PAD * 2 + CONTAINER_HEADER;

    // Store absolute origin for child positioning
    containerOriginMap[ct.id] = { x: absPos.x, y: absPos.y };

    const parentMxId = ct.parent_id && idMap[ct.parent_id] ? idMap[ct.parent_id] : 1;
    // If nested inside another container, make position relative to parent
    const pos = ct.parent_id && containerOriginMap[ct.parent_id]
      ? toRelativePos(absPos, ct.parent_id)
      : absPos;

    cells.push(
      `        <mxCell id="${numId}" value="${xmlEsc(ct.label)}" ` +
        `style="${buildContainerStyle(ct)}" ` +
        `vertex="1" parent="${parentMxId}">` +
        `\n          <mxGeometry x="${pos.x}" y="${pos.y}" width="${w}" height="${h}" as="geometry" />` +
        `\n        </mxCell>`
    );
  }

  // ── Components ──
  for (const comp of components) {
    const numId = cellIdCounter++;
    idMap[comp.id] = numId;

    const gp = comp.grid_position || { col: 0, row: 0, col_span: 1, row_span: 1 };
    const absPos = gridToPixel(gp.col, gp.row);

    const colSpan = gp.col_span || 1;
    const rowSpan = gp.row_span || 1;
    const w = colSpan * (CELL_W + GAP_X) - GAP_X;
    const h = rowSpan > 1
      ? rowSpan * (CELL_H + GAP_Y) - GAP_Y
      : comp.subtitle ? CELL_H : Math.round(CELL_H * 0.75);

    const parentMxId =
      comp.parent_id && idMap[comp.parent_id] ? idMap[comp.parent_id] : 1;
    // If inside a container, make position relative to parent
    const pos = comp.parent_id && containerOriginMap[comp.parent_id]
      ? toRelativePos(absPos, comp.parent_id)
      : absPos;

    const label = buildLabel(comp.label, comp.subtitle);

    cells.push(
      `        <mxCell id="${numId}" value="${label}" ` +
        `style="${buildComponentStyle(comp)}" ` +
        `vertex="1" parent="${parentMxId}">` +
        `\n          <mxGeometry x="${pos.x}" y="${pos.y}" width="${w}" height="${h}" as="geometry" />` +
        `\n        </mxCell>`
    );
  }

  // ── Connections ──
  for (const conn of connections) {
    const srcId = idMap[conn.source_id];
    const tgtId = idMap[conn.target_id];
    if (srcId === undefined || tgtId === undefined) {
      console.warn(
        `[drawio] Skipping edge: unknown source '${conn.source_id}' or target '${conn.target_id}'`
      );
      continue;
    }

    const edgeId = cellIdCounter++;

    cells.push(
      `        <mxCell id="${edgeId}" value="${xmlEsc(conn.label || "")}" ` +
        `style="${buildEdgeStyle(conn)}" ` +
        `edge="1" parent="1" source="${srcId}" target="${tgtId}">` +
        `\n          <mxGeometry relative="1" as="geometry" />` +
        `\n        </mxCell>`
    );
  }

  // ── Compute canvas size ──
  const gd = data.grid_dimensions || { columns: 6, rows: 6 };
  const pageW = Math.max(1200, PADDING * 2 + gd.columns * (CELL_W + GAP_X));
  const pageH = Math.max(800, PADDING * 2 + gd.rows * (CELL_H + GAP_Y));

  // ── Assemble XML ──
  const timestamp = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${timestamp}" agent="WebInsight" version="22.1.0" type="device">
  <diagram name="${xmlEsc(title)}" id="webinsight-drawio-export">
    <mxGraphModel dx="${pageW}" dy="${pageH}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageW}" pageHeight="${pageH}" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
${cells.join("\n")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

  return xml;
}
