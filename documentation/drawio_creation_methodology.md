# How to Create Accurate draw.io Diagrams from Images

A detailed methodology for converting visual diagrams into precise draw.io XML format.

---
<<< https://www.kimi.com/chat/19c02280-6fd2-89e5-8000-090d8b32c82d >> 

## Table of Contents

1. [Phase 1: Image Analysis & Information Extraction](#phase-1-image-analysis--information-extraction)
2. [Phase 2: Structural Understanding](#phase-2-structural-understanding)
3. [Phase 3: Component Inventory](#phase-3-component-inventory)
4. [Phase 4: Spatial Mapping](#phase-4-spatial-mapping)
5. [Phase 5: draw.io XML Construction](#phase-5-drawio-xml-construction)
6. [Phase 6: Connection Mapping](#phase-6-connection-mapping)
7. [Phase 7: Validation & Refinement](#phase-7-validation--refinement)

---

## Phase 1: Image Analysis & Information Extraction

### Step 1.1: Initial Visual Scan

**What to do:**
- View the entire image at full resolution
- Identify the overall diagram type (architecture, flowchart, network, etc.)
- Note the title and any header/footer information
- Identify color schemes and their meanings

**Key observations to capture:**
```
- Title: "Marketing Content Supply Chain System Landscape"
- Type: Enterprise architecture diagram with 4 phases (Plan, Build, Execute, Optimize)
- Color legend present: Yes/No
- Number of distinct colored box types
- Presence of containers/swimlanes
- Direction of flow (left-to-right, top-to-bottom, etc.)
```

### Step 1.2: Legend Decoding

**Critical step:** Identify what each color represents BEFORE cataloging components.

**Process:**
1. Locate the legend (usually in a corner)
2. Map each color to its semantic meaning
3. Create a color reference table:

| Color (hex) | Meaning | Category |
|-------------|---------|----------|
| #C8E6C9 | SAP System | Platform |
| #E1F5FE | SAP Internal Tool | Internal |
| #BBDEFB | 3rd Party System | External |
| #ECEFF1 | 3rd Party Channel | Channel |

### Step 1.3: Text Extraction

**Method:**
- Read ALL text in every box, no matter how small
- Note text hierarchy (bold titles, subtitles, body text)
- Capture special markers (*, ★, †, etc.)
- Record parenthetical notes and footnotes

**Example extraction:**
```
Box at position (x,y):
- Title: "DSR (Digital Service Request Tool)"
- Subtitle: "Digital Presence Request"
- Special markers: None
- Footnotes: None
```

---

## Phase 2: Structural Understanding

### Step 2.1: Identify Container Hierarchy

**Determine nesting levels:**

```
Level 0: Main canvas/page
  └── Level 1: Main container ("SAP BTP")
        └── Level 2: Sub-container ("Subaccount")
              └── Level 3: Service container ("SAP Build Work Zone")
                    └── Level 4: Individual components
```

**Document each container:**
- Container name/label
- Parent container (if any)
- Approximate position (top-left, center, etc.)
- Relative size (full-width, half-width, etc.)

### Step 2.2: Identify Layout Pattern

**Common patterns:**
- **Grid layout**: Equal-sized boxes in rows/columns
- **Swimlane layout**: Horizontal or vertical sections
- **Hierarchical tree**: Parent-child relationships
- **Flow layout**: Sequential left-to-right or top-to-bottom
- **Hub-and-spoke**: Central component with radiating connections

**For the example diagram:**
```
Layout: 4-column swimlane (Plan | Build | Execute | Optimize)
        + Horizontal platform bars at bottom
        + Side panel for "Systems of Record"
        + Top header for content types
```

### Step 2.3: Section Mapping

**Break the diagram into logical sections:**

```
Section A: Header (Title + Legend + Content type bars)
Section B: Top tools (floating above main content)
Section C: Phase headers (Plan, Build, Execute, Optimize)
Section D: Main content area (4 columns of components)
Section E: Bottom platform layer (horizontal bars)
Section F: Footer boxes
Section G: Systems of Record (side panel)
```

---

## Phase 3: Component Inventory

### Step 3.1: Create Component List

**For each box/shape, record:**

```json
{
  "id": "unique_identifier",
  "name": "Display text (full)",
  "type": "rectangle|rounded|circle|container|text",
  "color_category": "from legend",
  "fill_color": "#HEXCODE",
  "stroke_color": "#HEXCODE",
  "position": {
    "section": "A|B|C|D|E|F|G",
    "relative_x": "left|center|right",
    "relative_y": "top|middle|bottom",
    "column": "Plan|Build|Execute|Optimize"
  },
  "size": {
    "width_estimate": "small|medium|large",
    "height_estimate": "single-line|multi-line"
  },
  "text_content": {
    "title": "bold text",
    "subtitle": "secondary text",
    "body": "detailed description",
    "special_markers": "★, *, etc."
  },
  "parent_container": "id of parent or null"
}
```

### Step 3.2: Categorize by Shape Type

**draw.io shape types to identify:**

| Visual Shape | draw.io mxCell type | Style attribute |
|--------------|---------------------|-----------------|
| Rectangle with sharp corners | `rounded=0` | `rounded=0` |
| Rectangle with rounded corners | `rounded=1` | `rounded=1` |
| Circle/Oval | `ellipse` | `ellipse` |
| Diamond | `rhombus` | `rhombus` |
| Container with title bar | `swimlane` | `swimlane` |
| Text only | `text` | `text` |

### Step 3.3: Size Estimation

**Establish a coordinate system:**

1. Set canvas size (e.g., 3200 x 2400 for large diagrams)
2. Define base unit (e.g., 10 pixels = grid unit)
3. Estimate relative sizes:
   - Small box: ~80x40
   - Medium box: ~120x60
   - Large box: ~150x100
   - Full-width bar: ~1800x30

---

## Phase 4: Spatial Mapping

### Step 4.1: Create Coordinate Grid

**Method:**
1. Divide the image into a mental grid
2. Identify anchor points (corners, centers of major containers)
3. Measure relative positions

**Example grid for 4-column layout:**
```
Column 1 (Plan):    x = 100-300
Column 2 (Build):   x = 450-750
Column 3 (Execute): x = 950-1150
Column 4 (Optimize): x = 1300-1500
```

### Step 4.2: Position Components

**For each component, determine:**
- X coordinate (left edge)
- Y coordinate (top edge)
- Width
- Height

**Positioning strategy:**
```
1. Start with top-leftmost component
2. Work left-to-right, top-to-bottom
3. Use consistent spacing (e.g., 20px between boxes)
4. Align boxes in same row to same Y coordinate
5. Center text within boxes
```

### Step 4.3: Container Nesting

**For nested containers:**

```xml
<!-- Parent container -->
<mxCell id="parent" ...>
  <mxGeometry x="160" y="80" width="2400" height="1400" .../>
</mxCell>

<!-- Child component - positions are relative to parent if parent is swimlane -->
<mxCell id="child" parent="parent" ...>
  <mxGeometry x="20" y="10" width="2360" height="20" .../>
</mxCell>
```

---

## Phase 5: draw.io XML Construction

### Step 5.1: File Structure Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2026-01-28T00:00:00.000Z" 
        agent="YourAgent" etag="unique-id" version="22.1.0" type="device">
  <diagram name="Diagram Name" id="unique-diagram-id">
    <mxGraphModel dx="2500" dy="1800" grid="1" gridSize="10" 
                  guides="1" tooltips="1" connect="1" arrows="1" 
                  fold="1" page="1" pageScale="1" 
                  pageWidth="3200" pageHeight="2400" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        
        <!-- YOUR COMPONENTS HERE -->
        
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### Step 5.2: mxCell Element Structure

**Basic shape template:**

```xml
<mxCell id="unique_id" value="Display Text" 
        style="STYLE_ATTRIBUTES" 
        vertex="1" parent="parent_id">
  <mxGeometry x="X" y="Y" width="W" height="H" as="geometry" />
</mxCell>
```

### Step 5.3: Style Attribute Reference

**Common style combinations:**

| Element Type | Style String |
|--------------|--------------|
| Basic rounded box | `rounded=1;whiteSpace=wrap;html=1;fillColor=#E1F5FE;strokeColor=#01579B;fontSize=9;` |
| Container (swimlane) | `swimlane;whiteSpace=wrap;html=1;fillColor=#FAFAFA;strokeColor=#333333;strokeWidth=2;startSize=0;fontSize=1;` |
| Text only | `text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=12;fontColor=#333333;` |
| Circle | `ellipse;whiteSpace=wrap;html=1;fillColor=#ECEFF1;strokeColor=#455A64;fontSize=9;` |

**Style attribute key-value pairs:**

```
rounded=1              // Rounded corners (0=sharp, 1=rounded)
whiteSpace=wrap        // Text wrapping
html=1                 // Enable HTML in text
fillColor=#E1F5FE      // Background color
strokeColor=#01579B    // Border color
strokeWidth=2          // Border thickness
fontSize=9             // Text size
fontColor=#333333      // Text color
fontWeight=bold        // Bold text (in value attribute)
align=center           // Horizontal alignment
verticalAlign=middle   // Vertical alignment
startSize=30           // Height of swimlane header
```

### Step 5.4: Text Formatting

**For multi-line text with formatting:**

```xml
value="&lt;b&gt;Bold Title&lt;/b&gt;&lt;br&gt;Subtitle text&lt;br&gt;&lt;i&gt;Italic note&lt;/i&gt;"
```

**HTML entities to use:**
| Character | Entity |
|-----------|--------|
| < | `&lt;` |
| > | `&gt;` |
| & | `&amp;` |
| " | `&quot;` |
| Line break | `&lt;br&gt;` |
| Bold | `&lt;b&gt;text&lt;/b&gt;` |
| Italic | `&lt;i&gt;text&lt;/i&gt;` |

---

## Phase 6: Connection Mapping

### Step 6.1: Identify Connections

**For each arrow/line, record:**
- Source component ID
- Target component ID
- Line style (solid, dashed)
- Line color
- Presence of label/text on line
- Arrow direction (one-way, bidirectional)

### Step 6.2: Edge Element Structure

**Connection template:**

```xml
<mxCell id="edge_id" style="EDGE_STYLE" edge="1" 
        parent="parent_id" source="source_id" target="target_id">
  <mxGeometry relative="1" as="geometry">
    <!-- Optional: routing points for complex paths -->
    <Array as="points">
      <mxPoint x="X1" y="Y1" />
      <mxPoint x="X2" y="Y2" />
    </Array>
  </mxGeometry>
</mxCell>
```

### Step 6.3: Edge Styles

| Connection Type | Style String |
|-----------------|--------------|
| Solid line | `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666;strokeWidth=1;` |
| Dashed line | Add `dashed=1;` |
| Green (mutual trust) | `strokeColor=#4CAF50;` |
| With label | Add label as child mxCell |

### Step 6.4: Edge Labels

```xml
<mxCell id="edge_id" ... edge="1" ...>
  <mxGeometry relative="1" as="geometry" />
</mxCell>
<mxCell id="label_id" value="Label Text" 
        style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=9;" 
        vertex="1" connectable="0" parent="edge_id">
  <mxGeometry x="-0.5" y="-10" relative="1" as="geometry">
    <mxPoint as="offset" />
  </mxGeometry>
</mxCell>
```

### Step 6.5: Orthogonal Routing

**For connections that need to route around obstacles:**

```xml
<mxCell ... edge="1" ...>
  <mxGeometry relative="1" as="geometry">
    <Array as="points">
      <mxPoint x="intermediate_x" y="intermediate_y" />
    </Array>
  </mxGeometry>
</mxCell>
```

---

## Phase 7: Validation & Refinement

### Step 7.1: Component Count Verification

**Checklist:**
- [ ] Count all boxes in original image
- [ ] Count all boxes in XML
- [ ] Verify counts match

### Step 7.2: Connection Verification

**Checklist:**
- [ ] Every arrow in image has corresponding edge element
- [ ] Source and target IDs are correct
- [ ] Arrow directions match

### Step 7.3: Color Verification

**Checklist:**
- [ ] Each box has correct fill color
- [ ] Each box has correct stroke color
- [ ] Colors match legend definitions

### Step 7.4: Text Verification

**Checklist:**
- [ ] All text from image is present
- [ ] Formatting (bold, italic) is preserved
- [ ] Special characters are properly escaped
- [ ] Multi-line text displays correctly

### Step 7.5: Import Test

**Final validation:**
1. Save XML file with `.drawio` extension
2. Open in [diagrams.net](https://app.diagrams.net)
3. Verify visual appearance matches original
4. Check that all connections are visible
5. Verify containers nest correctly

---

## Complete Example: Single Component

**Original image element:**
- Blue rounded rectangle
- Text: "DSR (Digital Service Request Tool)" (bold)
- Subtext: "Digital Presence Request"
- Position: Top of Plan column
- Size: ~120x60

**Resulting XML:**

```xml
<mxCell id="dsr_plan" 
        value="&lt;b&gt;DSR (Digital Service&lt;/b&gt;&lt;br&gt;&lt;b&gt;Request Tool)&lt;/b&gt;&lt;br&gt;Digital Presence&lt;br&gt;Request" 
        style="rounded=1;whiteSpace=wrap;html=1;fillColor=#E1F5FE;strokeColor=#01579B;fontSize=9;" 
        vertex="1" parent="main_container">
  <mxGeometry x="100" y="150" width="120" height="60" as="geometry" />
</mxCell>
```

---

## Tips for Maximum Accuracy

1. **Work systematically**: Left-to-right, top-to-bottom
2. **Use consistent spacing**: Maintain uniform gaps between elements
3. **Group by container**: Define all containers first, then their children
4. **Label everything**: Use descriptive IDs for easier debugging
5. **Test incrementally**: Import partial diagrams to verify structure
6. **Save versions**: Keep backups as you make progress
7. **Use grid alignment**: Position elements on 10-pixel boundaries

---

## Common Pitfalls to Avoid

| Pitfall | Solution |
|---------|----------|
| Missing parent references | Always set `parent` attribute correctly |
| Incorrect coordinate system | Remember: (0,0) is top-left |
| Unescaped special characters | Use HTML entities for <, >, &, " |
| Wrong container nesting | Parent must be defined before child |
| Missing `vertex="1"` or `edge="1"` | Required for all shapes and connections |
| Overlapping text | Check fontSize and box dimensions |

---

## Tools & Resources

- **draw.io XML Schema**: [github.com/jgraph/drawio](https://github.com/jgraph/drawio)
- **Online validator**: Import to diagrams.net to validate
- **Color picker**: Use browser dev tools or image editor to sample colors
- **Grid overlay**: Use image editor with grid to estimate positions
