# HabeasGraph UI Design System

This document outlines the core visual identity and reusable components for HabeasGraph. Our design language is **"Industrial Authority."** It must feel highly secure, heavily researched, and explicitly designed for professionals engaged in deep, hours-long document review.

## Color Palette

- **Industrial Dark (Primary Surface):** `#0B0E14` (Deepest background, used for sidebars and chat backgrounds to reduce glare).
- **Secondary Surface (Bento Cards):** `#161B22` (Slightly elevated dark background for distinct modules).
- **Parchment Mode (Source Material):** `#FDF6E3` (Soft, warm off-white, drastically reduces eye strain during 4-hour transcript reading sessions).
- **Law Gold (Primary Accent):** `#D4AF37` (Signifies intelligence, automation, and critical highlights).
- **Parchment Text:** `#586E75` (Solarized base01 for high legibility without harsh black-on-white contrast).

## Semantic Indicators (The Viability Scorecard)
We use a strictly enforced traffic-light system for AI-generated legal assessments:
- **Green (High Probability):** `#3FB950` (e.g., Unobjected-to hearsay resulting in clear prejudice).
- **Amber (Moderate / Requires Review):** `#D29922` (e.g., A missing disclosure that may or may not be material).
- **Red (Low / Frivolous):** `#F85149` (e.g., A claim strictly barred by the statute of limitations).

## Signature Animations

### The "Listening Pulse"
Used during the heavy ingestion and AI-extraction phase. Rather than a standard loading spinner, the ingestion dropzone breathes with a Law Gold aura, signaling that the LangGraph agents are actively reading the documents.

**Framer Motion Implementation:**
```javascript
animate={{ 
  boxShadow: [
    "0px 0px 0px rgba(212, 175, 55, 0)", 
    "0px 0px 20px rgba(212, 175, 55, 0.5)", 
    "0px 0px 0px rgba(212, 175, 55, 0)"
  ] 
}}
transition={{ repeat: Infinity, duration: 2 }}
```
