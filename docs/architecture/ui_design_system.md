# Tanteo Enterprise: Visual Identity & Design System

## 1. Design Philosophy: "Industrial Authority"
The visual identity of Tanteo Enterprise is built on the intersection of **High-Stakes Law** and **Industrial-Grade Technology**. It prioritizes precision, scannability, and "deep work" focus over traditional consumer-grade aesthetics.

*   **Precision:** Every element is aligned to a strict 4px grid.
*   **Authority:** Uses a "Noir" aesthetic—deep navies and charcoals—to convey security and serious intent.
*   **Density:** Leverages "Bento-style" modularity for dashboards, but maintains strict **Linear Timelines** for case histories to preserve legal context.

---

## 2. Color Palette

### 2.1. Core Brand Colors
| Role | Color Name | Hex | Usage |
| :--- | :--- | :--- | :--- |
| **Primary (Authority)** | Midnight Navy | `#0B0E14` | Main background, Sidebar, Nav. |
| **Accent (Precision)** | Law Gold | `#D4AF37` | Buttons, Active states, "listening" pulse. |
| **Support (Stability)** | Steel Blue | `#3B82F6` | Links, informational highlights. |

### 2.2. Functional Grays (Dark Mode)
| Layer | Hex | Usage |
| :--- | :--- | :--- |
| **Base** | `#0B0E14` | Global body background. |
| **Surface** | `#161B22` | Cards, Bento grid modules, Modals. |
| **Border** | `#30363D` | 1px separators (No drop shadows). |
| **Muted Text** | `#8B949E` | Labels, secondary data, metadata. |

### 2.3. Semantic Colors (WCAG 2.1 Compliant)
*   **Success (Admissible):** `#3FB950` (Brightened for dark-mode contrast)
*   **Warning (Flagged):** `#D29922` (Amber)
*   **Error (Violation):** `#F85149` (Crimson)

---

## 3. Typography

### 3.1. Primary Interface Font: **Geist Sans**
*   **Rationale:** An ultra-modern, industrial sans-serif with high x-height and distinctive glyphs (crucial for distinguishing `I`, `l`, and `1` in case citations).
*   **Usage:** UI labels, Navigation, Command Palette, Buttons.

### 3.2. Document & Analysis Font: **IBM Plex Serif**
*   **Rationale:** Conveys the authority of a traditional legal typewriter while optimized for high-resolution screens.
*   **Usage:** Legal analysis text, Case facts, Transcript view.

### 3.3. Monospace (Data & Code): **Geist Mono**
*   **Usage:** Page/Line numbers, Table of Authorities, Audit logs.

---

## 4. UI Layout Patterns

### 4.1. The "Side-by-Side" Workspace
*   **Left Pane (The Source):** 
    *   **Parchment Mode:** Background `#FDF6E3`, Text `#586E75`. Mimics a physical legal transcript.
    *   **Dark Mode:** Background `#0B0E14`, Text `#E6EDF3`. High-contrast reading mode.
*   **Right Pane (The Intelligence):** Always Dark Mode (`#0B0E14`) to anchor the "Control Center" feel.
*   **Divider:** Interactive 2px resize bar with a "Law Gold" highlight on hover.

### 4.2. Knowledge Graph Visualization
Relationships (Witnesses, Evidence) are rendered using a **Custom Force-Directed Graph** style:
*   **Nodes:** 12px Squircle icons.
*   **Edges:** Subtle `#30363D` lines with arrowheads for direction.
*   **Highlight:** Hovering a node highlights all connected edges in **Law Gold**.

### 4.3. High-Density Tables
*   **Typography:** 12px Geist Sans.
*   **Row Height:** 32px (Compact).
*   **Zebra Striping:** Muted `#161B22` for even rows.

---

## 5. Graphics & Micro-interactions

### 5.1. Iconography
*   **Set:** [Lucide React](https://lucide.dev/)
*   **Style:** 1.5px stroke width.

### 5.2. The "Listening" Pulse
*   **Trigger State:** When a node or the Smart Chat is processing, the Law Gold (`#D4AF37`) border will feature a soft `box-shadow` pulse (1.5s ease-in-out).

### 5.3. Loading States
*   **Skeleton Screens:** Use `#161B22` with a subtle shimmer effect for Bento cards and text blocks.

---

## 6. Implementation Reference (Tailwind & Shadcn)

### 6.1. Component Overrides
*   **Button:** Radius 4px (Sharp), Border 1px.
*   **Card:** Background `tanteo-surface`, Border `tanteo-border`.
*   **Input:** Focus ring `tanteo-gold`.

### 6.2. Tailwind Config
```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        tanteo: {
          navy: '#0B0E14',
          surface: '#161B22',
          gold: '#D4AF37',
          border: '#30363D',
          muted: '#8B949E',
          success: '#3FB950',
          warning: '#D29922',
          error: '#F85149'
        }
      },
      fontFamily: {
        sans: ['Geist Sans', 'Inter', 'sans-serif'],
        serif: ['IBM Plex Serif', 'serif'],
        mono: ['Geist Mono', 'monospace']
      },
      spacing: {
        'grid': '4px'
      }
    }
  }
}
```
